$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

# Skip code signing (winCodeSign needs symlink rights on Windows without Developer Mode).
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

Write-Host "=== Nexus Browser: Windows release build ===" -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "clean-dist.ps1") -Phase before
npm run dist
& (Join-Path $PSScriptRoot "clean-dist.ps1") -Phase after

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$version = $pkg.version
$portable = Join-Path dist "NexusBrowser-$version-Portable.exe"
$setup = Join-Path dist "NexusBrowser-$version-Setup.exe"

Write-Host ""
if (Test-Path $portable) {
  $mb = [math]::Round((Get-Item $portable).Length / 1MB, 1)
  Write-Host "Portable: $portable ($mb MB)" -ForegroundColor Green
}
if (Test-Path $setup) {
  $mb = [math]::Round((Get-Item $setup).Length / 1MB, 1)
  Write-Host "Setup:    $setup ($mb MB)" -ForegroundColor Green
}
if (-not (Test-Path $portable) -and -not (Test-Path $setup)) {
  Write-Host "Check dist/ for electron-builder output" -ForegroundColor Yellow
  exit 1
}

# Mirror release artifacts into dist-build/ (local download folder).
$distBuild = Join-Path (Get-Location) "dist-build"
New-Item -ItemType Directory -Path $distBuild -Force | Out-Null

Get-ChildItem $distBuild -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $distBuild "win-unpacked")) {
  Remove-Item (Join-Path $distBuild "win-unpacked") -Recurse -Force -ErrorAction SilentlyContinue
}

Copy-Item $portable $distBuild
Copy-Item $setup $distBuild
$blockmap = Join-Path dist "NexusBrowser-$version-Setup.exe.blockmap"
if (Test-Path $blockmap) { Copy-Item $blockmap $distBuild }
$unpacked = Join-Path dist "win-unpacked"
if (Test-Path $unpacked) { Copy-Item $unpacked $distBuild -Recurse }

Write-Host "dist-build: synced v$version" -ForegroundColor Green
