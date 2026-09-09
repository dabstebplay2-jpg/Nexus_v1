# Clones VSCodium and applies Nexus product.json + built-in extensions.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Desktop = Join-Path $Root "nexus-desktop"
$Vendor = Join-Path $Desktop "vscodium"

if (-not (Test-Path $Vendor)) {
    Write-Host "Cloning VSCodium (shallow)..."
    git clone --depth 1 https://github.com/VSCodium/vscodium.git $Vendor
}

$ProductSrc = Join-Path $Desktop "product\product.json"
$ProductDst = Join-Path $Vendor "product.json"
if (Test-Path $ProductSrc) {
    Copy-Item -Force $ProductSrc $ProductDst
    Write-Host "Applied Nexus product.json"
}

$ExtSrc = Join-Path $Desktop "extensions"
$BuiltinDir = Join-Path $Vendor "builtin-extensions"
New-Item -ItemType Directory -Force -Path $BuiltinDir | Out-Null
Get-ChildItem $ExtSrc -Directory | ForEach-Object {
    $dest = Join-Path $BuiltinDir $_.Name
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Recurse -Force $_.FullName $dest
    Write-Host "Bundled extension: $($_.Name)"
}

Write-Host "Prepare complete. Run scripts\build.ps1 to compile."
