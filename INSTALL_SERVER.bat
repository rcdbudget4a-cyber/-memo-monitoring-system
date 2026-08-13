@echo off
setlocal EnableExtensions
title Install RCD Memo Monitoring Server

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Requesting Administrator permission...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

where node.exe >nul 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo Node.js is required but is not installed.
  echo Install the current Node.js LTS version, then run this installer again.
  echo Download: https://nodejs.org/en/download
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%N in ('where node.exe 2^>nul') do (
  set "NODE_EXE=%%N"
  goto :node_found
)
:node_found
if not defined NODE_EXE (
  echo Unable to determine the full path of Node.js.
  pause
  exit /b 1
)

set "APPDIR=%ProgramData%\RCD Memo Monitoring System"
if not exist "%APPDIR%" mkdir "%APPDIR%"

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip=Get-NetRoute -DestinationPrefix '0.0.0.0/0' ^| Sort-Object RouteMetric ^| Select-Object -First 1 ^| ForEach-Object { Get-NetIPAddress -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue ^| Where-Object { $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1 -ExpandProperty IPAddress }; if($ip){$ip}"`) do set "SERVER_IP=%%I"
if not defined SERVER_IP (
  echo ERROR: No active LAN IPv4 address was detected.
  echo Connect this computer to the office network, then run the installer again.
  pause
  exit /b 1
)
set "SERVER_URL=http://%SERVER_IP%:3000"

set "DBBACKUP=%TEMP%\rcd_memos_db_backup.json"
if exist "%APPDIR%\data\memos_db.json" copy /Y "%APPDIR%\data\memos_db.json" "%DBBACKUP%" >nul

echo Installing application files...
robocopy "%~dp0" "%APPDIR%" /E /R:2 /W:1 /XD scratch node_modules /XF INSTALL_SERVER.bat >nul
if errorlevel 8 (
  echo Installation failed while copying files.
  pause
  exit /b 1
)
if exist "%DBBACKUP%" (
  copy /Y "%DBBACKUP%" "%APPDIR%\data\memos_db.json" >nul
  del /Q "%DBBACKUP%" >nul 2>&1
)
>"%APPDIR%\node-path.txt" echo %NODE_EXE%
>"%APPDIR%\server-url.txt" echo %SERVER_URL%

echo Adding Windows Firewall rule for TCP port 3000...
netsh advfirewall firewall delete rule name="RCD Memo Monitoring Server" >nul 2>&1
netsh advfirewall firewall add rule name="RCD Memo Monitoring Server" dir=in action=allow protocol=TCP localport=3000 profile=private >nul

echo Creating automatic startup task...
schtasks /Delete /TN "RCD Memo Monitoring Server" /F >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$a=New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/d /c ""' + $env:ProgramData + '\RCD Memo Monitoring System\START_SERVER_SILENT.cmd""'); $t=New-ScheduledTaskTrigger -AtStartup; $p=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName 'RCD Memo Monitoring Server' -Action $a -Trigger $t -Principal $p -Force | Out-Null"
if errorlevel 1 (
  echo ERROR: Windows could not create the automatic startup task.
  pause
  exit /b 1
)

echo Creating desktop shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%\scripts\create-shortcuts.ps1" -InstallFolder "%APPDIR%"

set "CLIENTPKG=%Public%\Desktop\RCD Memo Client Installer"
if not exist "%CLIENTPKG%\assets" mkdir "%CLIENTPKG%\assets"
if not exist "%CLIENTPKG%\scripts" mkdir "%CLIENTPKG%\scripts"
copy /Y "%APPDIR%\INSTALL_CLIENT.bat" "%CLIENTPKG%\INSTALL_CLIENT.bat" >nul
copy /Y "%APPDIR%\OPEN_RCD_MEMO_APP.cmd" "%CLIENTPKG%\OPEN_RCD_MEMO_APP.cmd" >nul
copy /Y "%APPDIR%\server-url.txt" "%CLIENTPKG%\server-url.txt" >nul
copy /Y "%APPDIR%\assets\ORCD-MEMO-ICON.ico" "%CLIENTPKG%\assets\ORCD-MEMO-ICON.ico" >nul
copy /Y "%APPDIR%\scripts\create-client-shortcut.ps1" "%CLIENTPKG%\scripts\create-client-shortcut.ps1" >nul

echo Starting server...
schtasks /Run /TN "RCD Memo Monitoring Server" >nul
timeout /t 5 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:3000/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo ERROR: The server did not start.
  echo Review this log file:
  echo "%APPDIR%\server.log"
  echo.
  if exist "%APPDIR%\server.log" powershell -NoProfile -Command "Get-Content -Tail 20 -LiteralPath '%APPDIR%\server.log'"
  pause
  exit /b 1
)

start "" "http://127.0.0.1:3000"

echo.
echo ========================================================
echo Installation complete.
echo Detected server address: %SERVER_URL%
echo ========================================================
echo A ready-to-send "RCD Memo Client Installer" folder was
echo created on the Public Desktop. Send that entire folder
echo to the other computers, then run INSTALL_CLIENT.bat.
echo.
echo IMPORTANT: Reserve %SERVER_IP% in the router or set it as
echo a static IP so client computers continue to connect after restart.
echo.
pause
