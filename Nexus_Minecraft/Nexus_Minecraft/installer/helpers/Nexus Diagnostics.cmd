@echo off
setlocal
set "APPDIR=%~dp0"
set "BASE=%APPDATA%\NexusLauncher"
set "REPORT=%BASE%\diagnostics\nexus_diagnostics.txt"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$base=$env:APPDATA+'\NexusLauncher';" ^
  "$report=$base+'\diagnostics\nexus_diagnostics.txt';" ^
  "New-Item -ItemType Directory -Force (Split-Path $report) | Out-Null;" ^
  "'Nexus Launcher diagnostics' | Set-Content $report -Encoding UTF8;" ^
  "'Date: ' + (Get-Date) | Add-Content $report -Encoding UTF8;" ^
  "'App folder: %APPDIR%' | Add-Content $report -Encoding UTF8;" ^
  "if (Test-Path '%APPDIR%NexusLauncher.exe') { $f=Get-Item '%APPDIR%NexusLauncher.exe'; 'EXE size: '+[math]::Round($f.Length/1MB,2)+' MB' | Add-Content $report -Encoding UTF8; 'EXE modified: '+$f.LastWriteTime | Add-Content $report -Encoding UTF8 };" ^
  "'Data folder: '+$base | Add-Content $report -Encoding UTF8;" ^
  "$log=$base+'\data\logs\latest.log'; if (Test-Path $log) { ''; '--- latest.log tail ---' | Add-Content $report -Encoding UTF8; Get-Content $log -Tail 120 | Add-Content $report -Encoding UTF8 } else { 'latest.log not found' | Add-Content $report -Encoding UTF8 };" ^
  "notepad $report"

endlocal
