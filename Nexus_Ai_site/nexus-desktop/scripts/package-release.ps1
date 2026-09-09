# Zip portable Windows build for GitHub Release (run after build.ps1).
$ErrorActionPreference = "Stop"
$Desktop = Split-Path -Parent $PSScriptRoot
$Portable = Join-Path $Desktop "vscodium\VSCode-win32-x64"
$Dist = Join-Path $Desktop "dist"
$Out = Join-Path $Dist "NexusIDE-win32-x64.zip"

if (-not (Test-Path $Portable)) {
    Write-Error "Portable build not found: $Portable — run scripts\build.ps1 first."
}

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
if (Test-Path $Out) { Remove-Item -Force $Out }

Write-Host "Packaging $Out ..."
Compress-Archive -Path (Join-Path $Portable "*") -DestinationPath $Out -Force
Write-Host "Done: $Out ($([math]::Round((Get-Item $Out).Length / 1MB, 1)) MB)"
