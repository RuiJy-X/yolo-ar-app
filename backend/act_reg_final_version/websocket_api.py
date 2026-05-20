from __future__ import annotations

import asyncio
import base64
import json
import mimetypes
import os
import queue
import shutil
import subprocess
import struct
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from ultralytics import YOLO


import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from feeders import tools  # noqa: E402
from model.sode import SODE  # noqa: E402
from utils import import_class  # noqa: E402

def get_output_dir() -> str:
    if getattr(sys, 'frozen', False):
        base = os.environ.get('APPDATA', os.path.expanduser('~'))
        out = os.path.join(base, 'Aerview', 'outputs')
    else:
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'outputs')
    os.makedirs(out, exist_ok=True)
    return out

# OpenCV uses BGR format
CLASS_COLOR_MAP = {
    "waving": (0, 0, 255),    # Red
    "walking": (0, 255, 0),   # Green
    "sitting": (255, 0, 0),   # Blue
    "standing": (0, 255, 255) # Yellow
}
DEFAULT_COLOR = (255, 255, 255)  # White fallback for unexpected classes


YOLO_FILENAME = "yolo-best.pt"
VIDEO_POSE_MODEL_CANDIDATES = [
    "yolo11n-pose.pt",
    YOLO_FILENAME,
    "yolo.best.pt",
]
YOLO_MODEL_CHOICES = {
    "base": "yolo11n-pose.pt",
    "aerial": YOLO_FILENAME,
}
WINDOW_SIZE = 32
MODEL_NUM_POINTS = 12
ACTION_MAP = {0: "sitting", 1: "standing", 2: "waving", 3: "walking"}
VISIBILITY_THRESH = 0.20
MIN_FRAMES_FOR_INFERENCE = 16
DISPLAY_CONF_THRESH = 0.25
SCORE_EMA_ALPHA = 0.75
YOLO_CONF = 0.60
YOLO_IOU = 0.60
VIDEO_YOLO_CONF = 0.30
VIDEO_YOLO_IOU = 0.55

PRESETS: dict[str, dict[str, float | int | str]] = {
    "Frame_16": {
        "window_size": 16,
        "min_frames": 8,
        "stride": 6,
        "ema_alpha": 0.65,
        "yolo_conf": 0.55,
        "video_yolo_conf": 0.25,
        "model_name": "Frame_16",
    },
    "Frame_32": {
        "window_size": 32,
        "min_frames": 16,
        "stride": 4,
        "ema_alpha": 0.75,
        "yolo_conf": 0.60,
        "video_yolo_conf": 0.30,
        "model_name": "Frame_32",
    },
    "Frame_64": {
        "window_size": 64,
        "min_frames": 32,
        "stride": 2,
        "ema_alpha": 0.82,
        "yolo_conf": 0.65,
        "video_yolo_conf": 0.35,
        "model_name": "Frame_64",
    },
}

INFERENCE_TTA_ENABLED = os.getenv("INFERENCE_TTA", "0") == "1"
TEST_TTA_SHIFTS = [0, -3, -1, 1, 3]
ACTION_INFERENCE_STRIDE = int(os.getenv("ACTION_STRIDE", "4"))
DECODE_QUEUE_SIZE = int(os.getenv("DECODE_QUEUE_SIZE", "32"))
RESULT_QUEUE_SIZE = int(os.getenv("RESULT_QUEUE_SIZE", "32"))

MAX_MISSED_FRAMES = 15
VIDEO_MAX_MISSED_FRAMES = 24
VIDEO_IOU_MATCH_THRESH = 0.25

OUTPUT_ROOT_DIR = Path(get_output_dir())
OUTPUT_UPLOAD_DIR = OUTPUT_ROOT_DIR / "uploads"
OUTPUT_ANNOTATED_DIR = OUTPUT_ROOT_DIR / "annotated"
OUTPUT_PREVIEW_DIR = OUTPUT_ROOT_DIR / "previews"
OUTPUT_HISTORY_DIR = OUTPUT_ROOT_DIR / "history"
ANNOTATED_RETENTION_SECONDS = int(os.getenv("ANNOTATED_RETENTION_SECONDS", "1800"))
ANNOTATED_MAX_FILES = int(os.getenv("ANNOTATED_MAX_FILES", "8"))
PREVIEW_RETENTION_SECONDS = int(os.getenv("PREVIEW_RETENTION_SECONDS", str(ANNOTATED_RETENTION_SECONDS)))
PREVIEW_MAX_FILES = int(os.getenv("PREVIEW_MAX_FILES", str(max(ANNOTATED_MAX_FILES * 2, 8))))
INFERENCE_JOB_RETENTION_SECONDS = int(os.getenv("INFERENCE_JOB_RETENTION_SECONDS", "3600"))
OUTPUT_VIDEO_FORMAT = os.getenv("OUTPUT_VIDEO_FORMAT", "mp4").strip().lower()
if OUTPUT_VIDEO_FORMAT not in {"mp4", "avi"}:
    OUTPUT_VIDEO_FORMAT = "mp4"
INFERENCE_JOBS: dict[str, dict[str, Any]] = {}
INFERENCE_JOBS_LOCK = threading.Lock()

RESULTS_DIR = Path(CURRENT_DIR / "results")

def get_ffmpeg_path() -> str:
    if getattr(sys, 'frozen', False):
        return os.path.join(os.path.dirname(sys.executable), 'ffmpeg', 'ffmpeg.exe')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffmpeg', 'ffmpeg.exe')

FFMPEG_PATH = get_ffmpeg_path()


def discover_action_models() -> list[str]:
    if not RESULTS_DIR.exists():
        return []
    return [pt_file.stem for pt_file in sorted(RESULTS_DIR.glob("*.pt"))]


# FIX: pipeline parameter replaces direct app.state.pipeline access to avoid
# circular dependency and ensure WINDOW_SIZE is set before init_action_model runs.
def apply_model_preset(
    model_name: str,
    pipeline: "ActionRecognitionPipeline",
) -> dict[str, float | int | str] | None:
    preset = PRESETS.get(model_name)
    if not preset:
        return None

    global WINDOW_SIZE
    global MIN_FRAMES_FOR_INFERENCE
    global ACTION_INFERENCE_STRIDE
    global SCORE_EMA_ALPHA
    global YOLO_CONF
    global VIDEO_YOLO_CONF

    WINDOW_SIZE = int(preset["window_size"])
    MIN_FRAMES_FOR_INFERENCE = int(preset["min_frames"])
    ACTION_INFERENCE_STRIDE = int(preset["stride"])
    SCORE_EMA_ALPHA = float(preset["ema_alpha"])
    YOLO_CONF = float(preset["yolo_conf"])
    VIDEO_YOLO_CONF = float(preset["video_yolo_conf"])

    # Update the live pipeline instance so ongoing inference picks up new values
    pipeline.yolo_conf = YOLO_CONF
    pipeline.video_yolo_conf = VIDEO_YOLO_CONF

    return preset


def flat_model_registry() -> dict[str, Path]:
    flat: dict[str, Path] = {}
    if not RESULTS_DIR.exists():
        return flat
    for pt_file in sorted(RESULTS_DIR.glob("*.pt")):
        flat[pt_file.stem] = pt_file
    return flat


def resolve_yolo_model_choice(value: str) -> tuple[str, Path]:
    cleaned = value.strip().lower()
    if cleaned in YOLO_MODEL_CHOICES:
        filename = YOLO_MODEL_CHOICES[cleaned]
        return cleaned, CURRENT_DIR / filename

    for key, filename in YOLO_MODEL_CHOICES.items():
        if cleaned == filename.lower():
            return key, CURRENT_DIR / filename

    raise ValueError(
        f"Unknown YOLO model '{value}'. Available: {sorted(YOLO_MODEL_CHOICES.keys())}"
    )


def _make_person_payload(
    track_id: int,
    label: str,
    confidence: float,
    detection: dict,
    track: "TrackState",
) -> dict:
    all_scores = {
        str(key): float(value) for key, value in (track.last_all_scores or {}).items()
    }
    return {
        "person_id": track_id,
        "action": {"label": label, "confidence": confidence},
        "all_scores": all_scores or None,
        "bbox": [float(v) for v in detection["bbox"].tolist()],
        "keypoints": [
            {"id": i, "x": float(kpt[0]), "y": float(kpt[1]), "confidence": float(kpt[2])}
            for i, kpt in enumerate(track.last_keypoints)
        ],
    }


LR_PAIRS = [(0, 1), (2, 3), (4, 5), (6, 7), (8, 9), (10, 11)]
BODY12_FROM_COCO17 = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
BODY12_BONES = [
    (0, 1),
    (0, 2),
    (2, 4),
    (1, 3),
    (3, 5),
    (0, 6),
    (1, 7),
    (6, 7),
    (6, 8),
    (8, 10),
    (7, 9),
    (9, 11),
]


