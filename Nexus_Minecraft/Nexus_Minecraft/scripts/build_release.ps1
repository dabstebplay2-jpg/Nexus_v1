param(
    [string]$Python = "python",
    [switch]$SkipVenv
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not $SkipVenv) {
    if (-not (Test-Path ".venv")) {
        & $Python -m venv .venv
    }
    $PythonExe = ".\.venv\Scripts\python.exe"
} else {
    $PythonExe = $Python
}

& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r requirements.txt

$Version = & $PythonExe -c "from core.app_info import APP_VERSION; print(APP_VERSION)"
$ReleaseDir = Join-Path $ProjectRoot "release"

Remove-Item -Recurse -Force build\pyinstaller -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $ReleaseDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $ReleaseDir | Out-Null

if (-not (Test-Path ".\tools\pyi_runtime_hook.py")) {
    throw "Missing .\tools\pyi_runtime_hook.py. Runtime hook must be committed because PyInstaller spec references it."
}

Write-Host "Building Nexus Launcher v$Version"

& $PythonExe -m PyInstaller --noconfirm --clean --workpath build\pyinstaller build\NexusLauncher-OneFile.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller OneFile build failed with code $LASTEXITCODE" }
& $PythonExe -m PyInstaller --noconfirm --clean --workpath build\pyinstaller build\NexusLauncher-Portable.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller Portable build failed with code $LASTEXITCODE" }

$OneFileName = "NexusLauncher-$Version-win-x64.exe"
$PortableName = "NexusLauncher-$Version-win-x64-portable.zip"

if (-not (Test-Path "dist\NexusLauncher.exe")) {
    throw "dist\NexusLauncher.exe was not created"
}
Copy-Item "dist\NexusLauncher.exe" (Join-Path $ReleaseDir $OneFileName)

if (Test-Path (Join-Path $ReleaseDir $PortableName)) {
    Remove-Item (Join-Path $ReleaseDir $PortableName) -Force
}

Compress-Archive -Path "dist\NexusLauncher\*" -DestinationPath (Join-Path $ReleaseDir $PortableName) -Force

Get-ChildItem $ReleaseDir -File | Where-Object { $_.Extension -in ".exe", ".zip" } | ForEach-Object {
    $Hash = Get-FileHash $_.FullName -Algorithm SHA256
    "$($Hash.Hash)  $($_.Name)" | Out-File -FilePath "$($_.FullName).sha256" -Encoding ascii
}

Write-Host ""
Write-Host "Release artifacts:" -ForegroundColor Green
Get-ChildItem $ReleaseDir
