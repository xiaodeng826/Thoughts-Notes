@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js not found.
  echo       Install it from https://nodejs.org/ then run this again.
  echo.
  pause
  exit /b 1
)
node "%~dp0admin\server.js" --open
if errorlevel 1 pause