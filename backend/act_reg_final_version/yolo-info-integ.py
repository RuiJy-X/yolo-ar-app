import glob
import os
import time
from collections import deque

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from feeders import tools
from model.sode import SODE
from utils import import_class

# --- CONFIGURATION ---
# yolo26n-pose.pt , yolo11n-pose.pt pretrained 
#  "yolo-best.pt"
YOLO_PATH = "yolo-best.pt"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
WINDOW_SIZE = 32
MODEL_NUM_POINTS = 12
ACTION_MAP = {0: "sitting", 1: "standing", 2: "waving", 3: "walking"}
VISIBILITY_THRESH = 0.20
MIN_FRAMES_FOR_INFERENCE = 16
DISPLAY_CONF_THRESH = 0.55
SCORE_EMA_ALPHA = 0.75
YOLO_CONF = 0.60
YOLO_IOU = 0.60
TEST_TTA_SHIFTS = [0, -3, -1, 1, 3]

# Keep these in sync with feeder mirror logic.
LR_PAIRS = [(0, 1), (2, 3), (4, 5), (6, 7), (8, 9), (10, 11)]
BODY12_FROM_COCO17 = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]

# Multi-color skeleton connections (joint indices in model body12 order)
SKELETON_EDGES = [
    (0, 1, (0, 255, 0)),
    (0, 6, (0, 255, 0)),
    (1, 7, (0, 255, 0)),
    (6, 7, (0, 255, 0)),
    (0, 2, (255, 0, 0)),
    (2, 4, (255, 0, 0)),
    (1, 3, (255, 0, 0)),
    (3, 5, (255, 0, 0)),
    (6, 8, (0, 0, 255)),
    (8, 10, (0, 0, 255)),
    (7, 9, (0, 0, 255)),
    (9, 11, (0, 0, 255)),
]


def pick_deployment_checkpoint():
    # Prefer best_model from the fold with highest validation report accuracy.
    report_paths = sorted(glob.glob("results/uav_transfer/fold_*/epoch_*_report.csv"))
    best_path = None
    best_acc = -1.0
    best_fold = None

    for p in report_paths:
        try:
            with open(p, "r", newline="") as f:
                rows = [line.strip().split(",") for line in f if line.strip()]
        except Exception:
            continue
        acc_rows = [r for r in rows if r and r[0] == "accuracy"]
        if not acc_rows:
            continue
        try:
            acc = float(acc_rows[0][3])
        except Exception:
            continue
        if acc > best_acc:
            best_acc = acc
            best_fold = os.path.basename(os.path.dirname(p))

    if best_fold:
        candidate = os.path.join("results", "uav_transfer", best_fold, "best_model.pt")
        if os.path.exists(candidate):
            print(f"Using deployment checkpoint: {candidate} (best_report_acc={best_acc:.4f})")
            return candidate

    fallback = os.path.join("results", "uav_transfer", "fold_1", "best_model.pt")
    if os.path.exists(fallback):
        print(f"Using fallback deployment checkpoint: {fallback}")
        return fallback

    raise FileNotFoundError("No suitable deployment checkpoint found under results/uav_transfer")


def coco17_to_body12(coco_kpts):
    out = np.zeros((MODEL_NUM_POINTS, 3), dtype=np.float32)
    if coco_kpts is None or len(coco_kpts) < 17:
        return out
    for i, src in enumerate(BODY12_FROM_COCO17):
        if src < len(coco_kpts):
            out[i] = coco_kpts[src].astype(np.float32)
    return out


def stabilize_keypoints(current, last_valid):
    stabilized = current.copy()
    for j in range(MODEL_NUM_POINTS):
        if current[j, 2] < VISIBILITY_THRESH:
            stabilized[j, 0:2] = last_valid[j, 0:2]
            # Keep confidence low if it was imputed.
            stabilized[j, 2] = 0.0
        else:
            last_valid[j] = current[j]
    return stabilized


