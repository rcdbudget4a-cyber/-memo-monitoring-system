@echo off
setlocal EnableExtensions
title Disable RCD Memo Monitoring Server

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

echo Stopping the RCD Memo Monitoring Server...
schtasks /End /TN "RCD Memo Monitoring Server" >nul 2>&1

echo Disabling automatic server startup...
schtasks /Change /TN "RCD Memo Monitoring Server" /Disable >nul
if errorlevel 1 (
  echo.
  echo ERROR: Windows could not disable the server task.
  pause
  exit /b 1
)

echo.
echo ========================================================
echo RCD Memo Monitoring Server is now DISABLED.
echo All client computers will be disconnected.
echo Run ENABLE.bat as Administrator to use the server again.
echo ========================================================
echo.
pause

