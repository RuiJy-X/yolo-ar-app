<#
.SYNOPSIS
    Trims python-embed by replacing CUDA PyTorch with CPU-only PyTorch
    and removing unnecessary packages. Saves ~4.2 GB.

.DESCRIPTION
    This script:
    1. Uninstalls torch, torchvision (CUDA 12.1 builds)
    2. Installs CPU-only torch==2.5.1 and torchvision==0.20.1
    3. Removes pip, setuptools, and other dev-only packages
    4. Cleans __pycache__ directories and .pyc files
#>

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$pythonEmbed = Join-Path $projectRoot "python-embed"
$pythonExe   = Join-Path $pythonEmbed "python.exe"
$sitePackages = Join-Path $pythonEmbed "Lib\site-packages"

if (-not (Test-Path $pythonExe)) {
    Write-Error "python.exe not found at $pythonExe"
    exit 1
}

# --- Step 0: Measure before ---
Write-Host ""
Write-Host "=== Measuring BEFORE size ===" -ForegroundColor Cyan
$before = (Get-ChildItem -Recurse $pythonEmbed -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum)
$beforeMB = [math]::Round($before.Sum / 1MB, 1)
Write-Host "python-embed: $($before.Count) files, $beforeMB MB"

# --- Step 1: Uninstall CUDA torch + torchvision ---
Write-Host ""
Write-Host "=== Uninstalling CUDA torch and torchvision ===" -ForegroundColor Yellow
& $pythonExe -m pip uninstall torch torchvision -y 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to uninstall torch/torchvision"
    exit 1
}

# --- Step 2: Install CPU-only torch + torchvision ---
Write-Host ""
Write-Host "=== Installing CPU-only torch 2.5.1 and torchvision 0.20.1 ===" -ForegroundColor Yellow
$output = & $pythonExe -m pip install `
    torch==2.5.1 `
    torchvision==0.20.1 `
    --index-url https://download.pytorch.org/whl/cpu `
    --no-cache-dir 2>&1
$output | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install CPU-only torch/torchvision"
    exit 1
}

# --- Step 3: Remove unnecessary packages ---
Write-Host ""
Write-Host "=== Removing unnecessary packages ===" -ForegroundColor Yellow

# Remove pip and setuptools (not needed at runtime)
$removeDirs = @(
    "pip",
    "pip-*",
    "setuptools",
    "setuptools-*",
    "_distutils_hack",
    "tests"
)

foreach ($pattern in $removeDirs) {
    $matches = Get-ChildItem -Path $sitePackages -Filter $pattern -Directory -ErrorAction SilentlyContinue
    foreach ($match in $matches) {
        Write-Host "  Removing $($match.Name)..." -ForegroundColor DarkGray
        Remove-Item -Recurse -Force $match.FullName
    }
}

# Also remove pip executables from Scripts
$scriptsDir = Join-Path $pythonEmbed "Scripts"
Get-ChildItem -Path $scriptsDir -Filter "pip*" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  Removing Scripts\$($_.Name)..." -ForegroundColor DarkGray
    Remove-Item -Force $_.FullName
}

# Remove orphaned .pth files
$pthFile = Join-Path $sitePackages "distutils-precedence.pth"
if (Test-Path $pthFile) {
    Write-Host "  Removing distutils-precedence.pth..." -ForegroundColor DarkGray
    Remove-Item -Force $pthFile
}

# --- Step 4: Clean __pycache__ directories ---
Write-Host ""
Write-Host "=== Cleaning __pycache__ directories ===" -ForegroundColor Yellow
$cacheCount = 0
Get-ChildItem -Path $pythonEmbed -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -Recurse -Force $_.FullName
    $cacheCount++
}
Write-Host "  Removed $cacheCount __pycache__ directories"

# --- Step 5: Measure after ---
Write-Host ""
Write-Host "=== Measuring AFTER size ===" -ForegroundColor Cyan
$after = (Get-ChildItem -Recurse $pythonEmbed -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum)
$afterMB = [math]::Round($after.Sum / 1MB, 1)
$savedMB = [math]::Round(($before.Sum - $after.Sum) / 1MB, 1)
Write-Host "python-embed: $($after.Count) files, $afterMB MB"
Write-Host ""
Write-Host "=== SAVED: $savedMB MB ===" -ForegroundColor Green
Write-Host "Done! python-embed is now trimmed for CPU-only inference." -ForegroundColor Green
