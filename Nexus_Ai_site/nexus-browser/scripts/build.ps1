$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path node_modules)) { npm ci }
npm run build:renderer
Write-Host "Renderer built. Run 'npm run dist' for portable package."
