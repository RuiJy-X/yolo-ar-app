
## Prerequisites

- Windows 10/11
- Node.js 20.19+ (or a newer LTS release)
- Python 3.12 with a CUDA-compatible PyTorch setup if GPU inference is required
- NVIDIA GPU/driver recommended; the pinned backend requirements use CUDA 12.1 PyTorch wheels

The repository must contain the model and runtime assets under `backend/act_reg_final_version/`, including `yolo-best.pt`, `yolo11n-pose.pt`, `results/`, and `ffmpeg/`.

## First-time setup

From the repository root:

```powershell
npm ci
py -3.12 -m venv backend\act_reg_final_version\.venv
.\backend\act_reg_final_version\.venv\Scripts\python.exe -m pip install --upgrade pip
.\backend\act_reg_final_version\.venv\Scripts\python.exe -m pip install -r backend\act_reg_final_version\requirements.txt
```


The frontend already defaults to the local backend. To override those URLs, copy `.env.example` to `.env.local` and edit it.

## Run the development environment

Open **two PowerShell terminals** in the repository root. The backend command explicitly uses `backend/act_reg_final_version/.venv`, so activating a virtual environment is not required.

Terminal 1 - backend:

```powershell
npm run backend:dev
```

Wait for `Uvicorn running on http://127.0.0.1:8000`, then check `http://127.0.0.1:8000/health`.

Terminal 2 frontend:

```powershell
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Vite hot-reloads frontend changes; Uvicorn reloads backend Python changes.

### Run the Electron shell in development

Keep both development servers above running. In a third terminal:

```powershell
npm run electron:dev
```

Electron uses the Vite server in development and the FastAPI-served build once packaged. This means frontend edits now hot-reload instead of being hidden behind a stale copied build.

## Build and package for Windows

```powershell
npm run build
npm run bundle:prepare
npm run package
```

`bundle:prepare` deletes and recreates only `backend-bundle/` from the backend source, model/runtime assets, and fresh `dist/` output. Do not manually edit that directory.

For an installer instead of an unpacked app:

```powershell
npm run make
```

## Service interfaces

- Health: `GET /health`
- Live inference: `ws://localhost:8000/ws/action-recognition`
- REST APIs: model selection/configuration, video inference, saved history, and generated-output downloads under `/api/*`.

The real-time client sends compressed JPEG camera frames over WebSocket. The service returns detections, pose keypoints, action labels, confidences, and timing data.