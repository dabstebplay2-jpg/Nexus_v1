# Nexus - force-free a TCP listen port (Windows + uvicorn multiprocessing)
param(
    [Parameter(Mandatory = $true)]
    [int]$Port
)

$ErrorActionPreference = 'SilentlyContinue'

function Stop-PidTree {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    Write-Host "[port $Port] taskkill /T PID $ProcessId"
    taskkill /PID $ProcessId /T /F 2>$null | Out-Null
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-MultiprocessingChildren {
    param([int]$ParentPid)
    Get-CimInstance Win32_Process -Filter "name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ParentProcessId -eq $ParentPid -or
            ($_.CommandLine -match 'spawn_main' -and $_.CommandLine -match "parent_pid=$ParentPid")
        } |
        ForEach-Object { Stop-PidTree -ProcessId $_.ProcessId }
}

for ($round = 0; $round -lt 6; $round++) {
    $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if (-not $conns) { break }

    foreach ($c in $conns) {
        $owner = [int]$c.OwningProcess
        Stop-MultiprocessingChildren -ParentPid $owner
        Stop-PidTree -ProcessId $owner
    }

    Get-CimInstance Win32_Process -Filter "name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -match 'uvicorn|spawn_main|app\.main:app' -and
            ($_.CommandLine -match ":$Port" -or $_.CommandLine -match '--port\s+' + $Port)
        } |
        ForEach-Object { Stop-PidTree -ProcessId $_.ProcessId }

    Start-Sleep -Milliseconds 700
}

Start-Sleep -Seconds 1

$still = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($still) {
    $pids = ($still | Select-Object -ExpandProperty OwningProcess -Unique) -join ','
    Write-Host "[port $Port] STILL BUSY - netstat PID: $pids"
    Write-Host "Run Task Manager -> end all python.exe, or reboot PC."
    exit 1
}

Write-Host "[port $Port] free"
exit 0
