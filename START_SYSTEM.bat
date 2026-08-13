@echo off
title PNP PRO 4A - RCD Memo Monitoring System (LAN Server)
color 0A
cd /d "%~dp0"
echo =========================================================
echo    STARTING RCD MEMO MONITORING SYSTEM LOCAL SERVER...
echo =========================================================
echo.
node server.js
pause
