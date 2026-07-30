$filePath = "C:\Users\CONFERENCE\.gemini\antigravity-ide\brain\ca629971-62af-4083-9385-59e44c8d8c6a\.system_generated\steps\152\content.md"
$rawText = Get-Content -Path $filePath -Raw -Encoding UTF8

# Extract starting from CSV header
$headerPattern = "Timestamp,Date Logged"
$pos = $rawText.IndexOf($headerPattern)
if ($pos -lt 0) {
    Write-Host "Header not found"
    exit
}

$csvText = $rawText.Substring($pos)
$tempCsvPath = "c:\Users\CONFERENCE\.gemini\antigravity-ide\scratch\memo-monitoring-system\scratch\data.csv"
Set-Content -Path $tempCsvPath -Value $csvText -Encoding UTF8

$data = Import-Csv -Path $tempCsvPath

$memos = @()
$counter = 1

foreach ($row in $data) {
    $subject = $row.'Subject / Title of Memo:'
    if ([string]::IsNullOrWhiteSpace($subject)) { continue }

    $dateLogged = $row.'Date Logged/Received:'
    if ([string]::IsNullOrWhiteSpace($dateLogged)) { $dateLogged = "1/23/2026" }

    $timeStr = $row.'Time:'
    if ([string]::IsNullOrWhiteSpace($timeStr)) { $timeStr = "8:00:00 AM" }

    $receivedBy = $row.'Input/Received By:'
    if ([string]::IsNullOrWhiteSpace($receivedBy)) { $receivedBy = "Pat Bornidor" }

    $originating = $row.'Originating Office:  '
    if ([string]::IsNullOrWhiteSpace($originating)) { $originating = "RCD" }

    $actionReq = $row.'Action Required 
(For Info, For Concur, Submit AAR/Action Taken)  '
    if ([string]::IsNullOrWhiteSpace($actionReq)) { $actionReq = $row.'Action Required (For Info, For Concur, Submit AAR/Action Taken)  ' }
    if ([string]::IsNullOrWhiteSpace($actionReq)) { $actionReq = "For Concur" }

    $remarksStatus = $row.'Remarks /  Status:'
    if ([string]::IsNullOrWhiteSpace($remarksStatus)) { $remarksStatus = "Transmitted to" }

    $transmitted = $row.'Transmitted to what Office 
ex: CRS, RCADD, DRDO, DRDA'
    if ([string]::IsNullOrWhiteSpace($transmitted)) { $transmitted = $row.'Transmitted to what Office ex: CRS, RCADD, DRDO, DRDA' }
    if ([string]::IsNullOrWhiteSpace($transmitted)) { $transmitted = "" }

    $dateReceived = $row.'DATE RECEIVED'
    if ([string]::IsNullOrWhiteSpace($dateReceived)) { $dateReceived = "" }

    $driveLink = $row.'Scanned Report/Documents:'
    if ([string]::IsNullOrWhiteSpace($driveLink)) { 
        $driveLink = "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing" 
    }

    # Clean whitespace & linebreaks
    $subject = ($subject -replace '\s+', ' ').Trim()
    $receivedBy = ($receivedBy -replace '\s+', ' ').Trim()
    $originating = ($originating -replace '\s+', ' ').Trim()
    $transmitted = ($transmitted -replace '\s+', ' ').Trim()
    $remarksStatus = ($remarksStatus -replace '\s+', ' ').Trim()

    $memoId = "MEMO-2026-" + ($counter.ToString("000"))
    $counter++

    $memoObj = [PSCustomObject]@{
        id = $memoId
        dateLogged = $dateLogged.Trim()
        time = $timeStr.Trim()
        receivedBy = $receivedBy
        originatingOffice = $originating
        subject = $subject
        actionRequired = $actionReq.Trim()
        remarksStatus = $remarksStatus
        transmittedOffice = $transmitted
        dateReceived = $dateReceived.Trim()
        driveLink = $driveLink.Trim()
        pages = 1
    }
    $memos += $memoObj
}

Write-Host "Total Memos parsed: $($memos.Count)"

$jsonStr = $memos | ConvertTo-Json -Depth 5 -Compress
$jsContent = "const INITIAL_MEMOS = " + ($memos | ConvertTo-Json -Depth 5) + ";"
$outputPath = "c:\Users\CONFERENCE\.gemini\antigravity-ide\scratch\memo-monitoring-system\js\memos_data.js"
Set-Content -Path $outputPath -Value $jsContent -Encoding UTF8
Write-Host "Exported to $outputPath"
