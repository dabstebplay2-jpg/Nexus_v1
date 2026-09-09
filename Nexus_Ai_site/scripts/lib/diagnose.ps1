# Nexus diagnostics (ASCII output for cmd.exe)
$ErrorActionPreference = 'SilentlyContinue'

Write-Host "=== Nexus diagnostics ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Ports LISTEN (5173, 8000, 8080, 8790):"
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in 5173, 8000, 8080, 8790 } |
    ForEach-Object {
        Write-Host ("  {0}:{1}  PID {2}" -f $_.LocalAddress, $_.LocalPort, $_.OwningProcess)
    }

Write-Host ""
Write-Host "Python (uvicorn / multiprocessing):"
Get-CimInstance Win32_Process -Filter "name='python.exe'" |
    Where-Object { $_.CommandLine -match 'uvicorn|spawn_main|app\.main' } |
    ForEach-Object {
        $line = $_.CommandLine
        if ($line.Length -gt 120) { $line = $line.Substring(0, 120) + "..." }
        Write-Host ("  PID {0} parent={1}" -f $_.ProcessId, $_.ParentProcessId)
        Write-Host "    $line"
    }

Write-Host ""
Write-Host "Health checks:"
$urls = @(
    @{ Name = 'Cloud'; Url = 'http://127.0.0.1:8080/health' },
    @{ Name = 'Backend'; Url = 'http://127.0.0.1:8000/docs' },
    @{ Name = 'Frontend'; Url = 'http://127.0.0.1:5173/' }
)
foreach ($item in $urls) {
    try {
        $r = Invoke-WebRequest -Uri $item.Url -UseBasicParsing -TimeoutSec 4
        Write-Host ("  OK  {0} -> HTTP {1}" -f $item.Name, $r.StatusCode) -ForegroundColor Green
    }
    catch {
        Write-Host ("  FAIL {0} ({1})" -f $item.Name, $item.Url) -ForegroundColor Red
    }
}

Write-Host ""
$p8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($p8000) {
    $owner = $p8000.OwningProcess
    $spawn = Get-CimInstance Win32_Process -Filter "name='python.exe'" |
        Where-Object { $_.CommandLine -match "parent_pid=$owner" }
    if ($spawn) {
        Write-Host "ZOMBIE: port 8000 held by dead parent PID $owner" -ForegroundColor Yellow
        Write-Host "  -> run nexus.bat stop (kills multiprocessing children)"
    }
}

Write-Host ""
