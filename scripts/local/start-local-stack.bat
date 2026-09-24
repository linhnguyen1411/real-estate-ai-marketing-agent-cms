@echo off
setlocal
cd /d "%~dp0..\.."
title Real Estate AI — local stack
echo.
echo Starting CMS + Chrome CDP + Agent ...
echo Repo: %CD%
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-stack.ps1"
if errorlevel 1 (
  echo.
  echo Launcher failed.
  pause
  exit /b 1
)
echo.
echo Done. Check the 3 PowerShell windows (CMS, CDP, Agent).
timeout /t 8 >nul
