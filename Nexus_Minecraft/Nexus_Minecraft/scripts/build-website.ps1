param(
    [string]$Version,
    [string]$Repo
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== Nexus Launcher website metadata ==" -ForegroundColor Cyan

$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = "python"
}

$Args = @("tools\generate_website_release.py")
if ($Version) {
    $Args += @("--version", $Version)
}
if ($Repo) {
    $Args += @("--repo", $Repo)
}

& $Python @Args

$Required = @(
    "website\index.html",
    "website\styles.css",
    "website\script.js",
    "website\release.json",
    "website\downloads\release.json",
    "website\assets\logo.svg",
    "website\assets\favicon.svg",
    "website\assets\og-cover.svg"
)

foreach ($Path in $Required) {
    if (-not (Test-Path (Join-Path $Root $Path))) {
        throw "Missing website file: $Path"
    }
}

Write-Host "Website metadata is ready." -ForegroundColor Green
Write-Host "Preview: cd website; ..\.venv\Scripts\python.exe -m http.server 8080"
