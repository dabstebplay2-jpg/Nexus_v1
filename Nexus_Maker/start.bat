@echo off
setlocal
cd /d "%~dp0"
title Nexus Maker

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js ne ustanovlen.
  echo Skachayte Node.js s https://nodejs.org/ i zapustite etot fayl snova.
  pause
  exit /b 1
)

curl.exe -s --max-time 1 http://127.0.0.1:5173/ >nul 2>nul
if not errorlevel 1 (
  echo Nexus Maker uzhe zapushchen.
  start "" http://127.0.0.1:5173/
  exit /b 0
)

if not exist "node_modules\" (
  echo Ustanovka zavisimostey Nexus Maker...
  call npm install
  if errorlevel 1 (
    echo.
    echo Ne udalos vypolnit npm install.
    pause
    exit /b 1
  )
)

echo.
echo Zapusk Nexus Maker: http://127.0.0.1:5173/
echo Ne zakryvayte eto okno, poka Nexus Maker rabotaet.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5173/'"
call npm run dev

echo.
echo Server Nexus Maker ostanovlen.
pause
