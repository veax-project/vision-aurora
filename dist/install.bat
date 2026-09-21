@echo off
rem Double-click to install these cursors for your Windows account.
rem Nothing here needs administrator rights, and it is reversible with uninstall.bat.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo Something went wrong. The message above says what.
)
echo.
pause