def build_model_input(window):
    # window shape: (T, V, 3)
    n = window.shape[0]
    if n >= WINDOW_SIZE:
        idx = np.linspace(0, n - 1, WINDOW_SIZE).astype(int)
        sampled = window[idx]
    else:
        # For early frames, keep recent evidence at the tail, zero-pad the prefix.
        sampled = np.zeros((WINDOW_SIZE, MODEL_NUM_POINTS, 3), dtype=np.float32)
        sampled[-n:] = window

    data = sampled.transpose(2, 0, 1)  # (3, T, V)
    data = np.expand_dims(data, axis=-1)  # (3, T, V, 1)
    data = tools.normalize_skeleton(data)
    return torch.from_numpy(data).float().unsqueeze(0)


def mirror_tensor(inp):
    # inp: (N, C, T, V, M)
    x = inp.clone()
    x[:, 0] = -x[:, 0]  # mirror x-coordinate
    for l, r in LR_PAIRS:
        tmp = x[:, :, :, l, :].clone()
        x[:, :, :, l, :] = x[:, :, :, r, :]
        x[:, :, :, r, :] = tmp
    return x


def non_cyclic_shift(inp, shift):
    if shift == 0:
        return inp
    out = inp.clone()
    T = inp.shape[2]
    k = min(abs(int(shift)), T)
    if k == 0:
        return inp
    if shift > 0:
        out[:, :, k:, :, :] = inp[:, :, : T - k, :, :]
        out[:, :, :k, :, :] = inp[:, :, :1, :, :]
    else:
        out[:, :, : T - k, :, :] = inp[:, :, k:, :, :]
        out[:, :, T - k :, :, :] = inp[:, :, -1:, :, :]
    return out


def infer_probs_with_tta(model, input_tensor):
    def logits(x):
        out = model(x)
        if isinstance(out, tuple):
            out = out[0]
        return out

    logits_list = [logits(input_tensor)]
    logits_list.append(logits(mirror_tensor(input_tensor)))
    for s in TEST_TTA_SHIFTS:
        if s == 0:
            continue
        logits_list.append(logits(non_cyclic_shift(input_tensor, s)))

    avg_logits = torch.stack(logits_list, dim=0).mean(dim=0)
    probs = torch.softmax(avg_logits, dim=1).detach().cpu().numpy()
    return probs


def init_action_model(checkpoint_path):
    Graph = import_class("graph.body12.Graph")
    graph_obj = Graph(labeling_mode="spatial")
    A_tensor = torch.tensor(graph_obj.A, dtype=torch.float32)

    model = SODE(
        num_class=4,
        num_point=MODEL_NUM_POINTS,
        num_person=1,
        graph=A_tensor,
        in_channels=3,
        num_head=3,
        k=8,
        base_channel=64,
        T=WINDOW_SIZE,
        dilation=1,
        dual_branch=True,
        static_branch_weight=0.34,
        device=DEVICE,
    )

    state = torch.load(checkpoint_path, map_location=DEVICE)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]

    missing, unexpected = model.load_state_dict(state, strict=False)
    print(f"Loaded model: {checkpoint_path}")
    if missing:
        print(f"Warning: missing keys count={len(missing)}")
    if unexpected:
        print(f"Warning: unexpected keys count={len(unexpected)}")

    model.to(DEVICE).eval()
    return model


