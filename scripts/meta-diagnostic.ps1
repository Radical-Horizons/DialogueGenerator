param(
    [string]$Query = "",
    [int]$Limit = 10
)

$today = Get-Date -Format "yyyy-MM-dd"
$logFile = "data/logs/logs_$today.json"

Write-Host "--- META-DIAGNOSTIC (Evidence Gathering) ---" -ForegroundColor Cyan

# 1. Recent Logs
if (Test-Path $logFile) {
    Write-Host "[1] Reading recent errors from $logFile..." -ForegroundColor Yellow
    # Search for ERROR or CRITICAL in the JSON log
    $errors = Get-Content $logFile -Tail 1000 | Where-Object { $_ -match '"level":\s*"(ERROR|CRITICAL)"' }
    if ($errors) {
        $errors | Select-Object -Last $Limit
    } else {
        Write-Host "No ERROR/CRITICAL found in last 1000 lines." -ForegroundColor Gray
    }
} else {
    Write-Host "[1] No log file found for today ($logFile)" -ForegroundColor Gray
}

# 2. Terminal State
Write-Host "`n[2] Reading recent terminal outputs..." -ForegroundColor Yellow
# Using environment variable or relative path if possible, but let's stick to the provided absolute path for now as it's reliable
$terminalsDir = "C:\Users\ecali\.cursor\projects\f-Projets-Notion-Scrapper-DialogueGenerator/terminals"
if (Test-Path $terminalsDir) {
    Get-ChildItem $terminalsDir -Filter "*.txt" | ForEach-Object {
        Write-Host "Terminal: $($_.Name)" -ForegroundColor Gray
        # Read the metadata (first 10 lines) and the tail (last 10 lines)
        Get-Content $_.FullName -TotalCount 5
        Write-Host "..." -ForegroundColor Gray
        Get-Content $_.FullName -Tail 15
        Write-Host "-------------------" -ForegroundColor Gray
    }
}

# 3. Transcript Search (if query provided)
if ($Query) {
    Write-Host "`n[3] Searching transcripts for '$Query'..." -ForegroundColor Yellow
    python scripts/peek_cursor_transcript.py search $Query --max-matches 5
}

Write-Host "`n--- END OF EVIDENCE ---" -ForegroundColor Cyan