def compute_iou(box_a: np.ndarray, box_b: np.ndarray) -> float:
    x1 = max(float(box_a[0]), float(box_b[0]))
    y1 = max(float(box_a[1]), float(box_b[1]))
    x2 = min(float(box_a[2]), float(box_b[2]))
    y2 = min(float(box_a[3]), float(box_b[3]))

    inter_w = max(0.0, x2 - x1)
    inter_h = max(0.0, y2 - y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0.0:
        return 0.0

    area_a = max(0.0, float(box_a[2] - box_a[0])) * max(0.0, float(box_a[3] - box_a[1]))
    area_b = max(0.0, float(box_b[2] - box_b[0])) * max(0.0, float(box_b[3] - box_b[1]))
    denom = area_a + area_b - inter_area
    if denom <= 0.0:
        return 0.0

    return inter_area / denom


def track_color(track_id: int) -> tuple[int, int, int]:
    _PALETTE = [
        (0,   220, 255),
        (50,  50,  255),
        (0,   255, 50),
        (255, 50,  50),
        (255, 0,   200),
        (0,   165, 255),
        (255, 255, 0),
        (180, 0,   255),
        (0,   255, 180),
        (255, 100, 0),
    ]
    return _PALETTE[track_id % len(_PALETTE)]


def draw_pose(frame: np.ndarray, keypoints: np.ndarray, color: tuple[int, int, int]) -> None:
    for src, dst in BODY12_BONES:
        if keypoints[src, 2] >= VISIBILITY_THRESH and keypoints[dst, 2] >= VISIBILITY_THRESH:
            pt1 = (int(keypoints[src, 0]), int(keypoints[src, 1]))
            pt2 = (int(keypoints[dst, 0]), int(keypoints[dst, 1]))
            cv2.line(frame, pt1, pt2, color, 2, cv2.LINE_AA)

    for keypoint in keypoints:
        if keypoint[2] >= VISIBILITY_THRESH:
            center = (int(keypoint[0]), int(keypoint[1]))
            cv2.circle(frame, center, 3, color, -1, cv2.LINE_AA)


def _keypoints_list_to_array(keypoints: list[dict[str, Any]] | None) -> np.ndarray | None:
    if not keypoints:
        return None

    arr = np.zeros((MODEL_NUM_POINTS, 3), dtype=np.float32)
    for kp in keypoints:
        try:
            idx = int(kp.get("id", -1))
            if idx < 0 or idx >= MODEL_NUM_POINTS:
                continue
            arr[idx, 0] = float(kp.get("x", 0.0))
            arr[idx, 1] = float(kp.get("y", 0.0))
            arr[idx, 2] = float(kp.get("confidence", 0.0))
        except (TypeError, ValueError):
            continue

    return arr


def _annotate_frame(frame: np.ndarray, payload: dict[str, Any]) -> np.ndarray:
    persons = payload.get("persons") or []
    if not isinstance(persons, list):
        return frame

    for person in persons:
        if not isinstance(person, dict):
            continue
        person_id = int(person.get("person_id", 0))
        label = person.get("action", {}).get("label", "Unknown")
        color = CLASS_COLOR_MAP.get(label.lower(), DEFAULT_COLOR)

        bbox = person.get("bbox")
        if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
            x1, y1, x2, y2 = [int(v) for v in bbox]
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
            conf = person.get("action", {}).get("confidence")
            caption = f"ID {person_id}: {label}"
            if isinstance(conf, (int, float)) and label != "Unknown":
                caption += f" {float(conf) * 100:.1f}%"
            cv2.putText(
                frame,
                caption,
                (x1, max(24, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                color,
                2,
                cv2.LINE_AA,
            )

        keypoints = _keypoints_list_to_array(person.get("keypoints"))
        if keypoints is not None:
            draw_pose(frame, keypoints, color)

    return frame


def _encode_jpeg(frame: np.ndarray, quality: int) -> bytes | None:
    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    ok, buffer = cv2.imencode(".jpg", frame, encode_params)
    if not ok:
        return None
    return buffer.tobytes()


def _pack_annotated_frame(payload: dict[str, Any], frame: np.ndarray, quality: int) -> bytes | None:
    jpeg_bytes = _encode_jpeg(frame, quality)
    if jpeg_bytes is None:
        return None
    json_bytes = json.dumps(payload).encode("utf-8")
    header = struct.pack(">I", len(json_bytes))
    return header + json_bytes + jpeg_bytes


def create_video_writer(
    output_path: Path,
    fps: float,
    size: tuple[int, int],
    output_format: str,
) -> tuple[cv2.VideoWriter, str]:
    if output_format == "avi":
        codec_candidates = ["XVID", "MJPG", "DIVX"]
    else:
        allow_openh264 = os.getenv("ALLOW_OPENH264", "0").strip() == "1"
        if allow_openh264:
            codec_candidates = ["avc1", "H264", "mp4v"]
        else:
            codec_candidates = ["mp4v", "avc1", "H264"]

    for codec in codec_candidates:
        writer = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*codec),
            fps,
            size,
        )
        if writer.isOpened():
            return writer, codec
        writer.release()

    raise RuntimeError(
        f"Failed to create {output_format.upper()} writer with codecs: "
        + ", ".join(codec_candidates)
    )


def create_mp4_writer(output_path: Path, fps: float, size: tuple[int, int]) -> tuple[cv2.VideoWriter, str]:
    for codec in ["avc1", "H264", "mp4v"]:
        writer = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*codec),
            fps,
            size,
        )
        if writer.isOpened():
            return writer, codec
        writer.release()

    raise RuntimeError("Failed to create MP4 writer for browser playback.")


def is_browser_compatible_mp4(path: Path) -> bool:
    if path.suffix.lower() != ".mp4":
        return False
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return False
    try:
        result = subprocess.run(
            [
                ffprobe, "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return result.stdout.strip().lower() in {"h264", "avc"}
    except Exception:
        return False


def transcode_video_to_browser_mp4(input_path: Path, output_path: Path) -> str:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink(missing_ok=True)

    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        ffmpeg_cmd = [
            ffmpeg_bin,
            "-y",
            "-i", str(input_path),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac",
            "-b:a", "128k",
            str(output_path),
        ]
        proc = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, check=False)
        if proc.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
            return "ffmpeg"

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise RuntimeError("Could not open uploaded video for browser transcoding.")

    writer: cv2.VideoWriter | None = None
    probe_frame: np.ndarray | None = None
    codec = "unknown"
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        if not np.isfinite(fps) or fps <= 0:
            fps = 25.0

        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if width <= 0 or height <= 0:
            ok, probe_frame = capture.read()
            if not ok or probe_frame is None:
                raise RuntimeError("Uploaded video has no readable frames.")
            height, width = probe_frame.shape[:2]

        writer, codec = create_mp4_writer(output_path, fps, (width, height))

        if probe_frame is not None:
            writer.write(probe_frame)

        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            writer.write(frame)
    finally:
        capture.release()
        if writer is not None:
            writer.release()

    if not output_path.exists() or output_path.stat( ).st_size <= 0:
        raise RuntimeError("Browser transcoding failed; could not create source MP4.")

    return f"opencv-{codec}"


def cleanup_annotated_outputs() -> None:
    now = time.time()
    candidates = sorted(
        (
            path
            for path in OUTPUT_ANNOTATED_DIR.glob("annotated_*")
            if path.suffix.lower() in {".mp4", ".avi"}
        ),
        key=lambda path: path.stat().st_mtime if path.exists() else 0.0,
        reverse=True,
    )

    kept = 0
    for path in candidates:
        try:
            stat = path.stat()
        except OSError:
            continue

        age_seconds = now - stat.st_mtime
        should_delete = age_seconds > ANNOTATED_RETENTION_SECONDS or kept >= ANNOTATED_MAX_FILES
        if should_delete:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
            continue
        kept += 1


def cleanup_preview_outputs() -> None:
    now = time.time()
    candidates = sorted(
        (path for path in OUTPUT_PREVIEW_DIR.glob("source_*.mp4") if path.is_file()),
        key=lambda path: path.stat().st_mtime if path.exists() else 0.0,
        reverse=True,
    )

    kept = 0
    for path in candidates:
        try:
            stat = path.stat()
        except OSError:
            continue

        age_seconds = now - stat.st_mtime
        should_delete = age_seconds > PREVIEW_RETENTION_SECONDS or kept >= PREVIEW_MAX_FILES
        if should_delete:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
            continue
        kept += 1


def cleanup_inference_jobs() -> None:
    cutoff = time.time() - INFERENCE_JOB_RETENTION_SECONDS
    with INFERENCE_JOBS_LOCK:
        expired_jobs = [
            job_id
            for job_id, job in INFERENCE_JOBS.items()
            if job.get("status") in {"completed", "failed"} and float(job.get("updated_at", 0.0)) < cutoff
        ]
        for job_id in expired_jobs:
            del INFERENCE_JOBS[job_id]


def history_entry_dir(entry_id: str) -> Path:
    safe_id = Path(entry_id).name
    return OUTPUT_HISTORY_DIR / safe_id


def load_history_meta(entry_dir: Path) -> dict[str, Any] | None:
    meta_path = entry_dir / "meta.json"
    if not meta_path.exists() or not meta_path.is_file():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _analysis_summary_payload(analysis: dict[str, Any]) -> dict[str, Any] | None:
    nested = analysis.get("analysis_summary")
    if isinstance(nested, dict):
        return nested
    if "grouped_detections" in analysis or "alert_events" in analysis:
        return analysis
    return None


def _detected_actions_from_analysis(analysis: dict[str, Any]) -> list[str]:
    summary = _analysis_summary_payload(analysis)
    if not summary:
        return []

    grouped = summary.get("grouped_detections")
    if not isinstance(grouped, dict):
        return []

    actions: list[str] = []
    for action in grouped.keys():
        label = str(action).strip()
        if label and label not in actions:
            actions.append(label)
    return actions


def _has_wave_alert_from_analysis(analysis: dict[str, Any]) -> bool:
    wave_logs = analysis.get("waveAlertLogs")
    if isinstance(wave_logs, list) and len(wave_logs) > 0:
        return True

    summary = _analysis_summary_payload(analysis)
    if not summary:
        return False

    alerts = summary.get("alert_events")
    return isinstance(alerts, list) and len(alerts) > 0


def _duration_seconds_from_video(video_path: Path) -> float | None:
    capture = cv2.VideoCapture(str(video_path))
    try:
        if not capture.isOpened():
            return None
        frame_count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if frame_count <= 0.0 or fps <= 0.0:
            return None
        return round(frame_count / fps, 3)
    finally:
        capture.release()


def build_history_entry(meta: dict[str, Any]) -> "HistoryEntryResponse":
    entry_id = str(meta.get("id") or "")
    created_at = int(meta.get("createdAt") or 0)
    summary = str(meta.get("summary") or "Saved video analysis")
    filename = str(meta.get("filename") or "annotated_video.mp4")
    video_name = str(meta.get("videoName") or "")
    source_name = meta.get("sourceName")
    duration_seconds = meta.get("durationSeconds")
    detected_actions = meta.get("detectedActions")
    has_wave_alert = bool(meta.get("hasWaveAlert") or False)

    normalized_actions = (
        [str(action) for action in detected_actions if str(action).strip()]
        if isinstance(detected_actions, list)
        else []
    )

    try:
        normalized_duration = (
            round(float(duration_seconds), 3)
            if duration_seconds is not None
            else None
        )
    except (TypeError, ValueError):
        normalized_duration = None

    video_url = f"/history/{entry_id}/{video_name}" if entry_id and video_name else ""
    source_url = (
        f"/history/{entry_id}/{source_name}" if entry_id and source_name else None
    )

    return HistoryEntryResponse(
        id=entry_id,
        createdAt=created_at,
        summary=summary,
        filename=filename,
        videoUrl=video_url,
        sourceVideoUrl=source_url,
        durationSeconds=normalized_duration,
        detectedActions=normalized_actions,
        hasWaveAlert=has_wave_alert,
    )


def create_inference_job(job_id: str) -> None:
    with INFERENCE_JOBS_LOCK:
        INFERENCE_JOBS[job_id] = {
            "type": "video-inference-job-status",
            "job_id": job_id,
            "status": "queued",
            "progress_percent": 0.0,
            "progress_message": "Queued for processing...",
            "frame_index": 0,
            "total_frames": None,
            "result": None,
            "error": None,
            "updated_at": time.time(),
        }


def update_inference_job(job_id: str, **fields: Any) -> None:
    with INFERENCE_JOBS_LOCK:
        job = INFERENCE_JOBS.get(job_id)
        if not job:
            return
        job.update(fields)
        job["updated_at"] = time.time()


def get_inference_job(job_id: str) -> dict[str, Any] | None:
    with INFERENCE_JOBS_LOCK:
        job = INFERENCE_JOBS.get(job_id)
        if not job:
            return None
        return dict(job)


def pick_deployment_checkpoint(base_dir: Path) -> Path:
    fallback = base_dir / "results" / "best_model.pt"
    if fallback.exists():
        return fallback

    models = discover_action_models()
    if models:
        return base_dir / "results" / f"{models[0]}.pt"

    raise FileNotFoundError("No model files found in results/")


def coco17_to_body12(coco_kpts: np.ndarray | None) -> np.ndarray:
    out = np.zeros((MODEL_NUM_POINTS, 3), dtype=np.float32)
    if coco_kpts is None or len(coco_kpts) < 17:
        return out

    for idx, src in enumerate(BODY12_FROM_COCO17):
        if src < len(coco_kpts):
            out[idx] = coco_kpts[src].astype(np.float32)
    return out


def stabilize_keypoints(current: np.ndarray, last_valid: np.ndarray) -> np.ndarray:
    stabilized = current.copy()
    for joint in range(MODEL_NUM_POINTS):
        if current[joint, 2] < VISIBILITY_THRESH:
            stabilized[joint, 0:2] = last_valid[joint, 0:2]
            stabilized[joint, 2] = 0.0
        else:
            last_valid[joint] = current[joint]
    return stabilized


def build_model_input(window: np.ndarray) -> torch.Tensor:
    frame_count = window.shape[0]
    if frame_count >= WINDOW_SIZE:
        idx = np.linspace(0, frame_count - 1, WINDOW_SIZE).astype(int)
        sampled = window[idx]
    else:
        sampled = np.zeros((WINDOW_SIZE, MODEL_NUM_POINTS, 3), dtype=np.float32)
        sampled[-frame_count:] = window

    data = sampled.transpose(2, 0, 1)
    data = np.expand_dims(data, axis=-1)
    data = tools.normalize_skeleton(data)
    return torch.from_numpy(data).float().unsqueeze(0)


def mirror_tensor(inp: torch.Tensor) -> torch.Tensor:
    x = inp.clone()
    x[:, 0] = -x[:, 0]
    for left, right in LR_PAIRS:
        tmp = x[:, :, :, left, :].clone()
        x[:, :, :, left, :] = x[:, :, :, right, :]
        x[:, :, :, right, :] = tmp
    return x


def non_cyclic_shift(inp: torch.Tensor, shift: int) -> torch.Tensor:
    if shift == 0:
        return inp

    out = inp.clone()
    time_dim = inp.shape[2]
    offset = min(abs(int(shift)), time_dim)
    if offset == 0:
        return inp

    if shift > 0:
        out[:, :, offset:, :, :] = inp[:, :, : time_dim - offset, :, :]
        out[:, :, :offset, :, :] = inp[:, :, :1, :, :]
    else:
        out[:, :, : time_dim - offset, :, :] = inp[:, :, offset:, :, :]
        out[:, :, time_dim - offset :, :, :] = inp[:, :, -1:, :, :]

    return out


def infer_probs_with_tta(
    model: torch.nn.Module,
    input_tensor: torch.Tensor,
    use_tta: bool = False,
) -> np.ndarray:
    def logits(x: torch.Tensor) -> torch.Tensor:
        out = model(x)
        if isinstance(out, tuple):
            out = out[0]
        return out

    with torch.no_grad():
        if not use_tta:
            return torch.softmax(logits(input_tensor), dim=1).detach().cpu().numpy()

        logits_list = [logits(input_tensor), logits(mirror_tensor(input_tensor))]
        for shift in TEST_TTA_SHIFTS:
            if shift != 0:
                logits_list.append(logits(non_cyclic_shift(input_tensor, shift)))

        avg_logits = torch.stack(logits_list, dim=0).mean(dim=0)
        return torch.softmax(avg_logits, dim=1).detach().cpu().numpy()


def init_action_model(checkpoint_path: Path, device: str) -> torch.nn.Module:
    graph_cls = import_class("graph.body12.Graph")
    graph = graph_cls(labeling_mode="spatial")
    adjacency = torch.tensor(graph.A, dtype=torch.float32)

    # FIX: WINDOW_SIZE is read here — preset must be applied before this is called
    # so that T matches the checkpoint's training configuration.
    model = SODE(
        num_class=4,
        num_point=MODEL_NUM_POINTS,
        num_person=1,
        graph=adjacency,
        in_channels=3,
        num_head=3,
        k=8,
        base_channel=64,
        T=WINDOW_SIZE,
        dilation=1,
        dual_branch=True,
        static_branch_weight=0.34,
        device=device,
    )

    state = torch.load(checkpoint_path, map_location=device)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]

    model.load_state_dict(state, strict=False)
    model.to(device).eval()

    torch_compile_enabled = os.getenv("TORCH_COMPILE", "0") == "1"
    if torch_compile_enabled:
        try:
            import torch._dynamo as dynamo  # type: ignore[attr-defined]

            dynamo.config.suppress_errors = True
            model = torch.compile(model, mode="reduce-overhead")
        except Exception:
            pass

    return model


