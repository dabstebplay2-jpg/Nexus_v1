# Sync nexus-desktop/extensions/* into vscodium/builtin-extensions for packaged Nexus IDE builds.
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ExtSrc = Join-Path (Join-Path $RepoRoot 'nexus-desktop') 'extensions'
$BuiltinDir = Join-Path (Join-Path (Join-Path $RepoRoot 'nexus-desktop') 'vscodium') 'builtin-extensions'

if (-not (Test-Path $ExtSrc)) {
    Write-Error "Not found: $ExtSrc"
}

New-Item -ItemType Directory -Force -Path $BuiltinDir | Out-Null
Get-ChildItem $ExtSrc -Directory | Where-Object { $_.Name -ne '.vscode' } | ForEach-Object {
    $dest = Join-Path $BuiltinDir $_.Name
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Recurse -Force $_.FullName $dest
    Write-Host "Synced: $($_.Name)"
}
Write-Host "Done. Rebuild Nexus IDE so the app picks up builtin-extensions."
