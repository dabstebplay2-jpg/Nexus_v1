@echo off
set "MINICURSOR_PYTHON=%~dp0.venv\Scripts\python.exe"
if not exist "%MINICURSOR_PYTHON%" (
    echo MiniCursor environment is missing.
    echo Follow the setup steps in README.md first.
    pause
    exit /b 1
)
"%MINICURSOR_PYTHON%" "%~dp0minicursor.py"
pause
