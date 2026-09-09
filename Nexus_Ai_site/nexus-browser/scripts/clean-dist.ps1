param(
    [ValidateSet('before', 'after')]
    [string]$Phase = 'after'
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version

if (-not (Test-Path $dist)) {
    exit 0
}

# Release win-unpacked/app.asar locks when the browser is still running.
Stop-Process -Name 'Nexus Browser' -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

$keep = @(
    "NexusBrowser-$version-Portable.exe",
    "NexusBrowser-$version-Setup.exe",
    "NexusBrowser-$version-Setup.exe.blockmap"
)

function Should-RemoveArtifact {
    param([string]$Name)

    if ($Name -match '^NexusBrowser-') {
        return $Name -notin $keep
    }
    if ($Name -match '\.blockmap$') {
        return $Name -notin $keep
    }
    if ($Name -eq 'builder-debug.yml') {
        return $true
    }
    if ($Name -match '^Nexus Browser ') {
        return $true
    }
    return $false
}

$removed = 0
$failed = 0

Get-ChildItem $dist -File -ErrorAction SilentlyContinue | ForEach-Object {
    if (-not (Should-RemoveArtifact $_.Name)) {
        return
    }

    try {
        Remove-Item $_.FullName -Force -ErrorAction Stop
        Write-Host "Removed: $($_.Name)" -ForegroundColor Yellow
        $removed++
    } catch {
        Write-Host "Skip (in use): $($_.Name)" -ForegroundColor DarkYellow
        $failed++
    }
}

if ($Phase -eq 'before' -and $removed -eq 0 -and $failed -eq 0) {
    Write-Host "dist/ already clean for v$version" -ForegroundColor DarkGray
} elseif ($Phase -eq 'after') {
    Write-Host "dist/ keeps only v$version artifacts" -ForegroundColor Green
}

exit 0
