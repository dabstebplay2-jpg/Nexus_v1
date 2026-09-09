# Package all nexus-* extensions to dist/*.vsix
$ErrorActionPreference = "Stop"
$Desktop = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $Desktop "dist"
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

if (-not (Get-Command vsce -ErrorAction SilentlyContinue)) {
  npm install -g @vscode/vsce | Out-Null
}

Get-ChildItem (Join-Path $Desktop "extensions") -Directory |
  Where-Object { $_.Name -ne '.vscode' } |
  ForEach-Object {
  Push-Location $_.FullName
  $out = Join-Path $Dist "$($_.Name).vsix"
  vsce package --no-dependencies --allow-missing-repository -o $out
  Pop-Location
  Write-Host "OK $out"
}
