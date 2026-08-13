$appDir = "$env:ProgramData\RCD Memo Monitoring System"
$srcDir = 'c:\Users\CONFERENCE\Downloads\RCD-Memo-Monitoring-Windows-AUTO-IP-WITH-CONTROLS\RCD-Memo-Monitoring-Windows'

# Step 1: Get Node path
$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { Write-Host 'ERROR: Node.js not found'; exit 1 }
Write-Host "Node.js found: $nodePath"

# Step 2: Get local IP
$ip = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 | ForEach-Object {
    Get-NetIPAddress -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1 -ExpandProperty IPAddress
}
if (-not $ip) { Write-Host 'ERROR: No IP found'; exit 1 }
Write-Host "Server IP: $ip"

# Step 3: Create app directory
if (-not (Test-Path $appDir)) { New-Item -ItemType Directory -Path $appDir -Force | Out-Null }
Write-Host "App dir ready: $appDir"

# Step 4: Copy files
& robocopy $srcDir $appDir /E /R:2 /W:1 /XD scratch node_modules /XF INSTALL_SERVER.bat | Out-Null
Write-Host 'Files copied'

# Step 5: Save config files
Set-Content -Path "$appDir\node-path.txt" -Value $nodePath
Set-Content -Path "$appDir\server-url.txt" -Value "http://${ip}:3000"
Write-Host "Config saved. Server URL: http://${ip}:3000"

# Step 6: Firewall rule
& netsh advfirewall firewall delete rule name="RCD Memo Monitoring Server" 2>$null | Out-Null
& netsh advfirewall firewall add rule name="RCD Memo Monitoring Server" dir=in action=allow protocol=TCP localport=3000 profile=private | Out-Null
Write-Host 'Firewall rule added'

# Step 7: Create scheduled task
$cmdArg = '/d /c ""' + $env:ProgramData + '\RCD Memo Monitoring System\START_SERVER_SILENT.cmd""'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdArg
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
& schtasks /Delete /TN "RCD Memo Monitoring Server" /F 2>$null | Out-Null
Register-ScheduledTask -TaskName 'RCD Memo Monitoring Server' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Host 'Scheduled task created'

# Step 8: Create shortcuts if script exists
$shortcutScript = "$appDir\scripts\create-shortcuts.ps1"
if (Test-Path $shortcutScript) {
    & $shortcutScript -InstallFolder $appDir
    Write-Host 'Shortcuts created'
}

# Step 9: Run the task
& schtasks /Run /TN "RCD Memo Monitoring Server"
Write-Host 'Server task started, waiting 5 seconds...'
Start-Sleep -Seconds 5

# Step 10: Health check
try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 'http://127.0.0.1:3000/api/health'
    if ($r.StatusCode -eq 200) {
        Write-Host "SERVER IS RUNNING OK at http://${ip}:3000"
    }
} catch {
    Write-Host 'Health check failed - server may still be starting or was already running on port 3000'
}

Write-Host ''
Write-Host '========================================================'
Write-Host "Installation complete. Server URL: http://${ip}:3000"
Write-Host '========================================================'