def decode_frame_bytes(frame_bytes: bytes) -> np.ndarray | None:
    data = np.frombuffer(frame_bytes, dtype=np.uint8)
    frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if frame is None or frame.size == 0:
        return None
    return frame


def decode_base64_image(image_data: str) -> np.ndarray | None:
    if image_data.startswith("data:"):
        _, _, image_data = image_data.partition(",")

    try:
        frame_bytes = base64.b64decode(image_data)
    except (ValueError, TypeError):
        return None

    return decode_frame_bytes(frame_bytes)


def parse_text_payload(text_payload: str) -> tuple[np.ndarray | None, str | None]:
    try:
        payload = json.loads(text_payload)
    except json.JSONDecodeError:
        return None, "Text payload must be valid JSON."

    payload_type = payload.get("type")
    if payload_type == "ping":
        return None, "ping"

    image_data = payload.get("image")
    if payload_type != "frame" or not isinstance(image_data, str):
        return None, "JSON payload must be {\"type\":\"frame\",\"image\":\"<base64>\"}."

    frame = decode_base64_image(image_data)
    if frame is None:
        return None, "Could not decode base64 image payload."

    return frame, None


class Detection(BaseModel):
    frame_number: int = Field(..., ge=0)
    action_label: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)
    person_id: int = Field(..., ge=0)
    timestamp: str
    all_scores: dict[str, float] | None = None


class SummaryMetrics(BaseModel):
    yolo_precision: float = Field(..., ge=0.0, le=1.0)
    yolo_recall: float = Field(..., ge=0.0, le=1.0)
    infogcn_accuracy: float = Field(..., ge=0.0, le=1.0)
    mean_average_precision: float = Field(..., ge=0.0, le=1.0)


class AlertEvent(BaseModel):
    start_frame: int = Field(..., ge=0)
    end_frame: int = Field(..., ge=0)
    severity_level: str
    person_id: int = Field(..., ge=0)


class AnalyzeVideoRequest(BaseModel):
    detections_log: list[Detection]
    summary_metrics: SummaryMetrics | None = None
    total_frames: int | None = Field(default=None, ge=1)


class AnalyzeVideoResponse(BaseModel):
    summary_metrics: SummaryMetrics
    alert_events: list[AlertEvent]
    action_confidence_scores: dict[str, float]
    grouped_detections: dict[str, list[Detection]]


class SetActiveModelRequest(BaseModel):
    model_name: str


class UpdateConfigRequest(BaseModel):
    yolo_model: str | None = None
    yolo_conf: float | None = Field(default=None, ge=0.0, le=1.0)
    yolo_iou: float | None = Field(default=None, ge=0.0, le=1.0)
    video_yolo_conf: float | None = Field(default=None, ge=0.0, le=1.0)
    video_yolo_iou: float | None = Field(default=None, ge=0.0, le=1.0)
    action_threshold_mode: str | None = None
    action_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    action_thresholds: dict[str, float] | None = None


class SaveHistoryRequest(BaseModel):
    annotatedFilename: str
    sourceFilename: str | None = None
    summary: str | None = None
    filename: str | None = None
    analysis: dict[str, Any]


class HistoryEntryResponse(BaseModel):
    id: str
    createdAt: int
    summary: str
    filename: str
    videoUrl: str
    sourceVideoUrl: str | None = None
    durationSeconds: float | None = None
    detectedActions: list[str] = Field(default_factory=list)
    hasWaveAlert: bool = False


class HistoryDetailResponse(HistoryEntryResponse):
    analysis: dict[str, Any]


