param([Parameter(Mandatory=$true)][string]$ClientFolder)
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'RCD Memo Monitoring System.lnk'))
$shortcut.TargetPath = (Join-Path $ClientFolder 'OPEN_RCD_MEMO_APP.cmd')
$shortcut.WorkingDirectory = $ClientFolder
$shortcut.Description = 'Connect to the PRO 4A RCD Memo Monitoring Server'
$shortcut.IconLocation = ((Join-Path $ClientFolder 'ORCD-MEMO-ICON.ico') + ',0')
$shortcut.Save()
