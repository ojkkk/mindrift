# Mindrift Daemon — watches Codex.exe and auto-starts/stops Mindrift
# Runs silently in background. Put in Windows Startup folder to launch at login.

$mindriftServer = "D:\new idea\mindrift\server"
$logFile = "$env:TEMP\mindrift-daemon.log"

function Write-Log {
    param([string]$msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Write-Log "Daemon started, watching for Codex.exe..."

while ($true) {
    $codexRunning = Get-Process -Name "Codex" -ErrorAction SilentlyContinue
    $mPid = $null

    # Find PID listening on 3344
    try {
        $line = netstat -ano 2>$null | Select-String ":3344" | Select-String "LISTENING" | Select-Object -First 1
        if ($line) {
            $mPid = ($line -replace ".*LISTENING\s+", "").Trim()
        }
    } catch { }

    $mindriftRunning = $null -ne $mPid -and $mPid -ne "0"

    if ($codexRunning -and -not $mindriftRunning) {
        Write-Log "Codex detected, starting Mindrift..."
        Start-Process cmd -ArgumentList "/c cd /d `"$mindriftServer`" && node --import tsx index.ts >> `"$logFile`" 2>&1" -WindowStyle Hidden
    }
    elseif (-not $codexRunning -and $mindriftRunning) {
        Write-Log "Codex gone, stopping Mindrift (PID $mPid)..."
        Stop-Process -Id $mPid -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 5
}
