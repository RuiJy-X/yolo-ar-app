"""Stage offline assets and freeze the CPU backend without touching development files."""
from pathlib import Path
import subprocess
import sys
import shutil
import json
import hashlib

root = Path(__file__).resolve().parent.parent
source = root / "backend" / "act_reg_final_version"
stage = root / "desktop-build"
import torch
# Python 3.12.0's frozen module execution can lose the loop binding through vars().
# Use the equivalent module globals explicitly, only in the isolated build environment.
ufuncs = Path(torch.__file__).parent / "_numpy" / "_ufuncs.py"
text = ufuncs.read_text(encoding="utf-8")
if "vars()[name]" in text:
    ufuncs.write_text(text.replace("vars()[name]", "globals()[name]"), encoding="utf-8")
assert torch.version.cuda is None, "Use the isolated CPU packaging environment"
args = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--onedir", "--name", "SkysightBackend", "--distpath", str(stage), "--workpath", str(stage / "work"), "--specpath", str(stage), "--paths", str(source)]
for package in ("uvicorn", "ultralytics", "torchdiffeq", "einops", "djitellopy", "av"):
    args += ["--collect-all", package]
for package in ("torch", "torchvision", "ultralytics"):
    args += ["--copy-metadata", package]
for module in ("model.sode", "graph.body12", "feeders.tools", "scipy.integrate", "torchvision"):
    args += ["--hidden-import", module]
args += [str(root / "scripts" / "backend-entry.py")]
subprocess.run(args, check=True, cwd=root)
data = stage / "SkysightBackend" / "data"
data.mkdir(exist_ok=True)
for name in ("results", "ffmpeg"):
    shutil.copytree(source / name, data / name, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
for model in source.glob("*.pt"):
    shutil.copy2(model, data / model.name)
shutil.copytree(root / "dist", data / "frontend", dirs_exist_ok=True)
manifest = {str(p.relative_to(data)): hashlib.sha256(p.read_bytes()).hexdigest() for p in data.rglob("*") if p.is_file()}
(data / "asset-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Staged {len(manifest)} offline assets in {data}")

from PIL import Image
Image.open(root / "public/android-chrome-512x512.png").save(stage / "app.ico", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])

# SciPy 1.18 imports array-api compatibility modules dynamically; ship their source tree.
import scipy
shutil.copytree(Path(scipy.__file__).parent / "_external", stage / "SkysightBackend" / "_internal" / "scipy" / "_external", dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
