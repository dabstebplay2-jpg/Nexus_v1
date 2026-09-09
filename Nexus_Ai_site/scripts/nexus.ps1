# Nexus monorepo — local dev CLI (install / start / stop / diagnose / admin)
# Usage: .\scripts\nexus.ps1 <command> [options]
# Or:    nexus.bat <command>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = '',

    [switch]$Cloud,
    [switch]$Backend,
    [switch]$Frontend,

    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$Script:Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Script:Lib = Join-Path $PSScriptRoot 'lib'

function Find-NexusPython {
    $venvPy = Join-Path $Script:Root 'venv\Scripts\python.exe'
    if (Test-Path $venvPy) { return $venvPy }
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    Write-Host '[ERROR] Python not found. Install Python 3.10+ or run: python -m venv venv' -ForegroundColor Red
    exit 1
}

function Invoke-FreePort {
    param([int]$Port)
    & (Join-Path $Script:Lib 'free-port.ps1') -Port $Port
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-FreePorts {
    param([int[]]$Ports = @(8080, 8000, 5173))
    foreach ($p in $Ports) {
        Invoke-FreePort -Port $p
    }
}

function Show-NexusHelp {
    Write-Host ''
    Write-Host 'Usage: nexus.bat [command]' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  install         pip + npm dependencies'
    Write-Host '  start           cloud (8080) + backend (8000) + frontend (5173)'
    Write-Host '  start -Cloud    cloud API only'
    Write-Host '  start -Backend  local IDE proxy only'
    Write-Host '  start -Frontend Vite UI only'
    Write-Host '  cloud             alias for start -Cloud'
    Write-Host '  backend           alias for start -Backend'
    Write-Host '  frontend          alias for start -Frontend'
    Write-Host '  admin             local admin UI on :8790'
    Write-Host '  stop              free ports 5173, 8000, 8080'
    Write-Host '  diagnose          port check and health'
    Write-Host ''
    Write-Host 'Open: http://localhost:5173'
    Write-Host ''
}

function Show-NexusMenu {
    while ($true) {
        Write-Host ''
        Write-Host 'Nexus launcher' -ForegroundColor Cyan
        Write-Host '  1  install     dependencies (once)'
        Write-Host '  2  start       cloud + backend + frontend'
        Write-Host '  3  cloud       API port 8080'
        Write-Host '  4  backend     proxy port 8000'
        Write-Host '  5  frontend    UI port 5173'
        Write-Host '  6  admin       local admin :8790'
        Write-Host '  7  stop        free ports 5173, 8000, 8080'
        Write-Host '  8  diagnose    ports and health'
        Write-Host '  9  help'
        Write-Host '  Q  quit'
        Write-Host ''
        $choice = Read-Host 'Select [1-9 or Q]'
        switch -Regex ($choice) {
            '^1$' { Install-NexusDeps; continue }
            '^2$' { Start-NexusStack; continue }
            '^3$' { Start-NexusCloud -Foreground; continue }
            '^4$' { Start-NexusBackend -Foreground; continue }
            '^5$' { Start-NexusFrontend -Foreground; continue }
            '^6$' { Start-NexusAdmin; continue }
            '^7$' { Stop-Nexus; continue }
            '^8$' { Invoke-NexusDiagnose; continue }
            '^9$' { Show-NexusHelp; continue }
            '^[Qq]$' { return }
            '^$' { continue }
            default { Write-Host 'Invalid choice.' -ForegroundColor Yellow }
        }
    }
}

function Install-NexusDeps {
    $py = Find-NexusPython
    Write-Host ''
    Write-Host '=== Nexus: install dependencies ===' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '[1/3] nexus-cloud-server'
    & $py -m pip install -r (Join-Path $Script:Root 'nexus-cloud-server\requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed (nexus-cloud-server)' }
    Write-Host ''
    Write-Host '[2/3] backend'
    & $py -m pip install -r (Join-Path $Script:Root 'backend\requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed (backend)' }
    Write-Host ''
    Write-Host '[3/3] frontend'
    Push-Location (Join-Path $Script:Root 'frontend')
    try {
        npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    }
    finally { Pop-Location }
    Write-Host ''
    Write-Host 'OK. Run: nexus.bat start' -ForegroundColor Green
}

function Start-NexusCloud {
    param([switch]$Foreground)
    $py = Find-NexusPython
    Invoke-FreePort -Port 8080
    if ($Foreground) {
        & $py (Join-Path $Script:Lib 'serve-cloud.py')
        exit $LASTEXITCODE
    }
}

function Start-NexusBackend {
    param([switch]$Foreground)
    $py = Find-NexusPython
    Invoke-FreePort -Port 8000
    if ($Foreground) {
        & $py (Join-Path $Script:Lib 'serve-backend.py')
        exit $LASTEXITCODE
    }
}

function Start-NexusFrontend {
    param([switch]$Foreground)
    Invoke-FreePort -Port 5173
    $fe = Join-Path $Script:Root 'frontend'
    if (-not (Test-Path (Join-Path $fe 'node_modules'))) {
        Write-Host 'npm install...'
        Push-Location $fe
        try { npm.cmd install } finally { Pop-Location }
    }
    if ($Foreground) {
        Push-Location $fe
        try {
            Write-Host 'Nexus Frontend: http://localhost:5173'
            npm.cmd run dev
            exit $LASTEXITCODE
        }
        finally { Pop-Location }
    }
}

function Start-NexusStack {
    param(
        [switch]$CloudOnly,
        [switch]$BackendOnly,
        [switch]$FrontendOnly
    )

    $startCloud = $CloudOnly -or (-not $CloudOnly -and -not $BackendOnly -and -not $FrontendOnly)
    $startBackend = $BackendOnly -or (-not $CloudOnly -and -not $BackendOnly -and -not $FrontendOnly)
    $startFrontend = $FrontendOnly -or (-not $CloudOnly -and -not $BackendOnly -and -not $FrontendOnly)

    if ($startCloud -or $startBackend -or $startFrontend) {
        $ports = @()
        if ($startCloud) { $ports += 8080 }
        if ($startBackend) { $ports += 8000 }
        if ($startFrontend) { $ports += 5173 }
        Write-Host ''
        Write-Host "[Nexus] Free ports $($ports -join ', ')..."
        Invoke-FreePorts -Ports $ports
        Start-Sleep -Seconds 2
    }

    $ps1 = Join-Path $Script:Root 'scripts\nexus.ps1'
    $psBase = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $ps1)

    if ($startCloud) {
        Write-Host '[Nexus] Starting Cloud...'
        Start-Process cmd -ArgumentList (@('/k', 'powershell') + $psBase + '_run-cloud')
        Start-Sleep -Seconds 4
    }
    if ($startBackend) {
        Write-Host '[Nexus] Starting Backend...'
        Start-Process cmd -ArgumentList (@('/k', 'powershell') + $psBase + '_run-backend')
        Start-Sleep -Seconds 2
    }
    if ($startFrontend) {
        Write-Host '[Nexus] Starting Frontend...'
        Start-Process cmd -ArgumentList (@('/k', 'powershell') + $psBase + '_run-frontend')
    }

    Write-Host ''
    Write-Host 'Done. Open: http://localhost:5173' -ForegroundColor Green
    if ($startCloud) {
        Write-Host ''
        Write-Host 'CHECK window "Nexus Cloud 8080":'
        Write-Host '  OK  = Uvicorn running on http://127.0.0.1:8080'
        Write-Host '  BAD = port busy — run: nexus.bat stop'
    }
    Write-Host ''
}

