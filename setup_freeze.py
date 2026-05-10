# setup_freeze.py
import sys
import os
from cx_Freeze import setup, Executable

BACKEND_SRC = os.path.join('backend', 'act_reg_final_version')

# Packages cx_Freeze should include in full
packages = [
    'torch',
    'torchvision',
    'ultralytics',
    'cv2',
    'fastapi',
    'uvicorn',
    'starlette',
    'websockets',
    'numpy',
    'PIL',
    'feeders',
    'graph',
    'model',
]

# Files/folders to copy into the build
include_files = [
    # YOLO models
    (os.path.join(BACKEND_SRC, 'yolo-best.pt'),    'yolo-best.pt'),
    (os.path.join(BACKEND_SRC, 'yolo11n-pose.pt'), 'yolo11n-pose.pt'),
    (os.path.join(BACKEND_SRC, 'yolo26n-pose.pt'), 'yolo26n-pose.pt'),

    # Action checkpoints
    (os.path.join(BACKEND_SRC, 'results', 'Frame_16.pt'), os.path.join('results', 'Frame_16.pt')),
    (os.path.join(BACKEND_SRC, 'results', 'Frame_32.pt'), os.path.join('results', 'Frame_32.pt')),
    (os.path.join(BACKEND_SRC, 'results', 'Frame_64.pt'), os.path.join('results', 'Frame_64.pt')),

    # Python source packages (copied as raw .py — inspect.getsource() works)
    (os.path.join(BACKEND_SRC, 'feeders'), 'feeders'),
    (os.path.join(BACKEND_SRC, 'graph'),   'graph'),
    (os.path.join(BACKEND_SRC, 'model'),   'model'),

    # FFmpeg
    (os.path.join(BACKEND_SRC, 'ffmpeg', 'ffmpeg.exe'),  os.path.join('ffmpeg', 'ffmpeg.exe')),
    (os.path.join(BACKEND_SRC, 'ffmpeg', 'ffplay.exe'),  os.path.join('ffmpeg', 'ffplay.exe')),
    (os.path.join(BACKEND_SRC, 'ffmpeg', 'ffprobe.exe'), os.path.join('ffmpeg', 'ffprobe.exe')),

    # Vite frontend build
    ('dist', 'frontend'),
]

build_options = {
    'packages': packages,
    'include_files': include_files,
    'excludes': ['notebook', 'IPython', 'jedi', 'torchaudio', 'torchtext'],
    'include_msvcr': True,   # include Windows runtime DLLs
    'build_exe': 'backend-dist/yolo-ar-backend',  # same output path as before
    'path': sys.path + [BACKEND_SRC],
}

executable = Executable(
    script=os.path.join(BACKEND_SRC, 'websocket_api.py'),
    base=None,          # None = console (shows errors); use 'Win32GUI' to hide console
    target_name='yolo-ar-backend.exe',
)

setup(
    name='yolo-ar-backend',
    version='1.0.0',
    options={'build_exe': build_options},
    executables=[executable],
)