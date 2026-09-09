# Sync brand assets from frontend/public/brand into Nexus desktop extensions.
# Mirrors frontend/src/config/brandAssets.js (icon / full / wordmark).
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$FrontendBrand = Join-Path (Join-Path (Join-Path $RepoRoot 'frontend') 'public') 'brand'
$ExtRoot = Join-Path (Join-Path $RepoRoot 'nexus-desktop') 'extensions'

$Variants = @{
    icon     = 'image/logo'
    full     = 'image/logo_and_name'
    wordmark = 'image/only_name'
}

$Targets = @(
    @{ Ext = 'nexus-ai'; Subdirs = $Variants }
    @{ Ext = 'nexus-auth'; Subdirs = $Variants }
    @{ Ext = 'nexus-welcome'; Subdirs = @{ icon = 'image/logo' } }
)

function Copy-BrandVariant {
    param(
        [string]$SrcDir,
        [string]$DestDir,
        [string]$BaseName = 'brand'
    )
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    $exts = @('svg', 'png', 'webp', 'jpg', 'jpeg')
    $copied = $false
    foreach ($ext in $exts) {
        $src = Join-Path $SrcDir "$BaseName.$ext"
        if (Test-Path $src) {
            Copy-Item -Force $src (Join-Path $DestDir "$BaseName.$ext")
            $copied = $true
        }
    }
    return $copied
}

function Ensure-FallbackSvg {
    param([string]$DestDir, [string]$FallbackSvg)
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    if (-not (Test-Path (Join-Path $DestDir 'brand.svg'))) {
        if (Test-Path $FallbackSvg) {
            Copy-Item -Force $FallbackSvg (Join-Path $DestDir 'brand.svg')
            Write-Host "  fallback SVG -> $DestDir"
        }
    }
}

function Write-PngFromSvg {
    param([string]$SvgPath, [string]$PngPath, [int]$Size = 128)
    if (-not (Test-Path $SvgPath)) { return $false }
    if (Test-Path $PngPath) { return $true }
    try {
        $cli = Join-Path $env:TEMP 'nexus-resvg-cli.mjs'
        @'
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const svg = readFileSync(process.argv[2]);
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: Number(process.argv[4]) } });
writeFileSync(process.argv[3], resvg.render().asPng());
'@ | Set-Content -Encoding UTF8 $cli
        Push-Location $env:TEMP
        npm install --no-save @resvg/resvg-js 2>$null | Out-Null
        Pop-Location
        node $cli $SvgPath $PngPath $Size
        return (Test-Path $PngPath)
    } catch {
        Write-Warning "PNG from SVG failed ($SvgPath): $_"
        return $false
    }
}

$anyFrontend = Test-Path $FrontendBrand
if (-not $anyFrontend) {
    Write-Warning "Frontend brand folder missing: $FrontendBrand - using extension SVG fallbacks only."
}

$aiFallback = Join-Path $ExtRoot 'nexus-ai\media\brand\logo\brand.svg'

foreach ($t in $Targets) {
    $extPath = Join-Path $ExtRoot $t.Ext
    foreach ($key in $t.Subdirs.Keys) {
        $feSub = $t.Subdirs[$key]
        $destSub = if ($key -eq 'icon') { 'logo' } elseif ($key -eq 'full') { 'logo_and_name' } else { 'only_name' }
        $dest = Join-Path (Join-Path $extPath 'media') "brand\$destSub"
        $src = if ($anyFrontend) { Join-Path $FrontendBrand $feSub } else { $null }
        if ($src -and (Test-Path $src)) {
            if (Copy-BrandVariant -SrcDir $src -DestDir $dest) {
                Write-Host "[$($t.Ext)] $key from $src"
            } else {
                Ensure-FallbackSvg -DestDir $dest -FallbackSvg $aiFallback
            }
        } else {
            Ensure-FallbackSvg -DestDir $dest -FallbackSvg $aiFallback
        }
    }
}

# VSIX / activity bar need PNG
$iconDirs = @(
    (Join-Path $ExtRoot 'nexus-ai\media\brand\logo'),
    (Join-Path $ExtRoot 'nexus-billing\media\brand')
)
New-Item -ItemType Directory -Force -Path (Join-Path $ExtRoot 'nexus-billing\media\brand') | Out-Null
foreach ($dir in $iconDirs) {
    $svg = Join-Path $dir 'brand.svg'
    if (-not (Test-Path $svg)) { Copy-Item -Force $aiFallback $svg }
    $png = Join-Path $dir 'brand.png'
    if (-not (Write-PngFromSvg -SvgPath $svg -PngPath $png -Size 128)) {
        Write-Warning "No brand.png in $dir - add PNG manually or install Node for SVG conversion."
    } else {
        Write-Host "PNG: $png"
    }
}

$billingIcon = Join-Path $ExtRoot 'nexus-billing\media\brand\icon.png'
$billingPng = Join-Path $ExtRoot 'nexus-billing\media\brand\brand.png'
if ((Test-Path $billingPng) -and -not (Test-Path $billingIcon)) {
    Copy-Item -Force $billingPng $billingIcon
}

Write-Host 'Brand sync done. Run sync-extensions.ps1 before IDE build.'
