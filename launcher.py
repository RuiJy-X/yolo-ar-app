# launcher.py  (at repo root)
import subprocess
import sys
import os

root = os.path.dirname(os.path.abspath(__file__))
python = os.path.join(root, 'python-embed', 'python.exe')
backend = os.path.join(root, 'backend', 'act_reg_final_version', 'websocket_api.py')

subprocess.run([
    python, '-m', 'uvicorn',
    'websocket_api:app',
    '--host', '0.0.0.0',
    '--port', '8000'
], cwd=os.path.dirname(backend))