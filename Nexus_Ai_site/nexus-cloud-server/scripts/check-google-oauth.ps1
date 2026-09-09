# Проверка Google OAuth на Render (без секретов)
param(
    [string]$CloudBase = "https://nexus-cloud-bxcc.onrender.com"
)

$uri = "$($CloudBase.TrimEnd('/'))/v1/auth/config"
Write-Host "GET $uri"
try {
    $cfg = Invoke-RestMethod -Uri $uri -TimeoutSec 90
} catch {
    Write-Error $_
    exit 1
}

$cfg | ConvertTo-Json -Depth 4
Write-Host ""

if ($cfg.google_oauth_enabled) {
    Write-Host "OK google_oauth_enabled=true"
    Write-Host "redirect: $($cfg.google_redirect_uri_configured)"
    exit 0
}

Write-Host "FAIL google_oauth_enabled=false"
Write-Host "На Render задайте GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, NEXUS_FRONTEND_URL"
Write-Host "См. docs/GOOGLE_AUTH.md"
exit 1
