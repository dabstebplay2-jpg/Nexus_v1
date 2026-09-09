param(
    [string]$Version = "",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
cd $root

if (-not $Version) {
    $Version = "0.6.0"

    if (Test-Path ".\core\constants.py") {
        $constants = Get-Content ".\core\constants.py" -Raw
        if ($constants -match 'APP_VERSION\s*=\s*["'']([^"'']+)["'']') {
            $Version = $Matches[1]
        }
    }
}

$releaseDir = Join-Path $root "release"
$zipName = "NexusLauncher_Windows_$Version.zip"
$zipPath = Join-Path $releaseDir $zipName
$distApp = Join-Path $root "dist\Nexus Launcher"

New-Item -ItemType Directory -Force $releaseDir | Out-Null

if (-not $NoBuild) {
    Write-Host "Building Nexus Launcher..." -ForegroundColor Cyan
    .\.venv\Scripts\python.exe -m PyInstaller --clean --noconfirm ".\Nexus Launcher.spec"
}

if (-not (Test-Path $distApp)) {
    throw "Не найдена папка сборки: $distApp"
}

if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

Write-Host "Waiting for file locks..." -ForegroundColor Cyan
Start-Sleep -Seconds 8

Write-Host "Creating ZIP via Python with retries..." -ForegroundColor Cyan

$zipper = @"
import os
import time
import zipfile
from pathlib import Path

root = Path(r"$root")
source = Path(r"$distApp")
zip_path = Path(r"$zipPath")

if zip_path.exists():
    zip_path.unlink()

files = [p for p in source.rglob("*") if p.is_file()]
total = len(files)

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for index, file in enumerate(files, 1):
        rel = file.relative_to(source)
        arcname = str(Path("Nexus Launcher") / rel)

        last_error = None

        for attempt in range(1, 16):
            try:
                with open(file, "rb") as f:
                    data = f.read()
                zf.writestr(arcname, data)
                break
            except PermissionError as e:
                last_error = e
                time.sleep(1)
            except OSError as e:
                last_error = e
                time.sleep(1)
        else:
            raise RuntimeError(f"Не удалось прочитать файл после 15 попыток: {file} | {last_error}")

        if index % 100 == 0:
            print(f"Packed {index}/{total}")

print(f"ZIP OK: {zip_path}")
"@

$zipperPath = Join-Path $releaseDir "make_zip.py"
Set-Content -Path $zipperPath -Value $zipper -Encoding UTF8

.\.venv\Scripts\python.exe $zipperPath

Write-Host "Testing ZIP..." -ForegroundColor Cyan

$testDir = Join-Path $releaseDir "zip_test_$Version"

if (Test-Path $testDir) {
    Remove-Item -Recurse -Force $testDir
}

New-Item -ItemType Directory -Force $testDir | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $testDir -Force

$exe = Get-ChildItem $testDir -Recurse -File -Filter "*.exe" | Select-Object -First 1

if (-not $exe) {
    throw "ZIP создан, но внутри не найден .exe"
}

Remove-Item -Recurse -Force $testDir

Write-Host ""
Write-Host "Package created successfully:" -ForegroundColor Green
Write-Host $zipPath -ForegroundColor Cyan

Write-Host ""
Write-Host "Теперь загрузи этот ZIP в GitHub Releases:" -ForegroundColor Yellow
Write-Host "https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher/releases" -ForegroundColor Cyan
