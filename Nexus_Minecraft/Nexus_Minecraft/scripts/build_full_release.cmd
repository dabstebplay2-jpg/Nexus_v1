@echo off
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_full_release.ps1" %*
exit /b %ERRORLEVEL%
