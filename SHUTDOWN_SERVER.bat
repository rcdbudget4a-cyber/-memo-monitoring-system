@echo off
setlocal EnableExtensions
title Shutdown RCD Memo Monitoring Server

:: ============================================================
::  SHUTDOWN_SERVER.bat
::  Gracefully stops the RCD Memo Monitoring Server.
::  Designed to run automatically on Windows shutdown via
::  Task Scheduler (registered by INSTALL_SHUTDOWN_TASK.bat).
:: ============================================================

set "LOGFILE=%ProgramData%\RCD Memo Monitoring System\server.log"

echo [%date% %time%] System is shutting down. Stopping RCD Memo Monitoring Server... >> "%LOGFILE%"

:: Stop the scheduled task so it doesn't restart
schtasks /End /TN "RCD Memo Monitoring Server" >nul 2>&1

:: Kill any running node.exe processes serving on port 3000
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo [%date% %time%] Killing node process PID %%P >> "%LOGFILE%"
    taskkill /PID %%P /F >nul 2>&1
)

:: Double-check: kill all node.exe if still running
taskkill /IM node.exe /F >nul 2>&1

echo [%date% %time%] RCD Memo Monitoring Server stopped successfully. >> "%LOGFILE%"

exit /b 0
