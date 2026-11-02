param([string]$Executable = "release/win-unpacked/Skysight.exe")
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$testExe = (Resolve-Path -LiteralPath $Executable).Path
$testProcess = Start-Process -FilePath $testExe -ArgumentList '--remote-debugging-port=19222' -WindowStyle Hidden -PassThru
try {
    node scripts/smoke-shell.mjs
    if ($LASTEXITCODE -ne 0) { throw "Packaged renderer smoke test failed" }
    if (-not $testProcess.WaitForExit(20000)) { throw "App did not exit after window close" }
} finally {
    if (-not $testProcess.HasExited) { taskkill /pid $testProcess.Id /t /f | Out-Null }
}
