@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
    echo Installation failed. Extract the entire ZIP and close Tabby before retrying.
    pause
    exit /b 1
)
exit /b 0
