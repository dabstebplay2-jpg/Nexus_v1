# Builds Nexus IDE from prepared VSCodium tree (Windows x64).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Vendor = Join-Path $Root "nexus-desktop\vscodium"

if (-not (Test-Path $Vendor)) {
    & (Join-Path $Root "nexus-desktop\scripts\prepare.ps1")
}

Push-Location $Vendor
try {
    $gitBash = "${env:ProgramFiles}\Git\bin\bash.exe"
    if (-not (Test-Path $gitBash)) {
        $gitBash = "${env:ProgramFiles(x86)}\Git\bin\bash.exe"
    }
    if (-not (Test-Path $gitBash)) {
        Write-Error "Git Bash required (install Git for Windows). WSL bash is not used."
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:SHOULD_BUILD = "yes"
    $env:VSCODE_ARCH = "x64"
    $env:OS_NAME = "windows"
    Write-Host "Starting VSCodium build via $gitBash (30-90 min; needs jq, Node, VS Build Tools)..."
    & $gitBash -lc "./dev/build.sh"
    Write-Host "Build finished. Installer under VSCode-win32-x64/ or release assets."
} finally {
    Pop-Location
}
