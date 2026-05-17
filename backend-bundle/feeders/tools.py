import numpy as np
import torch
import torch.nn.functional as F

def normalize_skeleton(data_numpy):
    C, T, V, M = data_numpy.shape
    out = data_numpy.copy().astype(np.float32)

    # Fast path for real-time inference (single person).
    if M == 1:
        xy = out[0:2, :, :, 0]  # (2, T, V)
        vis = (np.abs(xy[0]) + np.abs(xy[1])) > 1e-6  # (T, V)

        l_hip_vis = vis[:, 6]
        r_hip_vis = vis[:, 7]
        roots = np.zeros((T, 2), dtype=np.float32)

        both_hips = l_hip_vis & r_hip_vis
        if np.any(both_hips):
            roots[both_hips] = ((xy[:, both_hips, 6] + xy[:, both_hips, 7]) * 0.5).T

        # Fall back to visible-joint mean when both hips are unavailable.
        for t in np.where(~both_hips)[0]:
            vis_t = vis[t]
            if np.any(vis_t):
                roots[t] = np.mean(xy[:, t, vis_t], axis=1)

        out[0:2, :, :, 0] -= roots.T[:, :, None]

        xy_centered = out[0:2, :, :, 0]
        vis0 = (np.abs(xy_centered[0, :, 0]) + np.abs(xy_centered[1, :, 0])) > 1e-6
        vis1 = (np.abs(xy_centered[0, :, 1]) + np.abs(xy_centered[1, :, 1])) > 1e-6
        vis6 = (np.abs(xy_centered[0, :, 6]) + np.abs(xy_centered[1, :, 6])) > 1e-6
        vis7 = (np.abs(xy_centered[0, :, 7]) + np.abs(xy_centered[1, :, 7])) > 1e-6

        sho = (xy_centered[:, :, 0] + xy_centered[:, :, 1]) * 0.5
        hip = (xy_centered[:, :, 6] + xy_centered[:, :, 7]) * 0.5
        d = np.linalg.norm(sho - hip, axis=0)
        d_valid = vis0 & vis1 & vis6 & vis7 & np.isfinite(d) & (d > 1e-4)

        if np.any(d_valid):
            scale = float(np.median(d[d_valid]))
        else:
            vis_all = (np.abs(out[0, :, :, 0]) + np.abs(out[1, :, :, 0])) > 1e-6
            if np.any(vis_all):
                vals = np.abs(out[0:2, :, :, 0][:, vis_all])
                scale = float(np.percentile(vals, 90)) if vals.size > 0 else 1.0
            else:
                scale = 1.0

        out[0:2] /= max(scale, 1e-2)
        return out

    # Center each frame/person using hips when available, else visible-joint mean.
    for t in range(T):
        for m in range(M):
            xy = out[0:2, t, :, m]
            vis = (np.abs(xy[0]) + np.abs(xy[1])) > 1e-6

            l_hip_vis = (np.abs(xy[0, 6]) + np.abs(xy[1, 6])) > 1e-6
            r_hip_vis = (np.abs(xy[0, 7]) + np.abs(xy[1, 7])) > 1e-6

            if l_hip_vis and r_hip_vis:
                root = (xy[:, 6] + xy[:, 7]) / 2.0
            elif np.any(vis):
                root = np.mean(xy[:, vis], axis=1)
            else:
                root = np.array([0.0, 0.0], dtype=np.float32)

            out[0:2, t, :, m] -= root.reshape(2, 1)

    # Estimate body scale from valid shoulder-hip distance across time.
    scales = []
    for t in range(T):
        for m in range(M):
            xy = out[0:2, t, :, m]
            vis0 = (np.abs(xy[0, 0]) + np.abs(xy[1, 0])) > 1e-6
            vis1 = (np.abs(xy[0, 1]) + np.abs(xy[1, 1])) > 1e-6
            vis6 = (np.abs(xy[0, 6]) + np.abs(xy[1, 6])) > 1e-6
            vis7 = (np.abs(xy[0, 7]) + np.abs(xy[1, 7])) > 1e-6
            if vis0 and vis1 and vis6 and vis7:
                sho = (xy[:, 0] + xy[:, 1]) / 2.0
                hip = (xy[:, 6] + xy[:, 7]) / 2.0
                d = float(np.linalg.norm(sho - hip))
                if np.isfinite(d) and d > 1e-4:
                    scales.append(d)

    if scales:
        scale = float(np.median(scales))
    else:
        # Fallback: robust spread of visible coordinates.
        vis_all = (np.abs(out[0]) + np.abs(out[1])) > 1e-6
        if np.any(vis_all):
            vals = np.abs(out[0:2][np.stack([vis_all, vis_all], axis=0)])
            scale = float(np.percentile(vals, 90)) if vals.size > 0 else 1.0
        else:
            scale = 1.0

    scale = max(scale, 1e-2)
    out[0:2] /= scale
    return out

def valid_crop_resize(data_numpy, valid_frame_num, p_interval, window):
    C, T, V, M = data_numpy.shape
    begin = 0
    end = valid_frame_num
    valid_size = end - begin

    if len(p_interval) == 1:
        p = p_interval[0]
        bias = int((1-p) * valid_size/2)
        data = data_numpy[:, begin+bias:end-bias, :, :]
    else:
        p = np.random.rand(1)*(p_interval[1]-p_interval[0])+p_interval[0]
        cropped_length = np.minimum(np.maximum(int(np.floor(valid_size*p)), 1), valid_size)
        bias = np.random.randint(0, valid_size-cropped_length+1)
        data = data_numpy[:, begin+bias:begin+bias+cropped_length, :, :]

    data = torch.tensor(data, dtype=torch.float)
    data = data.permute(0, 2, 3, 1).contiguous().view(C * V * M, data.shape[1])
    data = data[None, None, :, :]
    data = F.interpolate(data, size=(C * V * M, window), mode='bilinear', align_corners=False).squeeze()
    return data.contiguous().view(C, V, M, window).permute(0, 3, 1, 2).contiguous().numpy()

def random_rot(data_numpy, theta=0.2):
    C, T, V, M = data_numpy.shape
    angle = np.random.uniform(-theta, theta)
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    R = np.array([[cos_a, -sin_a], [sin_a, cos_a]])
    for t in range(T):
        for m in range(M):
            data_numpy[0:2, t, :, m] = np.dot(R, data_numpy[0:2, t, :, m])
    return data_numpy

def random_jitter(data_numpy, snr=0.001): # Reduced noise to prevent Waving bias
    C, T, V, M = data_numpy.shape
    noise = (np.random.rand(2, T, V, M) - 0.5) * snr
    data_numpy[0:2, :, :, :] += noise
    return data_numpy