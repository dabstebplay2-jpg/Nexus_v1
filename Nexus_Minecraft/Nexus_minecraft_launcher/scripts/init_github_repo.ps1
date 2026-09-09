param(
    [Parameter(Mandatory=$true)][string]$Owner,
    [Parameter(Mandatory=$true)][string]$Repo = "NexusLauncher"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

Write-Host "Initializing git repo..."
git init
git add .
git commit -m "Initial Nexus Launcher release-ready project"

Write-Host ""
Write-Host "Create repo on GitHub first, then run:"
Write-Host "git remote add origin https://github.com/$Owner/$Repo.git"
Write-Host "git branch -M main"
Write-Host "git push -u origin main"
Write-Host ""
Write-Host "Before releases, update core/app_info.py or build with env:"
Write-Host '$env:NEXUS_GITHUB_OWNER="'$Owner'"'
Write-Host '$env:NEXUS_GITHUB_REPO="'$Repo'"'
