@echo off
setlocal
cd /d "%~dp0"
title Nexus Maker Diagnostics

echo ===== Diagnostika Nexus Maker =====
echo.
echo [1] Node:
node --version 2>&1
echo.
echo [2] npm:
npm --version 2>&1
echo.
echo [3] Proverka porta 5173:
netstat -ano | findstr ":5173"
echo.
echo [4] Proverka HTTP:
curl.exe -I --max-time 3 http://127.0.0.1:5173/ 2>&1
echo.
echo Esli net soedineniya, ostavte start.bat otkrytym i sohranite tekst etogo okna.
pause
