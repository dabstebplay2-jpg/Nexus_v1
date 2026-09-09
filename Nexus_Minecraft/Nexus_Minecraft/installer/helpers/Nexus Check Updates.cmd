@echo off
setlocal
cd /d "%~dp0"
if not exist "NexusLauncher.exe" (
  echo NexusLauncher.exe not found in %CD%
  pause
  exit /b 1
)
start "" "%CD%\NexusLauncher.exe" --open-updates
endlocal
