@echo off
setlocal
set "APPURL=http://127.0.0.1:3000"
if exist "%~dp0server-url.txt" set /p APPURL=<"%~dp0server-url.txt"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="%APPURL%" --start-maximized
) else (
  start "" "%APPURL%"
)
