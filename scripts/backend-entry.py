import multiprocessing
import os
import sys
from pathlib import Path

if __name__ == "__main__":
    multiprocessing.freeze_support()
    resources = Path(sys.executable).resolve().parent / "data"
    os.environ["SKYSIGHT_RESOURCE_DIR"] = str(resources)
    os.environ["YOLO_OFFLINE"] = "true"
    os.environ["YOLO_AUTOINSTALL"] = "false"
    os.environ["YOLO_CONFIG_DIR"] = str(Path(os.environ.get("APPDATA", str(Path.home()))) / "Skysight" / "ultralytics")
    import uvicorn
    from websocket_api import app
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("SKYSIGHT_PORT", "8000")), workers=1, reload=False)
