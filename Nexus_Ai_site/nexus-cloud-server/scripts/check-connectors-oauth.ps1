# Check connector OAuth config on cloud API.
# Usage:
#   $env:NEXUS_API = "https://nexus-cloud-bxcc.onrender.com"
#   $env:NEXUS_JWT = "<paste full nexus_access_token from Local Storage>"
#   .\scripts\check-connectors-oauth.ps1

function Write-DebugLog {
    param([string]$Message, [hashtable]$Data, [string]$HypothesisId = "A")
    $logPath = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "debug-24bf68.log"
    if (-not (Test-Path (Split-Path $logPath -Parent))) {
        $logPath = Join-Path $PSScriptRoot "..\..\debug-24bf68.log"
    }
    $entry = @{
        sessionId = "24bf68"
        hypothesisId = $HypothesisId
        location = "check-connectors-oauth.ps1"
        message = $Message
        data = $Data
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    Add-Content -Path $logPath -Value $entry -Encoding UTF8
}

$Base = if ($env:NEXUS_API) { $env:NEXUS_API.TrimEnd('/') } else { "https://nexus-cloud-bxcc.onrender.com" }
$Uri = "$Base/v1/connectors"
$token = ""
if ($env:NEXUS_JWT) { $token = $env:NEXUS_JWT.Trim() }

if (-not $token) {
    Write-Host "ERROR: Set NEXUS_JWT to your nexus_access_token (DevTools -> Application -> Local Storage)." -ForegroundColor Red
    # #region agent log
    Write-DebugLog -Message "missing_token" -Data @{ exitCode = 1 }
    # #endregion
    exit 1
}

if ($token -match '[<>]' -or $token -match 'nexus_access_token' -or $token -match 'перелогин' -or $token -match 'ПОЛНЫЙ' -or $token -match '\.\.\.') {
    Write-Host "ERROR: This is not a real token - you pasted the example from the instructions." -ForegroundColor Red
    Write-Host "In the browser: F12 -> Application -> Local Storage -> nexus_access_token." -ForegroundColor Yellow
    Write-Host "Double-click the Value cell, Ctrl+C, then run:" -ForegroundColor Yellow
    Write-Host '  $env:NEXUS_JWT = (Get-Clipboard -Raw).Trim()' -ForegroundColor Cyan
    Write-Host "Do not type eyJ... manually and do not use .... or FULL_TOKEN placeholders." -ForegroundColor Yellow
    # #region agent log
    Write-DebugLog -Message "placeholder_token" -Data @{ tokenLength = $token.Length; exitCode = 1 } -HypothesisId "B"
    # #endregion
    exit 1
}

if ($token -notmatch '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') {
    Write-Host "WARNING: Token does not look like a complete JWT. Request may fail with 401." -ForegroundColor Yellow
    # #region agent log
    Write-DebugLog -Message "jwt_format_warning" -Data @{ tokenLength = $token.Length } -HypothesisId "B"
    # #endregion
}

$Headers = @{ Authorization = "Bearer $token" }

try {
    $res = Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Get
} catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    # #region agent log
    Write-DebugLog -Message "api_error" -Data @{ status = $status; api = $Base } -HypothesisId "C"
    # #endregion
    if ($status -eq 401) {
        Write-Host "ERROR 401 Unauthorized: invalid or expired token." -ForegroundColor Red
        Write-Host "1. Log in at https://nexus-zeta-ruby-12.vercel.app" -ForegroundColor Yellow
        Write-Host "2. F12 -> Application -> Local Storage -> nexus_access_token" -ForegroundColor Yellow
        Write-Host "3. Copy the entire eyJ... string (no ... at the end)." -ForegroundColor Yellow
        Write-Host "4. Log out and log in again if needed." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Request failed: $_" -ForegroundColor Red
    exit 1
}

# #region agent log
Write-DebugLog -Message "api_ok" -Data @{
    userTier = $res.user_tier
    mvpOAuthReady = $res.oauth_status.mvp_oauth_ready
    connectorCount = @($res.connectors).Count
} -HypothesisId "C"
# #endregion

if ($res.oauth_status) {
    Write-Host "oauth_status:" ($res.oauth_status | ConvertTo-Json -Compress)
} else {
    Write-Host "oauth_status: (old API build - redeploy cloud with latest connectors code)" -ForegroundColor Yellow
}
Write-Host "user_tier:" $res.user_tier
Write-Host "tier_blocks_connectors:" $res.tier_blocks_connectors
$mvp = @($res.connectors | Where-Object { $_.mvp -and -not $_.coming_soon })
foreach ($c in $mvp) {
    $blocked = if ($null -ne $c.blocked_reason) { $c.blocked_reason } else { '-' }
    $oauth = if ($null -ne $c.oauth_ready) { $c.oauth_ready } else { '-' }
    Write-Host ("  {0}: available={1} blocked={2} oauth_ready={3}" -f $c.id, $c.available, $blocked, $oauth)
}

if ($res.oauth_status -and $res.oauth_status.mvp_oauth_ready) {
    Write-Host "OK: MVP OAuth configured on server." -ForegroundColor Green
    exit 0
}

if (-not $res.oauth_status) {
    Write-Host "Tip: test connect in UI or POST /v1/connectors/github/connect (503 = OAuth env missing on Render)." -ForegroundColor Yellow
    exit 0
}

Write-Host "Add OAuth env on Render - see docs/CONNECTORS_SETUP_RU.md" -ForegroundColor Yellow
exit 2
