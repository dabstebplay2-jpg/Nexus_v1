# Nexus Cloud - local admin UI
# http://127.0.0.1:8790/local-admin/

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$adminDist = Join-Path $root "admin_ui\dist\index.html"
if (-not (Test-Path $adminDist)) {
    Write-Host "Сборка admin_ui (первый запуск)…" -ForegroundColor Yellow
    Push-Location (Join-Path $root "admin_ui")
    npm ci 2>$null; if ($LASTEXITCODE -ne 0) { npm install }
    npm run build
    Pop-Location
}

. (Join-Path $PSScriptRoot "load_dotenv.ps1")

function Test-LocalPortInUse([int]$Port) {
    $pattern = "127\.0\.0\.1:${Port}\s+.*LISTENING"
    return [bool](netstat -ano | Select-String -Pattern $pattern -Quiet)
}

function Get-PortListenerPid([int]$Port) {
    $line = netstat -ano | Select-String "127\.0\.0\.1:${Port}\s+.*LISTENING" | Select-Object -First 1
    if (-not $line) { return $null }
    $parts = ($line -replace '\s+', ' ').ToString().Trim().Split(' ')
    return [int]$parts[-1]
}

function Find-FreeAdminPort([int]$StartPort) {
    for ($p = $StartPort; $p -lt ($StartPort + 10); $p++) {
        if (-not (Test-LocalPortInUse $p)) { return $p }
    }
    throw "Нет свободного порта в диапазоне ${StartPort}..$($StartPort + 9). Закройте старые uvicorn: nexus.bat stop или taskkill /PID <pid> /F"
}

$preferred = 8790
if ($env:NEXUS_ADMIN_PORT) { $preferred = [int]$env:NEXUS_ADMIN_PORT }

$port = $preferred
if (Test-LocalPortInUse $port) {
    $pidOnPort = Get-PortListenerPid $port
    $free = Find-FreeAdminPort ($port + 1)
    Write-Host "Порт $port занят (PID $pidOnPort). Админка: http://127.0.0.1:${free}/local-admin/" -ForegroundColor Yellow
    Write-Host "Чтобы освободить $port : taskkill /PID $pidOnPort /F" -ForegroundColor DarkGray
    $port = $free
}

if (-not (Test-Path ".env")) {
    Write-Host "Create .env from .env.example" -ForegroundColor Yellow
}

$env:NEXUS_LOCAL_ADMIN = "true"
if (-not $env:NEXUS_ADMIN_PASSWORD) {
    $env:NEXUS_ADMIN_PASSWORD = "nexus-admin-local"
    Write-Host "NEXUS_ADMIN_PASSWORD: nexus-admin-local (default)" -ForegroundColor Yellow
}

if (-not $env:NEXUS_ADMIN_DEFAULT_CLOUD_URL) {
    $env:NEXUS_ADMIN_DEFAULT_CLOUD_URL = "https://nexus-zeta-ruby-12.vercel.app/api"
}

Write-Host "Admin UI: http://127.0.0.1:${port}/local-admin/" -ForegroundColor Cyan
Write-Host "Cloud:    $env:NEXUS_ADMIN_DEFAULT_CLOUD_URL" -ForegroundColor Cyan
Write-Host "Logs:     admin_proxy -> v etom okne (INFO/ERROR)" -ForegroundColor DarkGray
Write-Host "Diag:     http://127.0.0.1:${port}/v1/admin-cloud-proxy/health" -ForegroundColor DarkGray

$req = Join-Path $root "requirements.txt"
$needPip = $true
python -c "import upstash_redis" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $needPip = $false }

if ($needPip -and (Test-Path $req)) {
    Write-Host "Installing dependencies from requirements.txt..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & python -m pip install -r $req
    $pipExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    if ($pipExit -ne 0) {
        Write-Warning "pip install exited with $pipExit. If Upstash fails: python -m pip install -r requirements.txt"
    }
}

# Na Windows --reload chasto lomaet multiprocessing; bez reload stabilnee
$uvicornArgs = @("app.main:app", "--host", "127.0.0.1", "--port", "$port")
if ($env:OS -notmatch "Windows") {
    $uvicornArgs += "--reload"
}

python -m uvicorn @uvicornArgs
