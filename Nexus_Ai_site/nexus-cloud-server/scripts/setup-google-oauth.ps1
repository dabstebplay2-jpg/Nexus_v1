# Интерактивная настройка Google OAuth → Render
# Запуск: cd nexus-cloud-server; .\scripts\setup-google-oauth.ps1

$ErrorActionPreference = "Stop"

$ProdFrontend = "https://nexus-zeta-ruby-12.vercel.app"
$ProdRedirect = "$ProdFrontend/api/auth/google/callback"
$LocalRedirect = "http://localhost:5173/api/auth/google/callback"

Write-Host ""
Write-Host "=== Google OAuth для Nexus ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1) Откройте Google Cloud Console:"
Write-Host "   https://console.cloud.google.com/apis/credentials"
Write-Host ""
Write-Host "2) OAuth consent screen (если пусто):"
Write-Host "   User type: External, App name: Nexus, Testing + Test users (ваш Gmail)"
Write-Host ""
Write-Host "3) Create Credentials -> OAuth client ID -> Web application"
Write-Host "   Authorized redirect URIs (оба):"
Write-Host "   - $ProdRedirect"
Write-Host "   - $LocalRedirect"
Write-Host ""
Write-Host "4) Скопируйте Client ID и Client Secret"
Write-Host ""

$clientId = Read-Host "GOOGLE_CLIENT_ID"
$clientSecret = Read-Host "GOOGLE_CLIENT_SECRET" -AsSecureString
$clientSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clientSecret)
)

$renderKey = Read-Host "RENDER_API_KEY (rnd_... из dashboard.render.com -> Account -> API Keys)"
if (-not $renderKey) {
    Write-Error "RENDER_API_KEY обязателен для автозаливки на Render"
}

$envPath = Join-Path $PSScriptRoot ".." ".env" | Resolve-Path -ErrorAction SilentlyContinue
if (-not $envPath) {
    $envPath = Join-Path $PSScriptRoot ".." ".env"
    $example = Join-Path $PSScriptRoot ".." "deploy" "google-oauth-production.env.example"
    if (Test-Path $example) {
        Copy-Item $example $envPath
        Write-Host "Создан .env из google-oauth-production.env.example"
    } else {
        New-Item -ItemType File -Path $envPath | Out-Null
    }
}

function Set-EnvLine($path, $key, $value) {
    $lines = @()
    if (Test-Path $path) { $lines = Get-Content $path }
    $filtered = $lines | Where-Object { $_ -notmatch "^\s*$key\s*=" }
    $filtered += "$key=$value"
    Set-Content -Path $path -Value $filtered -Encoding UTF8
}

Set-EnvLine $envPath "RENDER_API_KEY" $renderKey
Set-EnvLine $envPath "GOOGLE_CLIENT_ID" $clientId.Trim()
Set-EnvLine $envPath "GOOGLE_CLIENT_SECRET" $clientSecretPlain.Trim()
Set-EnvLine $envPath "GOOGLE_REDIRECT_URI" $ProdRedirect
Set-EnvLine $envPath "NEXUS_FRONTEND_URL" $ProdFrontend

Write-Host ""
Write-Host "Синхронизация с Render..." -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "..")
try {
    python scripts/sync_google_render_env.py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    .\scripts\check-google-oauth.ps1
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Готово. Проверьте вход: $ProdFrontend" -ForegroundColor Green
