import numpy as np
import pickle
from torch.utils.data import Dataset
from . import tools

class Feeder(Dataset):
    def __init__(self, data_path, label_path=None, p_interval=[1], split='train', random_rot=False, window_size=32, feature_mode='xyz_bone_vel'):
        self.data_path = data_path
        self.label_path = label_path
        self.p_interval = p_interval
        self.split = split
        self.random_rot = random_rot
        self.window_size = window_size
        self.feature_mode = feature_mode
        self.load_data()

    def load_data(self):
        self.data = np.load(self.data_path)
        if self.label_path is None:
            self.label_path = self.data_path.replace('data.npy', 'label.pkl')
        with open(self.label_path, 'rb') as f:
            self.label = pickle.load(f)

    def __len__(self):
        return len(self.label)

    def __getitem__(self, index):
        # 1. Load raw data: (3, T, 12, 1)
        data_numpy = np.array(self.data[index]) 
        label = self.label[index]

        # 2. Crop/resize in time before feature construction.
        any_data = (data_numpy != 0).any(axis=(0, 2, 3))
        valid_frame_num = int(np.sum(any_data)) if np.sum(any_data) != 0 else data_numpy.shape[1]
        current_p = self.p_interval
        if self.split == 'train':
            if label == 0:
                # Keep more early context to preserve sit-down transition cues.
                current_p = [0.55, 1.0]
            elif label == 1:
                # Standing needs broader context than pure tail-only crops.
                current_p = [0.80, 1.0]
            elif label == 2:
                # Waving remains dynamic, but avoid over-aggressive crop jitter.
                current_p = [0.78, 1.0]
            else:
                # Walking is dynamic but less periodic than waving.
                current_p = [0.75, 1.0]
        data_numpy = tools.valid_crop_resize(
            data_numpy, valid_frame_num, current_p, self.window_size)

        # 3. Normalize the skeleton after temporal cropping.
        data_numpy = tools.normalize_skeleton(data_numpy)

        if self.split == 'train':
            if self.random_rot:
                rot_theta = 0.06 if label in (0, 1) else (0.18 if label == 2 else 0.2)
                data_numpy = tools.random_rot(data_numpy, theta=rot_theta)

            scale = np.random.uniform(0.985, 1.015) if label in (0, 1) else np.random.uniform(0.95, 1.05)
            data_numpy[0:2] *= scale
            jitter_snr = 0.00035 if label in (0, 1) else (0.0009 if label == 2 else 0.001)
            data_numpy = tools.random_jitter(data_numpy, snr=jitter_snr)

        # 4. Optional multi-stream feature construction.
        if self.feature_mode == 'xyz':
            data_combined = data_numpy
        else:
            # BONE STREAM (3 Channels)
            pairs = ((0,1), (0,2), (1,3), (2,4), (0,5), (0,6), (5,7), (6,8), (7,9), (8,10), (5,11), (6,11))
            bone_data = np.zeros_like(data_numpy)
            for v1, v2 in pairs:
                bone_data[:, :, v1, :] = data_numpy[:, :, v1, :] - data_numpy[:, :, v2, :]

            # VELOCITY STREAM (3 Channels)
            velocity_data = np.zeros_like(data_numpy)
            velocity_data[:, 1:, :, :] = data_numpy[:, 1:, :, :] - data_numpy[:, :-1, :, :]

            # CONCATENATE INTO 9 CHANNELS
            data_combined = np.concatenate([data_numpy, bone_data, velocity_data], axis=0)

        # 5. Optional horizontal mirror augmentation.
        # NOTE: axis=1 is time, so never reverse it for a spatial flip.
        if self.split == 'train' and np.random.random() > 0.5:
            data_combined = data_combined.copy()

            # Mirror x-coordinate channels: x, bone-x, velocity-x when present.
            x_channels = [c for c in (0, 3, 6) if c < data_combined.shape[0]]
            for c in x_channels:
                data_combined[c] *= -1.0

            # Swap left/right joints to keep anatomically consistent mirrored poses.
            lr_pairs = [(0, 1), (2, 3), (4, 5), (6, 7), (8, 9), (10, 11)]
            for l, r in lr_pairs:
                tmp = data_combined[:, :, l, :].copy()
                data_combined[:, :, l, :] = data_combined[:, :, r, :]
                data_combined[:, :, r, :] = tmp

        return data_combined, label, index