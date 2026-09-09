param(
    [string]$Python = "python",
    [string]$ISCCPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (Test-Path ".\.venv\Scripts\python.exe") {
    $PythonExe = ".\.venv\Scripts\python.exe"
} else {
    $PythonExe = $Python
}

powershell -ExecutionPolicy Bypass -File ".\scripts\build_release.ps1" -Python $Python
if ($LASTEXITCODE -ne 0) {
    throw "build_release.ps1 failed with code $LASTEXITCODE"
}

if ($ISCCPath) {
    powershell -ExecutionPolicy Bypass -File ".\scripts\build_installer.ps1" -Python $Python -SkipReleaseBuild -ISCCPath $ISCCPath
} else {
    powershell -ExecutionPolicy Bypass -File ".\scripts\build_installer.ps1" -Python $Python -SkipReleaseBuild
}

if ($LASTEXITCODE -ne 0) {
    throw "build_installer.ps1 failed with code $LASTEXITCODE"
}

$Version = & $PythonExe -c "from core.app_info import APP_VERSION; print(APP_VERSION)"
$ExpectedSetup = Join-Path $ProjectRoot "release\NexusLauncherSetup-$Version-win-x64.exe"

if (-not (Test-Path $ExpectedSetup)) {
    throw "Full release is not complete: missing $ExpectedSetup"
}

Write-Host ""
Write-Host "Full release ready in .\release" -ForegroundColor Green
Get-ChildItem .\release
