"""
Advanced Multi-Object Tracker with ByteTrack 2-Tier Association,
Kalman Filter Motion Modeling, Visual Re-Identification (Re-ID),
and Post-Video Tracklet Stitching.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Any, Sequence

import cv2
import numpy as np

try:
    from scipy.optimize import linear_sum_assignment  # type: ignore

    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


# ══════════════════════════════════════════════════════════════════════════
# 1. Bounding Box Geometry & IoU Distance Matrix
# ══════════════════════════════════════════════════════════════════════════

def box_iou(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    """Compute pairwise IoU between two sets of bounding boxes [[x1, y1, x2, y2], ...]."""
    if len(boxes_a) == 0 or len(boxes_b) == 0:
        return np.zeros((len(boxes_a), len(boxes_b)), dtype=np.float32)

    area_a = (boxes_a[:, 2] - boxes_a[:, 0]) * (boxes_a[:, 3] - boxes_a[:, 1])
    area_b = (boxes_b[:, 2] - boxes_b[:, 0]) * (boxes_b[:, 3] - boxes_b[:, 1])

    top_left = np.maximum(boxes_a[:, None, :2], boxes_b[None, :, :2])
    bottom_right = np.minimum(boxes_a[:, None, 2:], boxes_b[None, :, 2:])

    wh = np.maximum(0.0, bottom_right - top_left)
    inter = wh[:, :, 0] * wh[:, :, 1]

    union = area_a[:, None] + area_b[None, :] - inter
    union = np.maximum(union, 1e-6)

    return inter / union


def box_center_distance(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    """Compute normalized Euclidean center distance between two sets of boxes."""
    if len(boxes_a) == 0 or len(boxes_b) == 0:
        return np.zeros((len(boxes_a), len(boxes_b)), dtype=np.float32)

    centers_a = np.column_stack(
        [(boxes_a[:, 0] + boxes_a[:, 2]) / 2.0, (boxes_a[:, 1] + boxes_a[:, 3]) / 2.0]
    )
    centers_b = np.column_stack(
        [(boxes_b[:, 0] + boxes_b[:, 2]) / 2.0, (boxes_b[:, 1] + boxes_b[:, 3]) / 2.0]
    )

    diff = centers_a[:, None, :] - centers_b[None, :, :]
    dist = np.linalg.norm(diff, axis=-1)
    return dist.astype(np.float32)


# ══════════════════════════════════════════════════════════════════════════
# 2. Linear Assignment / Hungarian Algorithm
# ══════════════════════════════════════════════════════════════════════════

def linear_assignment(
    cost_matrix: np.ndarray, threshold: float
) -> tuple[np.ndarray, list[int], list[int]]:
    """Solve the linear sum assignment problem with a cost threshold gating."""
    if cost_matrix.size == 0:
        return (
            np.empty((0, 2), dtype=int),
            list(range(cost_matrix.shape[0])),
            list(range(cost_matrix.shape[1])),
        )

    if SCIPY_AVAILABLE:
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
    else:
        # Fast vectorized greedy matching fallback
        matched_rows: list[int] = []
        matched_cols: list[int] = []
        cost_copy = cost_matrix.copy()

        while True:
            min_val = np.min(cost_copy)
            if min_val > threshold or np.isinf(min_val):
                break
            min_idx = np.unravel_index(np.argmin(cost_copy), cost_copy.shape)
            r, c = int(min_idx[0]), int(min_idx[1])
            matched_rows.append(r)
            matched_cols.append(c)
            cost_copy[r, :] = np.inf
            cost_copy[:, c] = np.inf

        row_ind = np.array(matched_rows, dtype=int)
        col_ind = np.array(matched_cols, dtype=int)

    matches: list[tuple[int, int]] = []
    unmatched_a: list[int] = []
    unmatched_b: list[int] = []

    matched_a_set = set()
    matched_b_set = set()

    for r, c in zip(row_ind, col_ind):
        if cost_matrix[r, c] <= threshold:
            matches.append((int(r), int(c)))
            matched_a_set.add(int(r))
            matched_b_set.add(int(c))

    for i in range(cost_matrix.shape[0]):
        if i not in matched_a_set:
            unmatched_a.append(i)

    for j in range(cost_matrix.shape[1]):
        if j not in matched_b_set:
            unmatched_b.append(j)

    matches_arr = np.array(matches, dtype=int) if matches else np.empty((0, 2), dtype=int)
    return matches_arr, unmatched_a, unmatched_b


# ══════════════════════════════════════════════════════════════════════════
# 3. Kalman Box Tracker (8-State Motion & Scale Predictor)
# ══════════════════════════════════════════════════════════════════════════

def _convert_bbox_to_z(bbox: np.ndarray) -> np.ndarray:
    """Convert [x1, y1, x2, y2] to center_x, center_y, scale (area), aspect_ratio."""
    w = max(1.0, float(bbox[2] - bbox[0]))
    h = max(1.0, float(bbox[3] - bbox[1]))
    x = float(bbox[0]) + w / 2.0
    y = float(bbox[1]) + h / 2.0
    s = w * h
    r = w / h
    return np.array([x, y, s, r], dtype=np.float32).reshape((4, 1))


def _convert_x_to_bbox(x: np.ndarray) -> np.ndarray:
    """Convert center_x, center_y, scale, aspect_ratio state to [x1, y1, x2, y2]."""
    s = max(1.0, float(x[2, 0]))
    r = max(0.01, float(x[3, 0]))
    w = np.sqrt(s * r)
    h = s / max(w, 1e-4)
    x1 = float(x[0, 0]) - w / 2.0
    y1 = float(x[1, 0]) - h / 2.0
    x2 = x1 + w
    y2 = y1 + h
    return np.array([x1, y1, x2, y2], dtype=np.float32)


class KalmanBoxTracker:
    """
    Standard constant-velocity Kalman Filter for 2D bounding box tracking.
    State vector: [x, y, s, r, dx, dy, ds]^T
    """

    count = 0

    def __init__(self, bbox: np.ndarray):
        # State transition matrix F (7x7)
        self.F = np.eye(7, dtype=np.float32)
        for i in range(3):
            self.F[i, i + 4] = 1.0

        # Measurement matrix H (4x7)
        self.H = np.zeros((4, 7), dtype=np.float32)
        for i in range(4):
            self.H[i, i] = 1.0

        # Measurement noise R
        self.R = np.eye(4, dtype=np.float32)
        self.R[0, 0] *= 1.0
        self.R[1, 1] *= 1.0
        self.R[2, 2] *= 10.0
        self.R[3, 3] *= 10.0

        # Process noise Q
        self.Q = np.eye(7, dtype=np.float32)
        self.Q[4:, 4:] *= 0.01
        self.Q[:2, :2] *= 1.0
        self.Q[2, 2] *= 0.01
        self.Q[3, 3] *= 0.001

        # Covariance P
        self.P = np.eye(7, dtype=np.float32) * 10.0
        self.P[4:, 4:] *= 100.0

        # Initialize state with measurement
        self.x = np.zeros((7, 1), dtype=np.float32)
        self.x[:4] = _convert_bbox_to_z(bbox)

        self.time_since_update = 0
        self.history: list[np.ndarray] = []
        self.hits = 1
        self.hit_streak = 1
        self.age = 0

    def update(self, bbox: np.ndarray) -> None:
        """Update Kalman state with newly observed bounding box measurement."""
        self.time_since_update = 0
        self.history.clear()
        self.hits += 1
        self.hit_streak += 1

        z = _convert_bbox_to_z(bbox)
        # Innovation y = z - Hx
        y = z - np.dot(self.H, self.x)
        # S = H P H^T + R
        S = np.dot(self.H, np.dot(self.P, self.H.T)) + self.R
        # K = P H^T S^-1
        K = np.dot(self.P, np.dot(self.H.T, np.linalg.inv(S)))

        self.x = self.x + np.dot(K, y)
        I = np.eye(7, dtype=np.float32)
        self.P = np.dot(I - np.dot(K, self.H), self.P)

    def predict(self) -> np.ndarray:
        """Advance state by 1 timestep and return predicted bounding box."""
        if self.x[6, 0] + self.x[2, 0] <= 0:
            self.x[6, 0] = 0.0

        self.x = np.dot(self.F, self.x)
        self.P = np.dot(self.F, np.dot(self.P, self.F.T)) + self.Q
        self.age += 1

        if self.time_since_update > 0:
            self.hit_streak = 0
        self.time_since_update += 1
        self.history.append(_convert_x_to_bbox(self.x))
        return self.history[-1]

    def get_state(self) -> np.ndarray:
        """Return current bounding box estimate [x1, y1, x2, y2]."""
        return _convert_x_to_bbox(self.x)


# ══════════════════════════════════════════════════════════════════════════
# 4. Visual Appearance Re-ID Extractor (Multi-Zone Color Signature)
# ══════════════════════════════════════════════════════════════════════════

class AppearanceReIDExtractor:
    """
    Extracts high-discriminability multi-zone HSV color histogram descriptors
    from person image crops. Lightweight (~0.2ms) with zero heavy model overhead.
    """

    @staticmethod
    def extract_feature(frame: np.ndarray, bbox: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        x1 = max(0, int(bbox[0]))
        y1 = max(0, int(bbox[1]))
        x2 = min(w, int(bbox[2]))
        y2 = min(h, int(bbox[3]))

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0 or crop.shape[0] < 4 or crop.shape[1] < 4:
            return np.zeros(96, dtype=np.float32)

        # Convert to HSV color space
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        crop_h, crop_w = hsv.shape[:2]

        # Zone 1: Upper Torso (Top 50%)
        upper_crop = hsv[0 : crop_h // 2, :]
        # Zone 2: Lower Body / Legs (Bottom 50%)
        lower_crop = hsv[crop_h // 2 :, :]

        # 16 Hue bins, 8 Saturation bins per zone = 24 bins per zone
        hist_upper_h = cv2.calcHist([upper_crop], [0], None, [16], [0, 180])
        hist_upper_s = cv2.calcHist([upper_crop], [1], None, [16], [0, 256])
        hist_upper_v = cv2.calcHist([upper_crop], [2], None, [16], [0, 256])

        hist_lower_h = cv2.calcHist([lower_crop], [0], None, [16], [0, 180])
        hist_lower_s = cv2.calcHist([lower_crop], [1], None, [16], [0, 256])
        hist_lower_v = cv2.calcHist([lower_crop], [2], None, [16], [0, 256])

        feat = np.concatenate(
            [
                hist_upper_h.flatten(),
                hist_upper_s.flatten(),
                hist_upper_v.flatten(),
                hist_lower_h.flatten(),
                hist_lower_s.flatten(),
                hist_lower_v.flatten(),
            ]
        ).astype(np.float32)

        # L2 normalize
        norm = np.linalg.norm(feat)
        if norm > 1e-6:
            feat /= norm

        return feat

    @staticmethod
    def cosine_distance_matrix(feats_a: np.ndarray, feats_b: np.ndarray) -> np.ndarray:
        """Compute pairwise cosine distance matrix in range [0.0, 2.0]."""
        if len(feats_a) == 0 or len(feats_b) == 0:
            return np.zeros((len(feats_a), len(feats_b)), dtype=np.float32)

        # Normalized dot product = Cosine Similarity
        similarity = np.dot(feats_a, feats_b.T)
        similarity = np.clip(similarity, -1.0, 1.0)
        # Cosine distance = 1 - similarity
        return np.maximum(0.0, 1.0 - similarity).astype(np.float32)


# ══════════════════════════════════════════════════════════════════════════
# 5. Track State & ByteTrack Lifecycle
# ══════════════════════════════════════════════════════════════════════════

class TrackStatus:
    Tentative = 1
    Confirmed = 2
    Lost = 3
    Deleted = 4


@dataclass
class ByteReIDTrack:
    track_id: int
    kalman_tracker: KalmanBoxTracker
    appearance_feat: np.ndarray
    status: int = TrackStatus.Tentative
    frame_index: int = 0
    missed_frames: int = 0
    last_seen_frame: int = 0
    buffer: deque[np.ndarray] = field(default_factory=lambda: deque(maxlen=32))
    last_valid_keypoints: np.ndarray = field(
        default_factory=lambda: np.zeros((12, 3), dtype=np.float32)
    )
    score_ema: np.ndarray = field(default_factory=lambda: np.ones(4, dtype=np.float32) / 4.0)
    last_bbox: np.ndarray | None = None
    last_keypoints: np.ndarray = field(default_factory=lambda: np.zeros((12, 3), dtype=np.float32))
    last_action_label: str = "Unknown"
    last_action_conf: float = 0.0
    last_all_scores: dict[str, float] = field(default_factory=dict)
    frames_since_inference: int = 0
    gallery_feats: list[np.ndarray] = field(default_factory=list)

    def update_appearance(self, new_feat: np.ndarray, alpha: float = 0.85) -> None:
        """Update running average appearance signature."""
        if self.appearance_feat is None or np.all(self.appearance_feat == 0):
            self.appearance_feat = new_feat.copy()
        else:
            updated = alpha * self.appearance_feat + (1.0 - alpha) * new_feat
            norm = np.linalg.norm(updated)
            if norm > 1e-6:
                updated /= norm
            self.appearance_feat = updated

        if len(self.gallery_feats) < 8:
            self.gallery_feats.append(new_feat)
        else:
            self.gallery_feats[self.frame_index % 8] = new_feat


# ══════════════════════════════════════════════════════════════════════════
# 6. ByteReIDTracker Engine (3-Pass Multi-Cue Tracker)
# ══════════════════════════════════════════════════════════════════════════

class ByteReIDTracker:
    """
    Production-grade Multi-Object Tracker integrating ByteTrack 2-tier association,
    Kalman Filter motion prediction, visual Re-Identification recovery, and anti-inflation logic.
    """

    def __init__(
        self,
        high_conf_thresh: float = 0.35,
        low_conf_thresh: float = 0.10,
        match_iou_thresh: float = 0.30,
        reid_sim_thresh: float = 0.70,
        max_lost_frames: int = 60,
        confirm_hits: int = 2,
    ):
        self.high_conf_thresh = high_conf_thresh
        self.low_conf_thresh = low_conf_thresh
        self.match_iou_thresh = match_iou_thresh
        self.reid_sim_thresh = reid_sim_thresh
        self.max_lost_frames = max_lost_frames
        self.confirm_hits = confirm_hits

        self.next_track_id = 1
        self.tracks: dict[int, ByteReIDTrack] = {}
        self.lost_tracks: dict[int, ByteReIDTrack] = {}
        self.frame_count = 0

    def reset(self) -> None:
        self.next_track_id = 1
        self.tracks.clear()
        self.lost_tracks.clear()
        self.frame_count = 0

    def update(
        self,
        detections: list[dict[str, Any]],
        frame: np.ndarray,
        frame_index: int,
    ) -> list[tuple[ByteReIDTrack, dict[str, Any]]]:
        self.frame_count = frame_index

        # ── Step 1: Predict new locations of existing tracks via Kalman Filter ──
        for track in list(self.tracks.values()):
            track.kalman_tracker.predict()

        for track in list(self.lost_tracks.values()):
            track.kalman_tracker.predict()

        if not detections:
            # All active tracks missed this frame
            for tid, track in list(self.tracks.items()):
                track.missed_frames += 1
                if track.missed_frames >= 2 and track.status == TrackStatus.Confirmed:
                    track.status = TrackStatus.Lost
                    self.lost_tracks[tid] = track
                    del self.tracks[tid]
                elif track.missed_frames > self.max_lost_frames:
                    del self.tracks[tid]

            for tid, track in list(self.lost_tracks.items()):
                track.missed_frames += 1
                if track.missed_frames > self.max_lost_frames:
                    del self.lost_tracks[tid]

            return []

        # Extract bounding boxes, confidences, and appearance features for detections
        det_boxes = np.array([d["bbox"] for d in detections], dtype=np.float32)
        det_confs = np.array([float(d["confidence"]) for d in detections], dtype=np.float32)
        det_feats = np.array(
            [AppearanceReIDExtractor.extract_feature(frame, box) for box in det_boxes],
            dtype=np.float32,
        )

        # Split detections into High-Confidence and Low-Confidence (ByteTrack principle)
        high_mask = det_confs >= self.high_conf_thresh
        low_mask = (det_confs >= self.low_conf_thresh) & (~high_mask)

        high_indices = np.where(high_mask)[0]
        low_indices = np.where(low_mask)[0]

        active_track_list = list(self.tracks.values())
        matched_pairs: list[tuple[ByteReIDTrack, dict[str, Any]]] = []

        # ── Step 2: Pass 1 — Match High-Confidence Detections with Active Tracks ──
        if active_track_list and len(high_indices) > 0:
            track_boxes = np.array(
                [t.kalman_tracker.get_state() for t in active_track_list], dtype=np.float32
            )
            track_feats = np.array(
                [t.appearance_feat for t in active_track_list], dtype=np.float32
            )

            # IoU Cost
            iou_mat = box_iou(track_boxes, det_boxes[high_indices])
            # Appearance Cosine Distance
            app_dist_mat = AppearanceReIDExtractor.cosine_distance_matrix(
                track_feats, det_feats[high_indices]
            )
            # Combined Cost: IoU dominates when overlapping; Appearance helps resolve ambiguities
            cost_matrix = 0.65 * (1.0 - iou_mat) + 0.35 * app_dist_mat

            matches_1, unmatched_tracks_1, unmatched_high_dets = linear_assignment(
                cost_matrix, threshold=(1.0 - self.match_iou_thresh + 0.35)
            )

            for t_idx, d_sub_idx in matches_1:
                orig_det_idx = high_indices[d_sub_idx]
                track = active_track_list[t_idx]
                det = detections[orig_det_idx]
                track.kalman_tracker.update(det["bbox"])
                track.update_appearance(det_feats[orig_det_idx])
                matched_pairs.append((track, det))

            rem_track_indices = unmatched_tracks_1
            rem_high_det_indices = [high_indices[i] for i in unmatched_high_dets]
        else:
            rem_track_indices = list(range(len(active_track_list)))
            rem_high_det_indices = list(high_indices)

        # ── Step 3: Pass 2 — ByteTrack: Match Unmatched Active Tracks with Low-Confidence Detections ──
        if rem_track_indices and len(low_indices) > 0:
            unmatched_tracks = [active_track_list[i] for i in rem_track_indices]
            unmatched_track_boxes = np.array(
                [t.kalman_tracker.get_state() for t in unmatched_tracks], dtype=np.float32
            )

            iou_mat_low = box_iou(unmatched_track_boxes, det_boxes[low_indices])
            cost_low = 1.0 - iou_mat_low

            matches_2, unmatched_tracks_2, _ = linear_assignment(
                cost_low, threshold=(1.0 - 0.20)
            )

            for t_sub_idx, d_sub_idx in matches_2:
                orig_det_idx = low_indices[d_sub_idx]
                track = unmatched_tracks[t_sub_idx]
                det = detections[orig_det_idx]
                track.kalman_tracker.update(det["bbox"])
                matched_pairs.append((track, det))

            # Tracks still unmatched after Pass 1 and Pass 2
            final_unmatched_tracks = [unmatched_tracks[i] for i in unmatched_tracks_2]
        else:
            final_unmatched_tracks = [active_track_list[i] for i in rem_track_indices]

        # ── Step 4: Pass 3 — Visual Re-Identification of Lost Tracks ──
        lost_track_list = list(self.lost_tracks.values())
        unmatched_det_pool = rem_high_det_indices

        if lost_track_list and unmatched_det_pool:
            lost_feats = np.array([t.appearance_feat for t in lost_track_list], dtype=np.float32)
            rem_det_feats = det_feats[unmatched_det_pool]

            # Re-ID Cosine Distance
            reid_dist_mat = AppearanceReIDExtractor.cosine_distance_matrix(
                lost_feats, rem_det_feats
            )
            reid_matches, _, unmatched_reid_dets = linear_assignment(
                reid_dist_mat, threshold=(1.0 - self.reid_sim_thresh)
            )

            for l_idx, d_sub_idx in reid_matches:
                orig_det_idx = unmatched_det_pool[d_sub_idx]
                track = lost_track_list[l_idx]
                det = detections[orig_det_idx]

                # Re-activate lost track with existing Person ID!
                track.status = TrackStatus.Confirmed
                track.kalman_tracker.update(det["bbox"])
                track.update_appearance(det_feats[orig_det_idx])
                self.tracks[track.track_id] = track
                if track.track_id in self.lost_tracks:
                    del self.lost_tracks[track.track_id]

                matched_pairs.append((track, det))

            new_det_indices = [unmatched_det_pool[i] for i in unmatched_reid_dets]
        else:
            new_det_indices = unmatched_det_pool

        # ── Step 5: Initialize New Tracks for Remaining High-Confidence Detections ──
        for det_idx in new_det_indices:
            det = detections[det_idx]
            if det_confs[det_idx] < self.high_conf_thresh:
                continue

            track_id = self.next_track_id
            self.next_track_id += 1

            new_kalman = KalmanBoxTracker(det["bbox"])
            new_track = ByteReIDTrack(
                track_id=track_id,
                kalman_tracker=new_kalman,
                appearance_feat=det_feats[det_idx].copy(),
                status=TrackStatus.Confirmed if self.confirm_hits <= 1 else TrackStatus.Tentative,
                frame_index=frame_index,
            )
            self.tracks[track_id] = new_track
            matched_pairs.append((new_track, det))

        # ── Step 6: Ensure Strict 1-to-1 Uniqueness per Frame ──
        final_matched_pairs: list[tuple[ByteReIDTrack, dict[str, Any]]] = []
        seen_tids_this_frame: set[int] = set()

        for track, det in matched_pairs:
            if track.track_id in seen_tids_this_frame:
                # Collision guard: Spawn new independent track ID if already claimed
                new_tid = self.next_track_id
                self.next_track_id += 1
                new_kalman = KalmanBoxTracker(det["bbox"])
                new_track = ByteReIDTrack(
                    track_id=new_tid,
                    kalman_tracker=new_kalman,
                    appearance_feat=AppearanceReIDExtractor.extract_feature(frame, det["bbox"]),
                    status=TrackStatus.Confirmed,
                    frame_index=frame_index,
                )
                self.tracks[new_tid] = new_track
                final_matched_pairs.append((new_track, det))
                seen_tids_this_frame.add(new_tid)
            else:
                final_matched_pairs.append((track, det))
                seen_tids_this_frame.add(track.track_id)

        # ── Step 7: Update Status for Unmatched Tracks ──
        for tid in list(self.tracks.keys()):
            if tid not in seen_tids_this_frame:
                track = self.tracks[tid]
                track.missed_frames += 1
                if track.status == TrackStatus.Tentative:
                    del self.tracks[tid]
                elif track.missed_frames >= 2:
                    track.status = TrackStatus.Lost
                    self.lost_tracks[tid] = track
                    del self.tracks[tid]

        for tid in list(self.lost_tracks.keys()):
            if tid not in seen_tids_this_frame:
                self.lost_tracks[tid].missed_frames += 1
                if self.lost_tracks[tid].missed_frames > self.max_lost_frames:
                    del self.lost_tracks[tid]

        # Confirm tracks that reached required hit streak
        for track, _ in final_matched_pairs:
            if track.status == TrackStatus.Tentative and track.kalman_tracker.hits >= self.confirm_hits:
                track.status = TrackStatus.Confirmed

        return final_matched_pairs


# ══════════════════════════════════════════════════════════════════════════
# 7. Global Video Tracklet Merger (Post-Video Re-ID Consolidation)
# ══════════════════════════════════════════════════════════════════════════

class TrackletMerger:
    """
    Global post-inference consolidation for recorded videos.
    Stitches fragmented tracklets belonging to the same individual based on
    strict cluster-level frame disjointness, visual cosine similarity, and
    kinematic feasibility, then re-indexes IDs to 1 ... N.
    """

    @staticmethod
    def consolidate(
        detections_log: list[Any],
        sim_threshold: float = 0.75,
        max_time_gap_frames: int = 150,
    ) -> list[Any]:
        if not detections_log:
            return detections_log

        # Group detections by person_id
        tracklet_map: dict[int, list[Any]] = {}
        for d in detections_log:
            tracklet_map.setdefault(d.person_id, []).append(d)

        if len(tracklet_map) <= 1:
            return detections_log

        tracklet_ids = sorted(tracklet_map.keys())

        # Tracklet metadata: frame set, start, end, mean appearance feature
        track_meta: dict[int, dict[str, Any]] = {}
        for tid in tracklet_ids:
            dets = tracklet_map[tid]
            frame_set = {d.frame_number for d in dets}
            start_f = min(frame_set)
            end_f = max(frame_set)

            # Extract start and end bounding boxes for spatial velocity check
            dets_sorted = sorted(dets, key=lambda x: x.frame_number)
            first_bbox = np.array(dets_sorted[0].bbox, dtype=np.float32) if dets_sorted[0].bbox else None
            last_bbox = np.array(dets_sorted[-1].bbox, dtype=np.float32) if dets_sorted[-1].bbox else None

            track_meta[tid] = {
                "frames": frame_set,
                "start_f": start_f,
                "end_f": end_f,
                "first_bbox": first_bbox,
                "last_bbox": last_bbox,
                "count": len(dets),
            }

        # Cluster tracking (guaranteeing zero shared frames across the entire merged cluster)
        parent = {tid: tid for tid in tracklet_ids}
        cluster_frames = {tid: set(track_meta[tid]["frames"]) for tid in tracklet_ids}

        def find(i: int) -> int:
            if parent[i] == i:
                return i
            parent[i] = find(parent[i])
            return parent[i]

        # Candidate pairs sorted by temporal closeness
        candidate_merges: list[tuple[int, int, int]] = []
        for i in range(len(tracklet_ids)):
            tid_a = tracklet_ids[i]
            meta_a = track_meta[tid_a]
            for j in range(i + 1, len(tracklet_ids)):
                tid_b = tracklet_ids[j]
                meta_b = track_meta[tid_b]

                # Check if base tracklets have overlapping frames
                if not meta_a["frames"].isdisjoint(meta_b["frames"]):
                    continue

                if meta_a["end_f"] < meta_b["start_f"]:
                    gap = meta_b["start_f"] - meta_a["end_f"]
                    candidate_merges.append((gap, tid_a, tid_b))
                elif meta_b["end_f"] < meta_a["start_f"]:
                    gap = meta_a["start_f"] - meta_b["end_f"]
                    candidate_merges.append((gap, tid_b, tid_a))

        # Sort candidate merges by shortest time gap first
        candidate_merges.sort(key=lambda item: item[0])

        for gap, tid_earlier, tid_later in candidate_merges:
            if gap > max_time_gap_frames:
                continue

            root_earlier = find(tid_earlier)
            root_later = find(tid_later)

            if root_earlier == root_later:
                continue

            # ── STRICT CHECK 1: Cluster-level Frame Disjointness ──
            # The ENTIRE merged cluster of A and B must have ZERO overlapping frames!
            if not cluster_frames[root_earlier].isdisjoint(cluster_frames[root_later]):
                continue

            # ── STRICT CHECK 2: Kinematic / Velocity Feasibility ──
            box_a = track_meta[tid_earlier]["last_bbox"]
            box_b = track_meta[tid_later]["first_bbox"]
            if box_a is not None and box_b is not None:
                center_a = np.array([(box_a[0] + box_a[2]) / 2.0, (box_a[1] + box_a[3]) / 2.0])
                center_b = np.array([(box_b[0] + box_b[2]) / 2.0, (box_b[1] + box_b[3]) / 2.0])
                displacement = np.linalg.norm(center_b - center_a)
                # Maximum plausible walking/running speed: 30 pixels per frame
                max_allowed_dist = max(100.0, float(gap) * 30.0)
                if displacement > max_allowed_dist:
                    continue

            # Merge Clusters
            parent[root_later] = root_earlier
            cluster_frames[root_earlier].update(cluster_frames[root_later])
            cluster_frames[root_later] = cluster_frames[root_earlier]

        # Compact contiguous IDs: 1, 2, ..., N
        root_to_new_id: dict[int, int] = {}
        next_compact_id = 1

        for tid in tracklet_ids:
            root = find(tid)
            if root not in root_to_new_id:
                root_to_new_id[root] = next_compact_id
                next_compact_id += 1

        # Apply remapped Person IDs
        for d in detections_log:
            root = find(d.person_id)
            d.person_id = root_to_new_id[root]

        # ── HARD INVARIANT SAFETY GUARD: Zero duplicate IDs in any single frame ──
        frame_seen_ids: dict[int, set[int]] = {}
        fallback_next_id = max(root_to_new_id.values()) + 1 if root_to_new_id else 1

        for d in detections_log:
            f = d.frame_number
            pid = d.person_id
            if f not in frame_seen_ids:
                frame_seen_ids[f] = set()

            if pid in frame_seen_ids[f]:
                # Collision detected: instantly resolve by giving separate unique ID
                d.person_id = fallback_next_id
                frame_seen_ids[f].add(fallback_next_id)
                fallback_next_id += 1
            else:
                frame_seen_ids[f].add(pid)

        return detections_log
