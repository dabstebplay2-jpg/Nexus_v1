param(
    [string]$Python = "python",
    [switch]$SkipVenv
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

Write-Host "== Nexus Launcher Windows build ==" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

if (-not $SkipVenv) {
    if (-not (Test-Path ".venv")) {
        Write-Host "Creating .venv..."
        & $Python -m venv .venv
    }

    $PythonExe = ".\.venv\Scripts\python.exe"
} else {
    $PythonExe = $Python
}

& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r requirements.txt

Remove-Item -Recurse -Force build\pyinstaller -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

& $PythonExe -m PyInstaller --noconfirm --clean --workpath build\pyinstaller build\NexusLauncher-OneFile.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller OneFile build failed with code $LASTEXITCODE" }
& $PythonExe -m PyInstaller --noconfirm --clean --workpath build\pyinstaller build\NexusLauncher-Portable.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller Portable build failed with code $LASTEXITCODE" }

Write-Host ""
Write-Host "Build done:" -ForegroundColor Green
Write-Host "One-file EXE: dist\NexusLauncher.exe"
Write-Host "Portable folder: dist\NexusLauncher\"