function Stop-Nexus {
    Write-Host 'Stopping Nexus (ports 5173, 8000, 8080)...'
    Invoke-FreePorts
    Start-Sleep -Seconds 2
    Write-Host 'Done. Run: nexus.bat start'
}

function Invoke-NexusDiagnose {
    & (Join-Path $Script:Lib 'diagnose.ps1')
}

function Start-NexusAdmin {
    $script = Join-Path $Script:Root 'nexus-cloud-server\scripts\start_local_admin.ps1'
    if (-not (Test-Path $script)) {
        Write-Error "Not found: $script"
        exit 1
    }
    & $script @args
    exit $LASTEXITCODE
}

function Invoke-PauseIfNeeded {
    if (-not $NoPause -and $Host.Name -eq 'ConsoleHost') {
        $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
        $pname = (Get-CimInstance Win32_Process -Filter "ProcessId=$parent" -ErrorAction SilentlyContinue).Name
        if ($pname -match 'cmd\.exe') {
            pause
        }
    }
}

# --- main ---
Set-Location $Script:Root

$cmd = $Command.Trim().ToLowerInvariant()

if (-not $cmd) {
    Show-NexusMenu
    exit 0
}

try {
    switch ($cmd) {
        { $_ -in 'help', '-?', '--help' } { Show-NexusHelp }
        { $_ -in 'install', 'install-deps' } { Install-NexusDeps }
        { $_ -in 'start', 'start-all' } {
            Start-NexusStack -CloudOnly:$Cloud -BackendOnly:$Backend -FrontendOnly:$Frontend
        }
        { $_ -in 'cloud', 'start-cloud' } { Start-NexusCloud -Foreground }
        { $_ -in 'backend', 'start-backend' } { Start-NexusBackend -Foreground }
        { $_ -in 'frontend', 'start-frontend' } { Start-NexusFrontend -Foreground }
        'admin' { Start-NexusAdmin }
        { $_ -in 'stop', 'stop-all' } { Stop-Nexus }
        'diagnose' { Invoke-NexusDiagnose }
        '_run-cloud' { Start-NexusCloud -Foreground }
        '_run-backend' { Start-NexusBackend -Foreground }
        '_run-frontend' { Start-NexusFrontend -Foreground }
        default {
            Write-Host "Unknown command: $Command" -ForegroundColor Red
            Show-NexusHelp
            exit 1
        }
    }
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Invoke-PauseIfNeeded
