@echo off
setlocal EnableExtensions
title Enable RCD Memo Monitoring Server

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Requesting Administrator permission...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

schtasks /Query /TN "RCD Memo Monitoring Server" >nul 2>&1
if errorlevel 1 (
  echo.
  echo The RCD Memo Monitoring Server is not installed on this computer.
  echo Run INSTALL_SERVER.bat first.
  echo.
  pause
  exit /b 1
)

echo Enabling automatic server startup...
schtasks /Change /TN "RCD Memo Monitoring Server" /Enable >nul
if errorlevel 1 (
  echo.
  echo ERROR: Windows could not enable the server task.
  pause
  exit /b 1
)

echo Starting the RCD Memo Monitoring Server...
schtasks /Run /TN "RCD Memo Monitoring Server" >nul
if errorlevel 1 (
  echo.
  echo ERROR: Windows could not start the server task.
  pause
  exit /b 1
)

timeout /t 5 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:3000/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo ERROR: The task was started, but the server did not respond.
  echo Check the server log in:
  echo C:\ProgramData\RCD Memo Monitoring System\server.log
  echo.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:3000"
echo.
echo ========================================================
echo RCD Memo Monitoring Server is now ENABLED and RUNNING.
echo Automatic startup is enabled for the next Windows restart.
echo ========================================================
echo.
pause

