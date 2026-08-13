param([Parameter(Mandatory=$true)][string]$InstallFolder)
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'RCD Memo Monitoring System.lnk'))
$shortcut.TargetPath = (Join-Path $InstallFolder 'OPEN_RCD_MEMO_APP.cmd')
$shortcut.WorkingDirectory = $InstallFolder
$shortcut.Description = 'PRO 4A RCD Memo Monitoring System'
$shortcut.IconLocation = ((Join-Path $InstallFolder 'assets\ORCD-MEMO-ICON.ico') + ',0')
$shortcut.Save()
