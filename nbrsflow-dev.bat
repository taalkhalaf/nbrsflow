@echo off
rem One-click dev launcher for nbrsflow
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install || exit /b 1
)
call npm run dev
