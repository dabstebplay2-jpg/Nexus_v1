# Проверка ЮKassa на Render (без секретов)
param(
    [string]$CloudBase = "https://nexus-cloud-bxcc.onrender.com"
)

$uri = "$($CloudBase.TrimEnd('/'))/v1/billing/catalog"
Write-Host "GET $uri"
try {
    $cat = Invoke-RestMethod -Uri $uri -TimeoutSec 90
} catch {
    Write-Error $_
    exit 1
}

$cat | Select-Object payment_provider, yookassa_configured, testing_mode | Format-List
Write-Host ""

if ($cat.yookassa_configured) {
    Write-Host "OK yookassa_configured=true payment_provider=$($cat.payment_provider)"
    exit 0
}

Write-Host "FAIL yookassa_configured=false"
if ($cat.testing_mode -or $cat.payment_provider -eq 'test') {
    Write-Host "Сейчас только тестовый биллинг (NEXUS_BILLING_TEST_MODE). Для реальных платежей задайте YOOKASSA_* на Render."
} else {
    Write-Host "На Render задайте YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, NEXUS_BILLING_TEST_MODE=false"
}
Write-Host "См. docs/YOOKASSA_RU.md"
exit 1
