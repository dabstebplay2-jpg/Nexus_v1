$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path (Split-Path -Parent $root) "frontend\public\brand\image"

if (-not (Test-Path $src)) {
  Write-Error "Brand source not found: $src"
}

foreach ($dir in @('logo', 'logo_and_name', 'only_name')) {
  $dest = Join-Path $root "renderer\public\brand\image\$dir"
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Copy-Item (Join-Path $src "$dir\brand.png") $dest -Force
}

New-Item -ItemType Directory -Path (Join-Path $root "product\brand") -Force | Out-Null
Copy-Item (Join-Path $src "logo\brand.png") (Join-Path $root "product\brand\icon.png") -Force

Push-Location $root
node scripts/generate-brand-icon.mjs
Pop-Location

Write-Host "Brand assets synced from frontend/public/brand/image" -ForegroundColor Green
