# Skeleton Action Recognition App

This project now supports end-to-end real-time action recognition:

- React frontend captures camera frames.
- Frames are sent via WebSocket to a FastAPI backend.
- Backend runs YOLO pose keypoint extraction.
- Extracted keypoints are fed into the InfoGCN/SODE action model.
- Action predictions and keypoints are streamed back to the UI.

## What Was Added

- FastAPI WebSocket service at `backend/act_reg_final_version/websocket_api.py`
- Real-time frontend socket streaming in `src/components/realtime-video.tsx`
- Live inference logs in `src/pages/RealTime.tsx`
- Backend dependency file at `backend/act_reg_final_version/requirements.txt`

## Models Used

The backend uses the models already included in your repository:

- YOLO pose model: `backend/act_reg_final_version/yolo-best.pt`
- Action model checkpoint: best fold checkpoint discovered under
  `backend/act_reg_final_version/results/uav_transfer/fold_*/best_model.pt`

If no best fold is resolved from report files, fallback is:

- `backend/act_reg_final_version/results/uav_transfer/fold_1/best_model.pt`

## Backend Setup (FastAPI + WebSocket)

1. Download the official Python 3.12 embeddable package for Windows and extract it into `python-embed/` at the repo root. This is the Python runtime Electron should bundle.
2. Install pip into the embedded runtime, then install the backend dependencies with the embedded interpreter:

Open python312.\_pth
Ensure these lines exist (and are not commented):
import site

```bash
.\python-embed\python.exe .\get-pip.py
.\python-embed\python.exe -m pip install -r backend\act_reg_final_version\requirements.txt
```

3. Run server:

```bash
uvicorn websocket_api:app --host 0.0.0.0 --port 8000 --reload
```

4. Verify health endpoint:

```bash
GET http://localhost:8000/health
```

## WebSocket API

- Endpoint: `ws://localhost:8000/ws/action-recognition`
- Recommended request format: binary JPEG bytes per frame
- Supported alternative: JSON base64 payload

### Client -> Server Messages

1. Binary frame (recommended):

- Send raw JPEG bytes as a binary WebSocket message.

2. JSON frame (fallback):

```json
{
  "type": "frame",
  "image": "data:image/jpeg;base64,<...>"
}
```

3. Ping:

```json
{
  "type": "ping"
}
```

### Server -> Client Messages

Inference result:

```json
{
  "type": "inference",
  "frame_index": 37,
  "detection": true,
  "action": {
    "label": "walking",
    "confidence": 0.87
  },
  "bbox": [120.4, 88.3, 340.9, 510.2],
  "keypoints": [{ "id": 0, "x": 212.4, "y": 140.2, "confidence": 0.94 }],
  "timing_ms": 28.7
}
```

Error:

```json
{
  "type": "error",
  "message": "Could not decode binary image payload."
}
```

Pong:

```json
{
  "type": "pong"
}
```

## Frontend Setup

1. Install frontend dependencies:

```bash
npm install
```

2. Configure backend WebSocket URL with a Vite env var (optional):

- `.env`

```bash
VITE_ACTION_WS_URL=ws://localhost:8000/ws/action-recognition
```

If not set, frontend defaults to `ws://localhost:8000/ws/action-recognition`.

3. Run frontend:

```bash
npm run dev
```

4. Open Real Time page, start camera, and watch live action logs.

## Notes on Efficiency

- Models are loaded once at backend startup, not per frame.
- Frontend sends compressed JPEG frames (~640px width, 150ms interval).
- Backend keeps per-client temporal buffers for action inference smoothing.
- Inference uses confidence EMA and TTA averaging for stable labels.

bash# 1. Build frontend
npm run build

# 2. Create clean backend bundle (no .venv, no duplicates)

prepare-bundle.bat

# 3. Delete old output

rmdir /s /q out\Aerview-win32-x64

# 4. Package and test

npx electron-forge package
out\Aerview-win32-x64\Aerview.exe

# 5. Only when ready to distribute

npm run make
