
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

Electron uses the Vite server and the Python environment at `backend/act_reg_final_version/.venv`. It can reuse the running backend or start it from that environment. The embedded Python runtime is not required.

## Production frontend build

```powershell
npm run build
```

This creates `dist/`. Browser and Electron development continue to use the existing CUDA-capable backend environment.

Unique models, reports, and differing backend sources recovered from old packaging output are preserved in `packaging-archive/`, with SHA-256 checksums in its manifest. This archive is outside the active model directory so the current model selection stays unchanged.

## Service interfaces

- Health: `GET /health`
- Live inference: `ws://localhost:8000/ws/action-recognition`
- REST APIs: model selection/configuration, video inference, saved history, and generated-output downloads under `/api/*`.

The real-time client sends compressed JPEG camera frames over WebSocket. The service returns detections, pose keypoints, action labels, confidences, and timing data.
## Build the offline Windows installer

Build on Windows 10/11 x64 with Python 3.12 and Node.js installed. First run `npm ci`. Then:

```powershell
npm run desktop:dist
```

The first build downloads dependencies into the isolated `.venv-package-cpu/` environment. It does not replace the development backend environment. The pipeline builds the frontend, freezes a CPU-only backend with PyInstaller, stages local models and FFmpeg, and generates `release/Skysight-Setup-1.0.0.exe` using NSIS. Internet access is needed for the first build, but not for installation or application use. Build tools are pinned in `package-lock.json` and `scripts/requirements-desktop-lock.txt` (the direct dependency list is `scripts/requirements-desktop.txt`).

To prepare and test the backend without generating the installer:

```powershell
npm run desktop:prepare
.\.venv-package-cpu\Scripts\python.exe scripts/smoke-desktop.py
```

Keep the entire `desktop-build/SkysightBackend` directory together; the backend EXE depends on its adjacent runtime and data files. The installer includes that whole directory. Only model weights from the source backend are included; archived and training files are excluded. Missing detector choices are unavailable offline rather than downloaded.

The installer runs per user, offers installation-folder selection, and creates shortcuts and an uninstaller. The installed application needs no system Python, Node.js, FFmpeg, or NVIDIA driver. CPU inference may be slower than development with CUDA. This initial build is unsigned, so Windows may show an unverified-publisher warning.

Packaged analyses and settings live in `%APPDATA%/Skysight/outputs/`; logs are in `%APPDATA%/Skysight/logs/backend.log`. Uninstall preserves this data. Existing development history is not imported automatically. On startup, allow up to five minutes for models to load. If port 8000 is occupied, close the conflicting backend before launching; packaged mode does not reuse an unrelated backend. Closing Skysight stops its owned backend process.

Camera and drone features require working hardware and Windows permissions. A completely disconnected PC can use saved videos and a webcam; drone operation requires connecting to the drone's local network.

To verify the packaged Electron window after preparing/building the app:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-desktop-shell.ps1
```

The shell smoke check launches a hidden test window with a temporary debugging port, verifies React rendering, then closes it. This debugging port is not enabled during normal app launches.
