$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build command failed with exit code $LASTEXITCODE" } }
if (-not (Test-Path .venv-package-cpu/Scripts/python.exe)) {
    py -3.12 -m venv .venv-package-cpu
    Check-Exit
}
$packagePython = Join-Path (Get-Location) '.venv-package-cpu/Scripts/python.exe'
& $packagePython -m pip install -r scripts/requirements-desktop-lock.txt
Check-Exit
$env:VITE_ACTION_API_BASE_URL = 'http://127.0.0.1:8000'
$env:VITE_ACTION_WS_URL = 'ws://127.0.0.1:8000/ws/action-recognition'
npm run build
Check-Exit
& $packagePython scripts/build-backend.py
Check-Exit
