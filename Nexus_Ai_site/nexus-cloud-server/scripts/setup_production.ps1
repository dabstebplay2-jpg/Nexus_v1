# Production setup: .env -> Render env file + API push if RENDER_API_KEY set
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

. (Join-Path $PSScriptRoot "load_dotenv.ps1")

$outFile = Join-Path $root "deploy\render-production.env"
New-Item -ItemType Directory -Force -Path (Split-Path $outFile) | Out-Null

function Get-EnvOrDefault([string]$Name, [string]$Default) {
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ($v) { return $v }
    return $Default
}

$dbLine = ""
if (-not $env:UPSTASH_REDIS_REST_URL) {
    $dbLine = "NEXUS_CLOUD_DATABASE_URL=$(Get-EnvOrDefault 'NEXUS_CLOUD_DATABASE_URL' 'sqlite:///./nexus_cloud_v2.db')"
}

$lines = @(
    "ROUTER_AI_MASTER_KEY=$($env:ROUTER_AI_MASTER_KEY)"
    "ROUTER_AI_BASE_URL=$(Get-EnvOrDefault 'ROUTER_AI_BASE_URL' 'https://routerai.ru/api/v1')"
    "ROUTER_AI_PROVISION_ON_REGISTER=$(Get-EnvOrDefault 'ROUTER_AI_PROVISION_ON_REGISTER' 'true')"
    "ROUTER_AI_ALLOW_PLATFORM_INFERENCE=false"
    "NEXUS_CLOUD_SECRET_KEY=$($env:NEXUS_CLOUD_SECRET_KEY)"
    $dbLine
    "NEXUS_CORS_ORIGINS=$(Get-EnvOrDefault 'NEXUS_CORS_ORIGINS' 'https://nexus-zeta-ruby-12.vercel.app')"
    "NEXUS_BILLING_TEST_MODE=false"
    "NEXUS_TESTING_MODE=false"
    "NEXUS_REMOTE_ADMIN=true"
    "NEXUS_LOCAL_ADMIN=false"
    "NEXUS_ADMIN_PASSWORD=$(Get-EnvOrDefault 'NEXUS_ADMIN_PASSWORD' '')"
    "UPSTASH_REDIS_REST_URL=$($env:UPSTASH_REDIS_REST_URL)"
    "UPSTASH_REDIS_REST_TOKEN=$($env:UPSTASH_REDIS_REST_TOKEN)"
) | Where-Object { $_ -and $_.Trim() -ne "" }

$lines | Set-Content -Path $outFile -Encoding UTF8
Write-Host "Wrote $outFile" -ForegroundColor Green

try {
    Set-Clipboard -Value ($lines -join [Environment]::NewLine)
    Write-Host "Copied to clipboard for Render Environment" -ForegroundColor Cyan
}
catch {
    Write-Host "Copy manually from $outFile" -ForegroundColor Yellow
}

if ($env:RENDER_API_KEY) {
    Write-Host "RENDER_API_KEY found - pushing via API..." -ForegroundColor Cyan
    python (Join-Path $PSScriptRoot "push_render_env.py")
    if ($LASTEXITCODE -eq 0) { exit 0 }
}

Write-Host "Open Render: nexus-cloud -> Environment -> Add from .env -> paste -> Save -> Manual Deploy" -ForegroundColor Yellow
Start-Process "https://dashboard.render.com"
