@echo off
rem Double-click to remove these cursors and go back to the Windows defaults.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall
echo.
pause
