@echo off
cd /d "%~dp0"
set "NODE_EXE="
if exist "%~dp0node-path.txt" set /p "NODE_EXE="<"%~dp0node-path.txt"
if not defined NODE_EXE set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo [%date% %time%] ERROR: Node.js was not found at "%NODE_EXE%" >> "%~dp0server.log"
  exit /b 1
)
"%NODE_EXE%" "%~dp0server.js" >> "%~dp0server.log" 2>&1
