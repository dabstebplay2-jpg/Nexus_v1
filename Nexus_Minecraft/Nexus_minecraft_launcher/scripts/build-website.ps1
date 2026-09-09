# Сборка сайта Nexus Launcher: exe -> zip -> website/downloads
param(
    [switch]$SkipPyInstaller
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== Nexus Launcher website build ==" -ForegroundColor Cyan

if (-not $SkipPyInstaller) {
    Write-Host "Building executable with PyInstaller..."
    & .\.venv\Scripts\pyinstaller.exe "build/NexusLauncher-OneFile.spec" --noconfirm
}

$DistDir = Join-Path $Root "dist\Nexus Launcher"
$ZipPath = Join-Path $Root "website\downloads\NexusLauncher_Windows.zip"

if (-not (Test-Path $DistDir)) {
    throw "Dist folder not found: $DistDir"
}

Get-Process | Where-Object { $_.ProcessName -like "*Nexus*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

New-Item -ItemType Directory -Force -Path (Split-Path $ZipPath) | Out-Null
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

Write-Host "Creating download archive..."
& .\.venv\Scripts\python.exe -c @"
import hashlib, json, os, zipfile
from datetime import date
from pathlib import Path

src = Path(r'$DistDir')
dst = Path(r'$ZipPath')
manifest_path = dst.parent / 'release.json'

with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, _, files in os.walk(src):
        for name in files:
            fp = Path(root) / name
            arc = fp.relative_to(src.parent)
            zf.write(fp, arc.as_posix())

hasher = hashlib.sha256()
with open(dst, 'rb') as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b''):
        hasher.update(chunk)

manifest = {
    'version': '0.7.13',
    'filename': dst.name,
    'size_bytes': dst.stat().st_size,
    'sha256': hasher.hexdigest(),
    'platform': 'windows-x64',
    'updated_at': date.today().isoformat(),
}
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(dst.stat().st_size)
"@

$SizeMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "Done. Archive: $ZipPath ($SizeMb MB)" -ForegroundColor Green
Write-Host "Publish the contents of website/ to any static host (GitHub Pages, Netlify, Cloudflare Pages)."
