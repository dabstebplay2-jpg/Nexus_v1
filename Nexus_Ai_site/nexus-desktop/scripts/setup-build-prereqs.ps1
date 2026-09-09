# One-time prerequisites for Nexus IDE Desktop full build on Windows.
$ErrorActionPreference = "Stop"

Write-Host "Checking Git..."
if (-not (Test-Path "${env:ProgramFiles}\Git\bin\bash.exe")) {
  Write-Host "Install Git for Windows: https://git-scm.com/download/win"
  exit 1
}

if (-not (Get-Command jq -ErrorAction SilentlyContinue)) {
  Write-Host "Installing jq via winget..."
  winget install --id jqlang.jq -e --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

Write-Host "Node: $(node -v 2>$null)"
Write-Host "Python: $(python --version 2>$null)"
Write-Host "jq: $(jq --version 2>$null)"
Write-Host @"

Next:
  cd nexus-desktop
  .\scripts\prepare.ps1
  .\scripts\build.ps1

Or quick path (no compile): install VSCodium from vscodium.com, then:
  .\scripts\quick-install-vscodium.ps1
"@