def run_on_webcam():
    checkpoint_path = pick_deployment_checkpoint()
    yolo_model = YOLO(YOLO_PATH).to(DEVICE)
    action_model = init_action_model(checkpoint_path)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam")

    person_buffers = {}
    person_actions = {}
    person_score_ema = {}
    person_last_valid_kpts = {}
    prev_time = time.time()

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break

        result = yolo_model.track(source=frame, conf=YOLO_CONF, iou=YOLO_IOU, persist=True, verbose=False)
        annotated = frame.copy()
        active_ids = set()

        if result and result[0].boxes.id is not None and result[0].keypoints is not None:
            # Work on GPU tensors first and only copy the minimal subset (people)
            boxes_all = result[0].boxes.xyxy
            ids_all = result[0].boxes.id
            kpts_all = result[0].keypoints.data
            cls_all = getattr(result[0].boxes, "cls", None)

            # Determine which detections are people (COCO person class == 0).
            if cls_all is not None:
                person_mask = cls_all.int() == 0
            else:
                person_mask = torch.ones(ids_all.shape, dtype=torch.bool, device=ids_all.device)

            if bool(person_mask.any().item()):
                boxes = boxes_all[person_mask].detach().cpu().numpy()
                track_ids = ids_all[person_mask].int().detach().cpu().numpy()
                keypoints_data = kpts_all[person_mask].detach().cpu().numpy()
            else:
                boxes = np.empty((0, 4), dtype=np.float32)
                track_ids = np.empty((0,), dtype=np.int32)
                keypoints_data = np.empty((0, 17, 3), dtype=np.float32)

            infer_tids = []
            infer_inputs = []
            render_items = []

            for i, tid in enumerate(track_ids):
                tid = int(tid)
                active_ids.add(tid)
                x1, y1, x2, y2 = map(int, boxes[i])

                body_kpts = coco17_to_body12(keypoints_data[i])

                if tid not in person_last_valid_kpts:
                    person_last_valid_kpts[tid] = body_kpts.copy()
                stabilized = stabilize_keypoints(body_kpts, person_last_valid_kpts[tid])

                if tid not in person_buffers:
                    person_buffers[tid] = deque(maxlen=WINDOW_SIZE)
                    person_actions[tid] = "Detecting..."
                    person_score_ema[tid] = np.ones(4, dtype=np.float32) / 4.0

                person_buffers[tid].append(stabilized)

                if len(person_buffers[tid]) >= MIN_FRAMES_FOR_INFERENCE:
                    window = np.asarray(person_buffers[tid], dtype=np.float32)
                    infer_inputs.append(build_model_input(window))
                    infer_tids.append(tid)

                render_items.append((tid, x1, y1, x2, y2, stabilized))

            if infer_inputs:
                inp_batch = torch.cat(infer_inputs, dim=0).to(DEVICE)
                with torch.no_grad():
                    probs_batch = infer_probs_with_tta(action_model, inp_batch)

                for tid, probs in zip(infer_tids, probs_batch):
                    person_score_ema[tid] = (
                        SCORE_EMA_ALPHA * person_score_ema[tid] + (1.0 - SCORE_EMA_ALPHA) * probs
                    )
                    pred_idx = int(np.argmax(person_score_ema[tid]))
                    conf = float(person_score_ema[tid][pred_idx])

                    if conf >= DISPLAY_CONF_THRESH:
                        person_actions[tid] = f"{ACTION_MAP[pred_idx]} ({conf:.1%})"
                    else:
                        person_actions[tid] = "Analyzing..."

            for tid, x1, y1, x2, y2, stabilized in render_items:

                cv2.rectangle(annotated, (x1, y1), (x2, y2), (255, 255, 255), 1)
                cv2.putText(
                    annotated,
                    f"ID {tid}: {person_actions[tid]}",
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2,
                )

                for j1, j2, color in SKELETON_EDGES:
                    p1 = tuple(map(int, stabilized[j1][:2]))
                    p2 = tuple(map(int, stabilized[j2][:2]))
                    if stabilized[j1][2] > 0.1 and stabilized[j2][2] > 0.1:
                        cv2.line(annotated, p1, p2, color, 2)

                for j in range(MODEL_NUM_POINTS):
                    x, y, c = stabilized[j]
                    if c > 0.1:
                        cv2.circle(annotated, (int(x), int(y)), 4, (255, 255, 255), -1)
                        cv2.putText(
                            annotated,
                            str(j),
                            (int(x) + 5, int(y) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.4,
                            (0, 255, 0),
                            1,
                        )

        for tid in tuple(person_buffers.keys()):
            if tid not in active_ids:
                del person_buffers[tid]
                del person_actions[tid]
                del person_score_ema[tid]
                del person_last_valid_kpts[tid]

        fps = 1.0 / (time.time() - prev_time + 1e-6)
        prev_time = time.time()
        cv2.putText(annotated, f"FPS: {int(fps)}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.imshow("Action Recognition System", annotated)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    run_on_webcam()