def frame_to_timestamp(frame_number: int, fps: float) -> str:
    safe_fps = fps if fps > 0 else 25.0
    total_seconds = frame_number / safe_fps
    hours = int(total_seconds // 3600)
    minutes = int((total_seconds % 3600) // 60)
    seconds = int(total_seconds % 60)
    milliseconds = int((total_seconds - int(total_seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


def normalize_action_label(label: str) -> str:
    cleaned = label.strip()
    if not cleaned:
        return "Unknown"
    return cleaned.title()


def build_summary_metrics_from_detections(
    detections_log: list[Detection],
    yolo_confidences: list[float] | None = None,
    total_frames: int | None = None,
) -> SummaryMetrics:
    if not detections_log:
        return SummaryMetrics(
            yolo_precision=0.0,
            yolo_recall=0.0,
            infogcn_accuracy=0.0,
            mean_average_precision=0.0,
        )

    conf_values = [max(0.0, min(1.0, float(item.confidence))) for item in detections_log]
    non_analyzing_conf = [
        max(0.0, min(1.0, float(item.confidence)))
        for item in detections_log
        if normalize_action_label(item.action_label).lower() != "Unknown".lower()
    ]
    unique_frames = {item.frame_number for item in detections_log}
    action_groups: dict[str, list[float]] = {}

    for item in detections_log:
        label = normalize_action_label(item.action_label)
        if label.lower() == "Unknown".lower():
            continue
        action_groups.setdefault(label, []).append(max(0.0, min(1.0, float(item.confidence))))

    map_score = 0.0
    if action_groups:
        map_score = float(np.mean([float(np.mean(scores)) for scores in action_groups.values()]))

    raw_precision = float(np.mean(yolo_confidences)) if yolo_confidences else float(np.mean(conf_values))
    if total_frames and total_frames > 0:
        raw_recall = len(unique_frames) / total_frames
    else:
        raw_recall = 1.0

    infogcn_accuracy = float(np.mean(non_analyzing_conf)) if non_analyzing_conf else 0.0

    return SummaryMetrics(
        yolo_precision=round(max(0.0, min(1.0, raw_precision)), 4),
        yolo_recall=round(max(0.0, min(1.0, raw_recall)), 4),
        infogcn_accuracy=round(max(0.0, min(1.0, infogcn_accuracy)), 4),
        mean_average_precision=round(max(0.0, min(1.0, map_score)), 4),
    )


def calculate_action_confidence_scores(detections_log: list[Detection]) -> dict[str, float]:
    grouped_scores: dict[str, list[float]] = {}
    for detection in detections_log:
        label = normalize_action_label(detection.action_label)
        grouped_scores.setdefault(label, []).append(float(detection.confidence))

    return {
        label: round(float(np.mean(scores)), 4)
        for label, scores in sorted(grouped_scores.items(), key=lambda item: item[0])
    }


def group_detections_by_action(detections_log: list[Detection]) -> dict[str, list[Detection]]:
    grouped: dict[str, list[Detection]] = {}
    for detection in sorted(detections_log, key=lambda item: (item.frame_number, item.person_id)):
        label = normalize_action_label(detection.action_label)
        grouped.setdefault(label, []).append(detection)
    return grouped


def alert_severity_from_length(sequence_length: int) -> str:
    if sequence_length >= 56:
        return "critical"
    if sequence_length >= 44:
        return "high"
    return "medium"


def extract_waving_alerts(
    detections_log: list[Detection],
    min_frames: int = 32,
) -> list[AlertEvent]:
    waving_frames_by_person: dict[int, list[int]] = {}
    for item in detections_log:
        if normalize_action_label(item.action_label).lower() == "waving":
            waving_frames_by_person.setdefault(item.person_id, []).append(item.frame_number)

    alerts: list[AlertEvent] = []

    for person_id, frame_numbers in waving_frames_by_person.items():
        if not frame_numbers:
            continue

        unique_sorted_frames = sorted(set(frame_numbers))
        run_start = unique_sorted_frames[0]
        prev = unique_sorted_frames[0]

        def flush_run(start_frame: int, end_frame: int) -> None:
            run_length = end_frame - start_frame + 1
            if run_length < min_frames:
                return

            alerts.append(
                AlertEvent(
                    start_frame=start_frame,
                    end_frame=end_frame,
                    severity_level=alert_severity_from_length(run_length),
                    person_id=person_id,
                )
            )

        for frame_number in unique_sorted_frames[1:]:
            if frame_number == prev + 1:
                prev = frame_number
                continue

            flush_run(run_start, prev)
            run_start = frame_number
            prev = frame_number

        flush_run(run_start, prev)

    return sorted(alerts, key=lambda item: (item.start_frame, item.end_frame, item.person_id))


def create_analysis_response(
    detections_log: list[Detection],
    summary_metrics: SummaryMetrics | None = None,
    total_frames: int | None = None,
    yolo_confidences: list[float] | None = None,
) -> AnalyzeVideoResponse:
    computed_summary = summary_metrics or build_summary_metrics_from_detections(
        detections_log,
        yolo_confidences=yolo_confidences,
        total_frames=total_frames,
    )

    return AnalyzeVideoResponse(
        summary_metrics=computed_summary,
        alert_events=extract_waving_alerts(detections_log),
        action_confidence_scores=calculate_action_confidence_scores(detections_log),
        grouped_detections=group_detections_by_action(detections_log),
    )


@dataclass
class ClientState:
    frame_index: int = 0
    missed_frames: int = 0
    next_track_id: int = 1
    tracks: dict = field(default_factory=dict)
    buffer: deque = field(default_factory=lambda: deque(maxlen=WINDOW_SIZE))
    last_valid_keypoints: np.ndarray = field(default_factory=lambda: np.zeros((MODEL_NUM_POINTS, 3), dtype=np.float32))
    score_ema: np.ndarray = field(default_factory=lambda: np.ones(4, dtype=np.float32) / 4.0)

    def reset_temporal_state(self) -> None:
        self.tracks.clear()
        self.buffer.clear()
        self.last_valid_keypoints.fill(0.0)
        self.score_ema = np.ones(4, dtype=np.float32) / 4.0


@dataclass
class TrackState:
    track_id: int
    frame_index: int = 0
    missed_frames: int = 0
    last_seen_frame: int = 0
    buffer: deque[np.ndarray] = field(default_factory=lambda: deque(maxlen=WINDOW_SIZE))
    last_valid_keypoints: np.ndarray = field(default_factory=lambda: np.zeros((MODEL_NUM_POINTS, 3), dtype=np.float32))
    score_ema: np.ndarray = field(default_factory=lambda: np.ones(4, dtype=np.float32) / 4.0)
    last_bbox: np.ndarray | None = None
    last_keypoints: np.ndarray = field(default_factory=lambda: np.zeros((MODEL_NUM_POINTS, 3), dtype=np.float32))
    last_action_label: str = "Unknown"
    last_action_conf: float = 0.0
    last_all_scores: dict[str, float] = field(default_factory=dict)
    frames_since_inference: int = 0

    def reset_temporal_state(self) -> None:
        self.buffer.clear()
        self.last_valid_keypoints.fill(0.0)
        self.score_ema = np.ones(4, dtype=np.float32) / 4.0
        self.last_action_label = "Unknown"
        self.last_action_conf = 0.0
        self.frames_since_inference = 0


class ActionRecognitionPipeline:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model_lock = threading.Lock()
        self._swap_lock = threading.Lock()

        yolo_path = base_dir / YOLO_FILENAME
        if not yolo_path.exists():
            raise FileNotFoundError(f"YOLO model not found: {yolo_path}")

        checkpoint_path = pick_deployment_checkpoint(base_dir)

        self.yolo_model = YOLO(str(yolo_path)).to(self.device)
        self.video_pose_model = self._load_video_pose_model()
        self.action_model = init_action_model(checkpoint_path, self.device)

        self.yolo_conf = YOLO_CONF
        self.yolo_iou = YOLO_IOU
        self.video_yolo_conf = VIDEO_YOLO_CONF
        self.video_yolo_iou = VIDEO_YOLO_IOU
        self.action_threshold_mode = "uniform"
        self.action_threshold = DISPLAY_CONF_THRESH
        self.action_thresholds = {
            label: DISPLAY_CONF_THRESH for label in ACTION_MAP.values()
        }
        self._yolo_model_name = self._resolve_yolo_model_key(yolo_path)
        self._active_model_name: str = self._resolve_initial_model_name(checkpoint_path)

    def _sync_state_buffers(self, state: ClientState) -> None:
        """Resize deque buffers on existing tracks after a WINDOW_SIZE change."""
        if state.buffer.maxlen != WINDOW_SIZE:
            state.buffer = deque(state.buffer, maxlen=WINDOW_SIZE)
        for track in state.tracks.values():
            if track.buffer.maxlen != WINDOW_SIZE:
                track.buffer = deque(track.buffer, maxlen=WINDOW_SIZE)

    def _resolve_initial_model_name(self, checkpoint_path: Path) -> str:
        flat = flat_model_registry()
        for name, path in flat.items():
            if path.resolve() == checkpoint_path.resolve():
                return name
        try:
            rel = checkpoint_path.relative_to(RESULTS_DIR)
            return f"{rel.parent.name}/{rel.stem}"
        except ValueError:
            return checkpoint_path.stem

    def _resolve_yolo_model_key(self, model_path: Path) -> str:
        for key, filename in YOLO_MODEL_CHOICES.items():
            if model_path.name.lower() == filename.lower():
                return key
        return model_path.stem

    @property
    def active_model_name(self) -> str:
        return self._active_model_name

    @property
    def yolo_model_name(self) -> str:
        return self._yolo_model_name

    def swap_action_model(self, model_name: str) -> None:
        """
        Hot-swap the action model weights. Call apply_model_preset BEFORE this
        so that WINDOW_SIZE is correct when init_action_model reads it.
        """
        flat = flat_model_registry()
        if model_name not in flat:
            raise ValueError(
                f"Model '{model_name}' not found. Available: {sorted(flat.keys())}"
            )

        checkpoint_path = flat[model_name]

        with self._swap_lock:
            new_model = init_action_model(checkpoint_path, self.device)
            old_model = self.action_model
            self.action_model = new_model
            self._active_model_name = model_name
            del old_model
            if self.device == "cuda":
                torch.cuda.empty_cache()

    def swap_yolo_model(self, model_choice: str) -> None:
        model_key, model_path = resolve_yolo_model_choice(model_choice)
        if not model_path.exists():
            raise FileNotFoundError(f"YOLO model not found at {model_path}")

        with self._model_lock:
            new_model = YOLO(str(model_path)).to(self.device)
            self.yolo_model = new_model
            self.video_pose_model = new_model
            self._yolo_model_name = model_key

    def _get_action_threshold(self, label: str) -> float:
        if self.action_threshold_mode == "per-action":
            return float(self.action_thresholds.get(label, self.action_threshold))
        return float(self.action_threshold)

    def update_config(self, body: UpdateConfigRequest) -> None:
        if body.yolo_model:
            self.swap_yolo_model(body.yolo_model)

        if body.yolo_conf is not None:
            self.yolo_conf = float(body.yolo_conf)
        if body.yolo_iou is not None:
            self.yolo_iou = float(body.yolo_iou)
        if body.video_yolo_conf is not None:
            self.video_yolo_conf = float(body.video_yolo_conf)
        if body.video_yolo_iou is not None:
            self.video_yolo_iou = float(body.video_yolo_iou)

        if body.action_threshold_mode is not None:
            if body.action_threshold_mode not in {"uniform", "per-action"}:
                raise ValueError("action_threshold_mode must be 'uniform' or 'per-action'.")
            self.action_threshold_mode = body.action_threshold_mode

        if body.action_threshold is not None:
            self.action_threshold = float(body.action_threshold)
            if self.action_threshold_mode == "uniform":
                for label in self.action_thresholds:
                    self.action_thresholds[label] = self.action_threshold

        if body.action_thresholds:
            for label, value in body.action_thresholds.items():
                if label not in self.action_thresholds:
                    raise ValueError(f"Unknown action label '{label}'.")
                if not 0.0 <= float(value) <= 1.0:
                    raise ValueError("Action thresholds must be between 0 and 1.")
                self.action_thresholds[label] = float(value)

    def _load_video_pose_model(self) -> YOLO:
        for candidate_name in VIDEO_POSE_MODEL_CANDIDATES:
            candidate_path = self.base_dir / candidate_name
            if candidate_path.exists():
                try:
                    return YOLO(str(candidate_path)).to(self.device)
                except Exception:
                    continue

        try:
            return YOLO(VIDEO_POSE_MODEL_CANDIDATES[0]).to(self.device)
        except Exception:
            return self.yolo_model

    def _build_input_tensor(self, window: deque[np.ndarray]) -> torch.Tensor:
        tensor = build_model_input(np.asarray(window, dtype=np.float32)).to(self.device)
        return tensor

    def _infer_action_from_window(
        self,
        window: deque[np.ndarray],
        prev_ema: np.ndarray,
        use_tta: bool = False,
    ) -> tuple[str, float, np.ndarray, dict[str, float]]:
        if len(window) < MIN_FRAMES_FOR_INFERENCE:
            return "Unknown", 0.0, prev_ema, {}

        model_input = self._build_input_tensor(window)
        current_model = self.action_model
        probs = infer_probs_with_tta(current_model, model_input, use_tta=use_tta)[0]

        next_ema = SCORE_EMA_ALPHA * prev_ema + (1.0 - SCORE_EMA_ALPHA) * probs
        pred_idx = int(np.argmax(next_ema))
        confidence = float(next_ema[pred_idx])
        label = ACTION_MAP[pred_idx]
        if confidence < self._get_action_threshold(label):
            label = "Unknown"

        all_scores = {ACTION_MAP[i]: round(float(next_ema[i]), 4) for i in range(len(ACTION_MAP))}

        return label, confidence, next_ema, all_scores

    def _update_track_from_detection(
        self,
        track: TrackState,
        keypoints_body12: np.ndarray,
        bbox: np.ndarray,
        frame_index: int,
    ) -> tuple[str, float, dict[str, float]]:
        stabilized = stabilize_keypoints(keypoints_body12, track.last_valid_keypoints)
        track.buffer.append(stabilized)
        track.last_keypoints = stabilized
        track.last_bbox = bbox
        track.last_seen_frame = frame_index
        track.frame_index = frame_index
        track.missed_frames = 0
        track.frames_since_inference += 1

        should_infer = (
            track.frames_since_inference >= ACTION_INFERENCE_STRIDE
            or track.last_action_label == "Unknown"
        )
        if should_infer:
            label, confidence, next_ema, all_scores = self._infer_action_from_window(
                track.buffer,
                track.score_ema,
                use_tta=False,
            )
            track.score_ema = next_ema
            track.last_action_label = label
            track.last_action_conf = confidence
            track.last_all_scores = all_scores
            track.frames_since_inference = 0

        return track.last_action_label, track.last_action_conf, track.last_all_scores

    def _extract_pose_detections(
        self,
        frame: np.ndarray,
        model: YOLO,
        conf: float,
        iou: float,
    ) -> list[dict[str, Any]]:
        with self._model_lock:
            results = model.predict(
                source=frame,
                conf=conf,
                iou=iou,
                classes=[0],
                device=self.device,
                verbose=False,
            )

        if not results:
            return []

        result = results[0]
        if result.boxes is None or result.keypoints is None or len(result.boxes) == 0:
            return []

        boxes = result.boxes.xyxy.detach().cpu().numpy().astype(np.float32)
        keypoints = result.keypoints.data.detach().cpu().numpy().astype(np.float32)
        confs = (
            result.boxes.conf.detach().cpu().numpy().astype(np.float32)
            if result.boxes.conf is not None
            else None
        )

        if boxes.shape[0] == 0 or keypoints.shape[0] == 0:
            return []

        if confs is None or confs.shape[0] != boxes.shape[0]:
            confs = np.ones((boxes.shape[0],), dtype=np.float32)

        count = min(boxes.shape[0], keypoints.shape[0], confs.shape[0])
        detections: list[dict[str, Any]] = []
        for idx in range(count):
            detections.append(
                {
                    "bbox": boxes[idx],
                    "confidence": float(confs[idx]),
                    "keypoints_body12": coco17_to_body12(keypoints[idx]),
                }
            )

        detections.sort(key=lambda item: item["confidence"], reverse=True)
        return detections

    async def infer_frame(self, frame: np.ndarray, state: ClientState) -> dict[str, Any]:
        return await asyncio.to_thread(self._infer_frame_sync, frame, state)

    async def infer_video_file(
        self,
        input_path: Path,
        output_path: Path,
        progress_callback: Callable[[int, int, str], None] | None = None,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(self._infer_video_file_sync, input_path, output_path, progress_callback)

    def _infer_frame_sync(self, frame: np.ndarray, state: ClientState) -> dict[str, Any]:
        start = time.perf_counter()

        # FIX: resize existing deque buffers if WINDOW_SIZE changed after a preset swap
        self._sync_state_buffers(state)

        detections = self._extract_pose_detections(
            frame, self.yolo_model, self.yolo_conf, self.yolo_iou
        )
        if not detections:
            return self._no_detection_result(state, start)

        matched_track_ids: set[int] = set()
        used_detection_ids: set[int] = set()
        persons_out = []

        active_track_ids = [
            tid for tid, t in state.tracks.items()
            if t.missed_frames <= MAX_MISSED_FRAMES and t.last_bbox is not None
        ]

        for det_idx, detection in enumerate(detections):
            best_track_id: int | None = None
            best_iou = 0.0
            for tid in active_track_ids:
                if tid in matched_track_ids:
                    continue
                t = state.tracks[tid]
                if t.last_bbox is None:
                    continue
                iou = compute_iou(detection["bbox"], t.last_bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_track_id = tid

            if best_track_id is not None and best_iou >= VIDEO_IOU_MATCH_THRESH:
                track = state.tracks[best_track_id]
                label, confidence, all_scores = self._update_track_from_detection(
                    track, detection["keypoints_body12"], detection["bbox"], state.frame_index
                )
                matched_track_ids.add(best_track_id)
                used_detection_ids.add(det_idx)
                persons_out.append(_make_person_payload(best_track_id, label, confidence, detection, track))

        for det_idx, detection in enumerate(detections):
            if det_idx in used_detection_ids:
                continue
            track_id = state.next_track_id
            state.next_track_id += 1
            track = TrackState(track_id=track_id)
            state.tracks[track_id] = track
            label, confidence, all_scores = self._update_track_from_detection(
                track, detection["keypoints_body12"], detection["bbox"], state.frame_index
            )
            matched_track_ids.add(track_id)
            persons_out.append(_make_person_payload(track_id, label, confidence, detection, track))

        for tid in list(state.tracks.keys()):
            if tid not in matched_track_ids:
                state.tracks[tid].missed_frames += 1
                if state.tracks[tid].missed_frames > MAX_MISSED_FRAMES:
                    del state.tracks[tid]

        state.missed_frames = 0
        elapsed_ms = (time.perf_counter() - start) * 1000.0

        return {
            "type": "inference",
            "frame_index": state.frame_index,
            "detection": True,
            "persons": persons_out,
            "action": persons_out[0]["action"] if persons_out else {"label": "Unknown", "confidence": 0.0},
            "bbox": persons_out[0]["bbox"] if persons_out else None,
            "keypoints": persons_out[0]["keypoints"] if persons_out else [],
            "timing_ms": round(elapsed_ms, 3),
        }

    def _infer_video_file_sync(
        self,
        input_path: Path,
        output_path: Path,
        progress_callback: Callable[[int, int, str], None] | None = None,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()

        probe_cap = cv2.VideoCapture(str(input_path))
        if not probe_cap.isOpened():
            raise RuntimeError("Could not open uploaded video file.")

        fps = float(probe_cap.get(cv2.CAP_PROP_FPS))
        if not np.isfinite(fps) or fps <= 0:
            fps = 25.0

        raw_total_frames = int(probe_cap.get(cv2.CAP_PROP_FRAME_COUNT))
        total_frames = raw_total_frames if raw_total_frames > 0 else 0
        width = int(probe_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(probe_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        if width <= 0 or height <= 0:
            ok, probe_frame = probe_cap.read()
            if not ok or probe_frame is None:
                probe_cap.release()
                raise RuntimeError("Uploaded video has no readable frames.")
            height, width = probe_frame.shape[:2]

        probe_cap.release()

        if progress_callback:
            progress_callback(0, total_frames, "Preparing video inference...")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            writer, output_codec = create_video_writer(
                output_path, fps, (width, height), OUTPUT_VIDEO_FORMAT
            )
        except RuntimeError:
            raise

        stop_event = threading.Event()

        decode_q: queue.Queue[tuple[int, np.ndarray] | None] = queue.Queue(maxsize=DECODE_QUEUE_SIZE)
        result_q: queue.Queue[tuple[int, np.ndarray, dict[str, Any] | None] | None] = queue.Queue(
            maxsize=RESULT_QUEUE_SIZE
        )

        counters = {
            "detected_people_total": 0,
            "yolo_confidences": [],
            "detections_log": [],
            "next_track_id": 1,
        }
        tracks: dict[int, TrackState] = {}
        thread_errors: list[Exception] = []

        _Q_TIMEOUT = 0.1

        def _put(q: queue.Queue, item: Any) -> bool:
            while not stop_event.is_set():
                try:
                    q.put(item, timeout=_Q_TIMEOUT)
                    return True
                except queue.Full:
                    continue
            return False

        def _get(q: queue.Queue) -> Any:
            while not stop_event.is_set():
                try:
                    return q.get(timeout=_Q_TIMEOUT)
                except queue.Empty:
                    continue
            return _STOP

        _STOP = object()

        def decoder() -> None:
            cap = cv2.VideoCapture(str(input_path))
            try:
                idx = 0
                while not stop_event.is_set():
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        break
                    idx += 1
                    if not _put(decode_q, (idx, frame)):
                        return
                _put(decode_q, None)
            except Exception as exc:
                thread_errors.append(exc)
                stop_event.set()
                _put(decode_q, None)
            finally:
                cap.release()

        def inferencer() -> None:
            try:
                while True:
                    item = _get(decode_q)
                    if item is _STOP:
                        _put(result_q, None)
                        return
                    if item is None:
                        _put(result_q, None)
                        break

                    frame_index, frame = item
                    detections = self._extract_pose_detections(
                        frame,
                        self.video_pose_model,
                        self.video_yolo_conf,
                        self.video_yolo_iou,
                    )
                    counters["detected_people_total"] += len(detections)
                    counters["yolo_confidences"].extend(
                        [float(d["confidence"]) for d in detections]
                    )

                    matched_track_ids: set[int] = set()
                    used_detection_ids: set[int] = set()

                    active_track_ids = [
                        tid
                        for tid, t in tracks.items()
                        if t.missed_frames <= VIDEO_MAX_MISSED_FRAMES and t.last_bbox is not None
                    ]

                    for det_idx, detection in enumerate(detections):
                        best_track_id: int | None = None
                        best_iou = 0.0
                        for tid in active_track_ids:
                            if tid in matched_track_ids:
                                continue
                            t = tracks[tid]
                            if t.last_bbox is None:
                                continue
                            iou = compute_iou(detection["bbox"], t.last_bbox)
                            if iou > best_iou:
                                best_iou = iou
                                best_track_id = tid

                        if best_track_id is not None and best_iou >= VIDEO_IOU_MATCH_THRESH:
                            track = tracks[best_track_id]
                            label, confidence, all_scores = self._update_track_from_detection(
                                track, detection["keypoints_body12"], detection["bbox"], frame_index,
                            )
                            counters["detections_log"].append(
                                Detection(
                                    frame_number=frame_index,
                                    action_label=normalize_action_label(label),
                                    confidence=round(max(0.0, min(1.0, float(confidence))), 4),
                                    person_id=best_track_id,
                                    timestamp=frame_to_timestamp(frame_index, fps),
                                    all_scores=all_scores or None,
                                )
                            )
                            matched_track_ids.add(best_track_id)
                            used_detection_ids.add(det_idx)

                            color = CLASS_COLOR_MAP.get(label.lower(), DEFAULT_COLOR)
                            x1, y1, x2, y2 = [int(v) for v in detection["bbox"]]
                            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
                            draw_pose(frame, track.last_keypoints, color)
                            caption = f"ID {best_track_id}: {label}"
                            if label != "Unknown":
                                caption += f" {confidence * 100:.1f}%"
                            cv2.putText(
                                frame, caption, (x1, max(24, y1 - 8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA,
                            )

                    for det_idx, detection in enumerate(detections):
                        if det_idx in used_detection_ids:
                            continue

                        track_id = counters["next_track_id"]
                        counters["next_track_id"] += 1
                        track = TrackState(track_id=track_id)
                        tracks[track_id] = track

                        label, confidence, all_scores = self._update_track_from_detection(
                            track, detection["keypoints_body12"], detection["bbox"], frame_index,
                        )
                        counters["detections_log"].append(
                            Detection(
                                frame_number=frame_index,
                                action_label=normalize_action_label(label),
                                confidence=round(max(0.0, min(1.0, float(confidence))), 4),
                                person_id=track_id,
                                timestamp=frame_to_timestamp(frame_index, fps),
                                all_scores=all_scores or None,
                            )
                        )
                        matched_track_ids.add(track_id)

                        color = CLASS_COLOR_MAP.get(label.lower(), DEFAULT_COLOR)
                        x1, y1, x2, y2 = [int(v) for v in detection["bbox"]]
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
                        draw_pose(frame, track.last_keypoints, color)
                        caption = f"ID {track_id}: {label}"
                        if label != "Unknown":
                            caption += f" {confidence * 100:.1f}%"
                        cv2.putText(
                            frame, caption, (x1, max(24, y1 - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA,
                        )

                    for tid in list(tracks.keys()):
                        if tid in matched_track_ids:
                            continue
                        tracks[tid].missed_frames += 1
                        if tracks[tid].missed_frames > VIDEO_MAX_MISSED_FRAMES:
                            del tracks[tid]

                    if not _put(result_q, (frame_index, frame, None)):
                        return

            except Exception as exc:
                thread_errors.append(exc)
                stop_event.set()
                try:
                    result_q.put_nowait(None)
                except queue.Full:
                    pass

        t_decode = threading.Thread(target=decoder, daemon=True)
        t_infer = threading.Thread(target=inferencer, daemon=True)
        t_decode.start()
        t_infer.start()

        frame_index = 0
        try:
            while True:
                item = _get(result_q)
                if item is None or item is _STOP:
                    break
                frame_index, annotated_frame, _ = item
                writer.write(annotated_frame)

                if progress_callback and (
                    frame_index == 1
                    or frame_index % 5 == 0
                    or (total_frames > 0 and frame_index >= total_frames)
                ):
                    progress_callback(frame_index, total_frames, "Running pose + action inference...")
        finally:
            writer.release()

        t_decode.join()
        t_infer.join()

        if thread_errors:
            raise thread_errors[0]

        if progress_callback:
            final_total = total_frames if total_frames > 0 else frame_index
            progress_callback(frame_index, final_total, "Finalizing annotated output...")

        detections_log: list[Detection] = counters["detections_log"]
        analysis = create_analysis_response(
            detections_log=detections_log,
            summary_metrics=None,
            total_frames=frame_index,
            yolo_confidences=counters["yolo_confidences"],
        )

        return {
            "frames_processed": frame_index,
            "people_instances_detected": counters["detected_people_total"],
            "tracks_created": counters["next_track_id"] - 1,
            "total_frames": frame_index,
            "fps": round(fps, 3),
            "processing_seconds": round(time.perf_counter() - started_at, 3),
            "output_codec": output_codec,
            "resolution": {"width": width, "height": height},
            "detections_log": [item.model_dump() for item in detections_log],
            "analysis_summary": analysis.model_dump(),
        }

    def _no_detection_result(self, state: ClientState, started_at: float) -> dict[str, Any]:
        state.missed_frames += 1
        if state.missed_frames >= MAX_MISSED_FRAMES:
            state.reset_temporal_state()

        elapsed_ms = (time.perf_counter() - started_at) * 1000.0
        return {
            "type": "inference",
            "frame_index": state.frame_index,
            "detection": False,
            "action": {"label": "No person detected", "confidence": 0.0},
            "bbox": None,
            "keypoints": [],
            "timing_ms": round(elapsed_ms, 3),
        }


app = FastAPI(title="Skeleton Action Recognition WS API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_cross_origin_isolation_headers(request: Request, call_next: Callable[..., Any]) -> Any:
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    return response


OUTPUT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_ANNOTATED_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_ROOT_DIR)), name="outputs")
app.mount("/history", StaticFiles(directory=str(OUTPUT_HISTORY_DIR)), name="history")


def run_video_inference_job(
    job_id: str,
    input_path: Path,
    preview_path: Path,
    preview_name: str,
    output_path: Path,
    output_name: str,
) -> None:
    try:
        update_inference_job(
            job_id,
            status="processing",
            progress_percent=0.0,
            progress_message="Starting inference pipeline...",
        )

        update_inference_job(
            job_id,
            status="processing",
            progress_percent=1.0,
            progress_message="Checking source video compatibility...",
        )
        if is_browser_compatible_mp4(input_path):
            shutil.copy2(input_path, preview_path)
            source_transcode_backend = "passthrough"
        else:
            update_inference_job(
                job_id,
                progress_message="Converting upload to browser-safe MP4...",
            )
            source_transcode_backend = transcode_video_to_browser_mp4(input_path, preview_path)

        def on_progress(frame_index: int, total_frames: int, phase: str) -> None:
            percent = 0.0
            if total_frames > 0:
                percent = min(99.0, max(0.0, (frame_index / total_frames) * 100.0))

            update_inference_job(
                job_id,
                status="processing",
                progress_percent=round(percent, 2),
                progress_message=phase,
                frame_index=frame_index,
                total_frames=total_frames if total_frames > 0 else None,
            )

        result = app.state.pipeline._infer_video_file_sync(preview_path, output_path, on_progress)
        raw_output_path = output_path
        raw_output_name = output_name

        if raw_output_path.suffix.lower() == ".mp4":
            transcoded_path = raw_output_path.with_name(f"{raw_output_path.stem}_browser.mp4")
            output_transcode_backend = transcode_video_to_browser_mp4(raw_output_path, transcoded_path)
            raw_output_path.unlink(missing_ok=True)
            transcoded_path.replace(raw_output_path)
            served_output_path = raw_output_path
            served_output_name = raw_output_name
        else:
            served_output_path = raw_output_path.with_suffix(".mp4")
            served_output_name = served_output_path.name
            output_transcode_backend = transcode_video_to_browser_mp4(raw_output_path, served_output_path)
            raw_output_path.unlink(missing_ok=True)

        cleanup_annotated_outputs()
        cleanup_preview_outputs()

        update_inference_job(
            job_id,
            status="completed",
            progress_percent=100.0,
            progress_message="Inference complete.",
            frame_index=result.get("frames_processed", 0),
            total_frames=result.get("frames_processed", 0),
            result={
                "type": "video-inference",
                "output_video_url": f"/outputs/annotated/{served_output_name}",
                "output_download_url": f"/api/download-annotated/{served_output_name}",
                "source_video_url": f"/outputs/previews/{preview_name}",
                "source_transcode_backend": source_transcode_backend,
                "output_transcode_backend": output_transcode_backend,
                "retention_seconds": ANNOTATED_RETENTION_SECONDS,
                **result,
            },
            error=None,
        )
    except Exception as exc:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        if preview_path.exists():
            preview_path.unlink(missing_ok=True)
        update_inference_job(
            job_id,
            status="failed",
            progress_message="Inference failed.",
            error=str(exc),
        )
    finally:
        if input_path.exists():
            input_path.unlink(missing_ok=True)
        cleanup_inference_jobs()


@app.on_event("startup")
async def startup_event() -> None:
    cleanup_annotated_outputs()
    cleanup_preview_outputs()
    cleanup_inference_jobs()
    app.state.pipeline = ActionRecognitionPipeline(CURRENT_DIR)


@app.get("/health")
def healthcheck() -> dict[str, Any]:
    pipeline_loaded = hasattr(app.state, "pipeline")
    return {
        "status": "ok" if pipeline_loaded else "starting",
        "pipeline_loaded": pipeline_loaded,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "output_video_format": OUTPUT_VIDEO_FORMAT,
        "preview_retention_seconds": PREVIEW_RETENTION_SECONDS,
        "cwd": os.getcwd(),
        "action_inference_stride": ACTION_INFERENCE_STRIDE,
        "tta_enabled": INFERENCE_TTA_ENABLED,
        "torch_compile_enabled": os.getenv("TORCH_COMPILE", "0") == "1",
        "active_model": app.state.pipeline.active_model_name if pipeline_loaded else None,
    }


def build_runtime_config(pipeline: ActionRecognitionPipeline) -> dict[str, Any]:
    return {
        "window_size": WINDOW_SIZE,
        "min_frames": MIN_FRAMES_FOR_INFERENCE,
        "action_inference_stride": ACTION_INFERENCE_STRIDE,
        "ema_alpha": SCORE_EMA_ALPHA,
        "yolo_model": pipeline.yolo_model_name,
        "yolo_models": [
            {
                "key": key,
                "label": (
                    "Base Model (yolo11n-pose.pt)"
                    if key == "base"
                    else "Aerial Pose Model (yolo-best.pt)"
                ),
                "filename": filename,
            }
            for key, filename in YOLO_MODEL_CHOICES.items()
        ],
        "yolo_conf": pipeline.yolo_conf,
        "yolo_iou": pipeline.yolo_iou,
        "video_yolo_conf": pipeline.video_yolo_conf,
        "video_yolo_iou": pipeline.video_yolo_iou,
        "action_threshold_mode": pipeline.action_threshold_mode,
        "action_threshold": pipeline.action_threshold,
        "action_thresholds": pipeline.action_thresholds,
        "actions": list(ACTION_MAP.values()),
    }


# ── Model registry endpoints ──────────────────────────────────────────────────

@app.get("/api/models")
def list_models() -> dict[str, Any]:
    # FIX: use active_model_name property instead of non-existent action_model_path
    registry = discover_action_models()
    return {
        "models": registry,
        "active_model": app.state.pipeline.active_model_name,
    }


@app.post("/api/models/active")
def set_active_model(body: SetActiveModelRequest) -> dict[str, Any]:
    pipeline: ActionRecognitionPipeline = app.state.pipeline
    try:
        # FIX: apply preset BEFORE swapping the model so that WINDOW_SIZE is
        # correct when init_action_model reads it inside swap_action_model.
        applied_preset = apply_model_preset(body.model_name, pipeline)
        pipeline.swap_action_model(body.model_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model swap failed: {exc}") from exc

    return {
        "active_model": pipeline.active_model_name,
        "status": "swapped",
        "preset": applied_preset,
    }


@app.get("/api/config")
def get_runtime_config() -> dict[str, Any]:
    pipeline: ActionRecognitionPipeline = app.state.pipeline
    return build_runtime_config(pipeline)


@app.post("/api/config")
def update_runtime_config(body: UpdateConfigRequest) -> dict[str, Any]:
    pipeline: ActionRecognitionPipeline = app.state.pipeline
    try:
        pipeline.update_config(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Config update failed: {exc}") from exc

    return build_runtime_config(pipeline)


# ─────────────────────────────────────────────────────────────────────────────

def run_history_reinference_job(
    job_id: str,
    entry_id: str,
    source_path: Path,
    preview_path: Path,
    preview_name: str,
    output_path: Path,
    output_name: str,
) -> None:
    try:
        update_inference_job(
            job_id,
            status="processing",
            progress_percent=0.0,
            progress_message="Starting re-inference pipeline...",
        )

        update_inference_job(job_id, progress_message="Preparing source video...")
        if not preview_path.exists():
            shutil.copy2(source_path, preview_path)
        source_transcode_backend = "passthrough"

        def on_progress(frame_index: int, total_frames: int, phase: str) -> None:
            percent = 0.0
            if total_frames > 0:
                percent = min(99.0, max(0.0, (frame_index / total_frames) * 100.0))
            update_inference_job(
                job_id,
                status="processing",
                progress_percent=round(percent, 2),
                progress_message=phase,
                frame_index=frame_index,
                total_frames=total_frames if total_frames > 0 else None,
            )

        result = app.state.pipeline._infer_video_file_sync(preview_path, output_path, on_progress)
        raw_output_path = output_path

        if raw_output_path.suffix.lower() == ".mp4":
            transcoded_path = raw_output_path.with_name(f"{raw_output_path.stem}_browser.mp4")
            output_transcode_backend = transcode_video_to_browser_mp4(raw_output_path, transcoded_path)
            raw_output_path.unlink(missing_ok=True)
            transcoded_path.replace(raw_output_path)
            served_output_path = raw_output_path
            served_output_name = output_name
        else:
            served_output_path = raw_output_path.with_suffix(".mp4")
            served_output_name = served_output_path.name
            output_transcode_backend = transcode_video_to_browser_mp4(raw_output_path, served_output_path)
            raw_output_path.unlink(missing_ok=True)

        entry_dir = history_entry_dir(entry_id)
        video_ext = served_output_path.suffix.lower() or ".mp4"
        history_video_name = f"video{video_ext}"
        history_video_path = entry_dir / history_video_name
        shutil.copy2(served_output_path, history_video_path)

        meta = load_history_meta(entry_dir) or {}
        meta["videoName"] = history_video_name
        (entry_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

        full_result = {
            **result,
            "output_video_url": f"/history/{entry_id}/{history_video_name}",
            "source_video_url": f"/outputs/previews/{preview_name}",
        }
        (entry_dir / "analysis.json").write_text(
            json.dumps(full_result, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

        cleanup_annotated_outputs()
        cleanup_preview_outputs()

        update_inference_job(
            job_id,
            status="completed",
            progress_percent=100.0,
            progress_message="Inference complete.",
            frame_index=result.get("frames_processed", 0),
            total_frames=result.get("frames_processed", 0),
            result={
                "type": "video-inference",
                "output_video_url": f"/history/{entry_id}/{history_video_name}",
                "output_download_url": f"/api/download-annotated/{served_output_name}",
                "source_video_url": f"/outputs/previews/{preview_name}",
                "source_transcode_backend": source_transcode_backend,
                "output_transcode_backend": output_transcode_backend,
                "retention_seconds": 0,
                **result,
            },
            error=None,
        )
    except Exception as exc:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        if preview_path.exists():
            preview_path.unlink(missing_ok=True)
        update_inference_job(
            job_id,
            status="failed",
            progress_message="Re-inference failed.",
            error=str(exc),
        )
    finally:
        cleanup_inference_jobs()


@app.post("/api/infer-video/from-history/{entry_id}")
async def reinfer_from_history(entry_id: str) -> dict[str, Any]:
    safe_id = Path(entry_id).name
    if safe_id != entry_id:
        raise HTTPException(status_code=400, detail="Invalid history entry id.")

    entry_dir = history_entry_dir(safe_id)
    if not entry_dir.exists() or not entry_dir.is_dir():
        raise HTTPException(status_code=404, detail="History entry not found.")

    meta = load_history_meta(entry_dir)
    if not meta:
        raise HTTPException(status_code=404, detail="History entry metadata missing.")

    source_name = meta.get("sourceName")
    if not source_name:
        raise HTTPException(
            status_code=422,
            detail=(
                "This history entry has no stored source video. "
                "Please upload the original video file to re-analyze it."
            ),
        )

    source_path = entry_dir / source_name
    if not source_path.exists() or not source_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Source video file is missing from history storage.",
        )

    preview_name = f"source_{uuid4().hex}.mp4"
    preview_path = OUTPUT_PREVIEW_DIR / preview_name
    output_ext = ".avi" if OUTPUT_VIDEO_FORMAT == "avi" else ".mp4"
    output_name = f"annotated_{uuid4().hex}{output_ext}"
    output_path = OUTPUT_ANNOTATED_DIR / output_name
    job_id = uuid4().hex

    try:
        cleanup_inference_jobs()
        create_inference_job(job_id)

        worker = threading.Thread(
            target=run_history_reinference_job,
            args=(job_id, safe_id, source_path, preview_path, preview_name, output_path, output_name),
            daemon=True,
        )
        worker.start()

        return {
            "type": "video-inference-job",
            "job_id": job_id,
            "status_url": f"/api/infer-video/{job_id}",
        }
    except Exception as exc:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        if preview_path.exists():
            preview_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Re-inference failed: {exc}") from exc


@app.post("/api/infer-video")
async def infer_uploaded_video(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    ext = Path(file.filename).suffix.lower()
    if not ext:
        ext = ".mp4"

    input_path = OUTPUT_UPLOAD_DIR / f"upload_{uuid4().hex}{ext}"
    preview_name = f"source_{uuid4().hex}.mp4"
    preview_path = OUTPUT_PREVIEW_DIR / preview_name
    output_ext = ".avi" if OUTPUT_VIDEO_FORMAT == "avi" else ".mp4"
    output_name = f"annotated_{uuid4().hex}{output_ext}"
    output_path = OUTPUT_ANNOTATED_DIR / output_name
    job_id = uuid4().hex
    job_started = False

    try:
        cleanup_annotated_outputs()
        cleanup_preview_outputs()
        cleanup_inference_jobs()

        with input_path.open("wb") as stream:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                stream.write(chunk)

        if not input_path.exists() or input_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Uploaded video file is empty.")

        create_inference_job(job_id)
        worker = threading.Thread(
            target=run_video_inference_job,
            args=(job_id, input_path, preview_path, preview_name, output_path, output_name),
            daemon=True,
        )
        worker.start()
        job_started = True

        return {
            "type": "video-inference-job",
            "job_id": job_id,
            "status_url": f"/api/infer-video/{job_id}",
        }
    except HTTPException:
        raise
    except Exception as exc:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        if preview_path.exists():
            preview_path.unlink(missing_ok=True)
        if not job_started and input_path.exists():
            input_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Video inference failed: {exc}") from exc
    finally:
        await file.close()


@app.post("/api/upload-annotated")
async def upload_annotated_video(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    ext = Path(file.filename).suffix.lower()
    if not ext:
        ext = ".mp4"

    temp_path = OUTPUT_UPLOAD_DIR / f"upload_{uuid4().hex}{ext}"
    output_name = f"annotated_{uuid4().hex}.mp4"
    output_path = OUTPUT_ANNOTATED_DIR / output_name

    try:
        cleanup_annotated_outputs()
        cleanup_preview_outputs()

        with temp_path.open("wb") as stream:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                stream.write(chunk)

        if not temp_path.exists() or temp_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Uploaded video file is empty.")

        transcode_backend = "passthrough"
        if is_browser_compatible_mp4(temp_path):
            shutil.move(temp_path, output_path)
        else:
            transcode_backend = transcode_video_to_browser_mp4(temp_path, output_path)
            temp_path.unlink(missing_ok=True)

        return {
            "type": "annotated-upload",
            "annotated_filename": output_name,
            "output_video_url": f"/outputs/annotated/{output_name}",
            "output_transcode_backend": transcode_backend,
            "retention_seconds": ANNOTATED_RETENTION_SECONDS,
        }
    except HTTPException:
        raise
    except Exception as exc:
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Annotated upload failed: {exc}") from exc
    finally:
        await file.close()


@app.post("/api/upload-realtime-session")
async def upload_realtime_session(
    annotated: UploadFile = File(...),
    source: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    if not annotated.filename:
        raise HTTPException(status_code=400, detail="Annotated upload must have a filename.")

    annotated_ext = Path(annotated.filename).suffix.lower() or ".mp4"
    annotated_tmp = OUTPUT_UPLOAD_DIR / f"upload_{uuid4().hex}{annotated_ext}"
    annotated_name = f"annotated_{uuid4().hex}.mp4"
    annotated_path = OUTPUT_ANNOTATED_DIR / annotated_name

    source_tmp: Path | None = None
    source_name: str | None = None
    source_path: Path | None = None

    if source and source.filename:
        source_ext = Path(source.filename).suffix.lower() or ".mp4"
        source_tmp = OUTPUT_UPLOAD_DIR / f"upload_{uuid4().hex}{source_ext}"
        source_name = f"source_{uuid4().hex}.mp4"
        source_path = OUTPUT_PREVIEW_DIR / source_name

    try:
        cleanup_annotated_outputs()
        cleanup_preview_outputs()

        with annotated_tmp.open("wb") as stream:
            while True:
                chunk = await annotated.read(1024 * 1024)
                if not chunk:
                    break
                stream.write(chunk)

        if not annotated_tmp.exists() or annotated_tmp.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Annotated upload is empty.")

        annotated_backend = "passthrough"
        if is_browser_compatible_mp4(annotated_tmp):
            shutil.move(annotated_tmp, annotated_path)
        else:
            annotated_backend = transcode_video_to_browser_mp4(annotated_tmp, annotated_path)
            annotated_tmp.unlink(missing_ok=True)

        source_backend = None
        if source and source.filename and source_tmp and source_path:
            with source_tmp.open("wb") as stream:
                while True:
                    chunk = await source.read(1024 * 1024)
                    if not chunk:
                        break
                    stream.write(chunk)

            if not source_tmp.exists() or source_tmp.stat().st_size == 0:
                raise HTTPException(status_code=400, detail="Source upload is empty.")

            if is_browser_compatible_mp4(source_tmp):
                shutil.move(source_tmp, source_path)
                source_backend = "passthrough"
            else:
                source_backend = transcode_video_to_browser_mp4(source_tmp, source_path)
                source_tmp.unlink(missing_ok=True)

        return {
            "type": "realtime-session-upload",
            "annotated_filename": annotated_name,
            "source_filename": source_name,
            "output_video_url": f"/outputs/annotated/{annotated_name}",
            "source_video_url": f"/outputs/previews/{source_name}" if source_name else None,
            "annotated_transcode_backend": annotated_backend,
            "source_transcode_backend": source_backend,
            "retention_seconds": ANNOTATED_RETENTION_SECONDS,
        }
    except HTTPException:
        raise
    except Exception as exc:
        if annotated_path.exists():
            annotated_path.unlink(missing_ok=True)
        if annotated_tmp.exists():
            annotated_tmp.unlink(missing_ok=True)
        if source_path and source_path.exists():
            source_path.unlink(missing_ok=True)
        if source_tmp and source_tmp.exists():
            source_tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Realtime upload failed: {exc}") from exc
    finally:
        await annotated.close()
        if source:
            await source.close()


@app.get("/api/infer-video/{job_id}")
def get_video_inference_job(job_id: str) -> dict[str, Any]:
    cleanup_inference_jobs()
    job = get_inference_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Inference job not found.")
    return job


@app.get("/api/download-annotated/{filename}")
def download_annotated_video(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    if safe_name != filename or not safe_name.startswith("annotated_"):
        raise HTTPException(status_code=400, detail="Invalid file name.")

    file_path = OUTPUT_ANNOTATED_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Annotated video not found.")

    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(
        path=file_path,
        filename=safe_name,
        media_type=media_type,
        content_disposition_type="attachment",
    )


@app.post("/api/history", response_model=HistoryDetailResponse)
def save_history_entry(body: SaveHistoryRequest) -> HistoryDetailResponse:
    safe_annotated = Path(body.annotatedFilename).name
    if safe_annotated != body.annotatedFilename or not safe_annotated.startswith("annotated_"):
        raise HTTPException(status_code=400, detail="Invalid annotated filename.")

    annotated_path = OUTPUT_ANNOTATED_DIR / safe_annotated
    if not annotated_path.exists() or not annotated_path.is_file():
        raise HTTPException(status_code=404, detail="Annotated video not found.")

    entry_id = uuid4().hex
    entry_dir = history_entry_dir(entry_id)
    entry_dir.mkdir(parents=True, exist_ok=False)

    video_ext = annotated_path.suffix.lower() or ".mp4"
    video_name = f"video{video_ext}"
    shutil.copy2(annotated_path, entry_dir / video_name)

    source_name: str | None = None
    if body.sourceFilename:
        safe_source = Path(body.sourceFilename).name
        if safe_source == body.sourceFilename and safe_source.startswith("source_"):
            source_path = OUTPUT_PREVIEW_DIR / safe_source
            if source_path.exists() and source_path.is_file():
                source_name = f"source{source_path.suffix.lower()}"
                shutil.copy2(source_path, entry_dir / source_name)

    summary = body.summary or "Saved video analysis"
    filename = body.filename or safe_annotated
    created_at = int(time.time() * 1000)
    duration_seconds = _duration_seconds_from_video(annotated_path)
    detected_actions = _detected_actions_from_analysis(body.analysis)
    has_wave_alert = _has_wave_alert_from_analysis(body.analysis)

    (entry_dir / "analysis.json").write_text(
        json.dumps(body.analysis, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    meta = {
        "id": entry_id,
        "createdAt": created_at,
        "summary": summary,
        "filename": filename,
        "videoName": video_name,
        "sourceName": source_name,
        "durationSeconds": duration_seconds,
        "detectedActions": detected_actions,
        "hasWaveAlert": has_wave_alert,
    }
    (entry_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )

    entry = build_history_entry(meta)
    return HistoryDetailResponse(**entry.dict(), analysis=body.analysis)


@app.get("/api/history", response_model=list[HistoryEntryResponse])
def list_history_entries() -> list[HistoryEntryResponse]:
    if not OUTPUT_HISTORY_DIR.exists():
        return []

    entries: list[HistoryEntryResponse] = []
    for entry_dir in OUTPUT_HISTORY_DIR.iterdir():
        if not entry_dir.is_dir():
            continue
        meta = load_history_meta(entry_dir)
        if not meta:
            continue
        try:
            entries.append(build_history_entry(meta))
        except Exception:
            continue

    entries.sort(key=lambda item: item.createdAt, reverse=True)
    return entries


@app.get("/api/history/{entry_id}", response_model=HistoryDetailResponse)
def get_history_entry(entry_id: str) -> HistoryDetailResponse:
    entry_dir = history_entry_dir(entry_id)
    if not entry_dir.exists() or not entry_dir.is_dir():
        raise HTTPException(status_code=404, detail="History entry not found.")

    meta = load_history_meta(entry_dir)
    if not meta:
        raise HTTPException(status_code=404, detail="History entry metadata missing.")

    analysis_path = entry_dir / "analysis.json"
    if not analysis_path.exists():
        raise HTTPException(status_code=404, detail="History entry analysis missing.")

    try:
        analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"History analysis parse failed: {exc}") from exc

    entry = build_history_entry(meta)
    return HistoryDetailResponse(**entry.dict(), analysis=analysis)


@app.delete("/api/history/{entry_id}")
def delete_history_entry(entry_id: str) -> dict[str, Any]:
    entry_dir = history_entry_dir(entry_id)
    if not entry_dir.exists() or not entry_dir.is_dir():
        raise HTTPException(status_code=404, detail="History entry not found.")

    shutil.rmtree(entry_dir, ignore_errors=True)
    return {"deleted": entry_id}


@app.delete("/api/history")
def clear_history_entries() -> dict[str, Any]:
    if not OUTPUT_HISTORY_DIR.exists():
        return {"cleared": 0}

    cleared = 0
    for entry_dir in OUTPUT_HISTORY_DIR.iterdir():
        if not entry_dir.is_dir():
            continue
        try:
            shutil.rmtree(entry_dir, ignore_errors=True)
            cleared += 1
        except Exception:
            continue

    return {"cleared": cleared}


@app.post("/analyze-video", response_model=AnalyzeVideoResponse)
def analyze_video(request: AnalyzeVideoRequest) -> AnalyzeVideoResponse:
    return create_analysis_response(
        detections_log=request.detections_log,
        summary_metrics=request.summary_metrics,
        total_frames=request.total_frames,
    )


@app.websocket("/ws/action-recognition")
async def action_recognition_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    state = ClientState()

    try:
        raw_quality = websocket.query_params.get("quality", "72")
        jpeg_quality = int(raw_quality)
    except (TypeError, ValueError):
        jpeg_quality = 72
    jpeg_quality = max(20, min(95, jpeg_quality))

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            frame: np.ndarray | None = None
            error: str | None = None

            payload_bytes = message.get("bytes")
            payload_text = message.get("text")

            if payload_bytes is not None:
                frame = decode_frame_bytes(payload_bytes)
                if frame is None:
                    error = "Could not decode binary image payload."
            elif payload_text is not None:
                frame, error = parse_text_payload(payload_text)
                if error == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
            else:
                error = "Unsupported websocket message type."

            if error:
                await websocket.send_json({"type": "error", "message": error})
                continue

            if frame is None:
                await websocket.send_json({"type": "error", "message": "Frame payload missing."})
                continue

            state.frame_index += 1
            result = await app.state.pipeline.infer_frame(frame, state)
            if result.get("type") == "inference":
                annotated = _annotate_frame(frame, result)
                packed = _pack_annotated_frame(result, annotated, jpeg_quality)
                if packed is None:
                    await websocket.send_json(result)
                else:
                    await websocket.send_bytes(packed)
            else:
                await websocket.send_json(result)

    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)


class RenameHistoryRequest(BaseModel):
    filename: str

@app.patch("/api/history/{entry_id}", response_model=HistoryDetailResponse)
def rename_history_entry(entry_id: str, body: RenameHistoryRequest) -> HistoryDetailResponse:
    entry_dir = history_entry_dir(entry_id)
    if not entry_dir.exists():
        raise HTTPException(status_code=404, detail="History entry not found.")
    meta = load_history_meta(entry_dir)
    if not meta:
        raise HTTPException(status_code=404, detail="Metadata missing.")
    meta["filename"] = body.filename or meta.get("filename", "")
    (entry_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=True, indent=2), encoding="utf-8"
    )
    analysis_path = entry_dir / "analysis.json"
    analysis = json.loads(analysis_path.read_text(encoding="utf-8")) if analysis_path.exists() else {}
    entry = build_history_entry(meta)
    return HistoryDetailResponse(**entry.dict(), analysis=analysis)

# ── Resolve paths when running as PyInstaller bundle ──────────────────────────
def _base_dir() -> str:
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR = _base_dir()

# ── Serve Vite static build ───────────────────────────────────────────────────
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

if os.path.isdir(FRONTEND_DIR):
    assets_dir = os.path.join(FRONTEND_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith(("api/", "ws/", "health", "outputs/", "analyze")):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))