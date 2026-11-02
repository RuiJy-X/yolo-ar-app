"""Exercise the frozen CPU service using isolated test data (no development history)."""
import json
import os
from pathlib import Path
import subprocess
import time
import requests

root = Path(__file__).resolve().parent.parent
backend = root / "desktop-build" / "SkysightBackend"
work = root / "desktop-build" / "smoke test data"
work.mkdir(parents=True, exist_ok=True)
base = "http://127.0.0.1:18001"
def request(method, url, **kwargs):
    r = requests.request(method, base + url, timeout=180, **kwargs)
    r.raise_for_status()
    return r

with (work / "backend.log").open("w", encoding="utf-8") as log:
    proc = subprocess.Popen([str(backend / "SkysightBackend.exe")], cwd=work, stdout=log, stderr=log, env={**os.environ, "SKYSIGHT_PORT":"18001", "SKYSIGHT_DATA_DIR":str(work / "outputs")})
    try:
        deadline = time.time() + 300
        while time.time() < deadline:
            if proc.poll() is not None: raise RuntimeError((work / "backend.log").read_text())
            try:
                health = request("GET", "/health").json()
                break
            except requests.RequestException: time.sleep(1)
        else: raise TimeoutError("Frozen pipeline did not initialize")
        assert health["device"] == "cpu" and health["pipeline_loaded"]
        assert '<div id="root">' in request("GET", "/").text
        assert request("GET", "/favicon.ico").headers['content-type'].startswith('image/')
        models = request("GET", "/api/models").json()["models"]
        for model in models: request("POST", "/api/models/active", json={"model_name":model})
        config = request("GET", "/api/config").json()
        for model in config["yolo_models"]: request("POST", "/api/config", json={"yolo_model":model["key"]})
        for detector in config["stage1_detectors"]: request("POST", "/api/config", json={"stage1_detector":detector["key"]})
        request("POST", "/api/config", json={"stage1_detector":"same"})
        request("POST", "/api/models/active", json={"model_name":"Frame_16"})
        request("POST", "/api/config", json={"yolo_model":"base", "use_sahi":False})
        video = work / "test.mp4"
        subprocess.run([str(backend / "data/ffmpeg/ffmpeg.exe"), "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x240:r=5:d=1", "-c:v", "libx264", str(video)], check=True, capture_output=True)
        with video.open("rb") as f: job = request("POST", "/api/infer-video", files={"file":("test.mp4", f, "video/mp4")}).json()
        deadline = time.time() + 300
        while time.time() < deadline:
            result = request("GET", job["status_url"]).json()
            if result['status'] in ('completed','failed','error'): break
            time.sleep(1)
        assert result['status'] == 'completed', result
        output = result['result']
        assert len(request("GET", output['output_download_url']).content) > 0
        saved = request("POST", "/api/history", json={"annotatedFilename":Path(output['output_video_url']).name,"filename":"Installer smoke test","analysis":{}}).json()
        assert request("GET", "/api/history/" + saved['id']).json()['id'] == saved['id']
        assert len(request("GET", saved['videoUrl']).content) > 0
        request("DELETE", "/api/history/" + saved['id'])
        assert (work / "outputs/config.json").is_file()
        (work / "results.json").write_text(json.dumps({"health":health,"models":models,"config":config,"inference":result}, indent=2), encoding="utf-8")
        print("PASS: CPU health, static frontend, every action/YOLO model, configuration, FFmpeg, upload and video inference")
    finally:
        proc.terminate()
        proc.wait(timeout=20)

with (work / "restart.log").open("w", encoding="utf-8") as log:
    proc = subprocess.Popen([str(backend / "SkysightBackend.exe")], cwd=work, stdout=log, stderr=log, env={**os.environ, "SKYSIGHT_PORT":"18001", "SKYSIGHT_DATA_DIR":str(work / "outputs")})
    try:
        deadline = time.time() + 300
        while time.time() < deadline:
            if proc.poll() is not None: raise RuntimeError((work / "restart.log").read_text())
            try:
                request("GET", "/health")
                break
            except requests.RequestException: time.sleep(1)
        restored = request("GET", "/api/config").json()
        assert restored['yolo_model'] == 'base' and restored['use_sahi'] is False
        print("PASS: settings restored after frozen-backend restart")
    finally:
        proc.terminate()
        proc.wait(timeout=20)
