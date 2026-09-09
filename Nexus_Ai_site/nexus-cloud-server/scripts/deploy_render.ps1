# Полный деплой на Render: env + git push + redeploy
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

. (Join-Path $PSScriptRoot "load_dotenv.ps1")

Write-Host "=== Nexus Cloud -> Render ===" -ForegroundColor Cyan

Write-Host "`n1) Push environment to Render..." -ForegroundColor Yellow
python (Join-Path $PSScriptRoot "push_render_env.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n2) Push code to GitHub (main)..." -ForegroundColor Yellow
$status = git status --porcelain 2>&1
if ($status) {
    git add -A
    git reset HEAD .env deploy/render-production.env 2>$null
    git commit -m "security: production guards, Render deploy hardening, tests and CI"
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "git push failed — deploy env may still apply; push manually." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} else {
    Write-Host "No local changes to commit." -ForegroundColor Gray
    git push origin main 2>$null
}

Write-Host "`n3) Smoke test (after ~90s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 90
python (Join-Path $PSScriptRoot "smoke_test_render.py")

Write-Host "`nDone. API: https://nexus-cloud-bxcc.onrender.com/v1/health" -ForegroundColor Green
