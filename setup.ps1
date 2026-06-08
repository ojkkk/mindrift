# Mindrift — One-Click Install & Start (PowerShell)
# Run: powershell -ExecutionPolicy Bypass -File setup.ps1
# Or simply double-click start.bat

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$PORT = 3344

function Write-Step($n, $msg) {
    Write-Host "`n[$n/5] $msg" -ForegroundColor Yellow
}
function Write-OK($msg) { Write-Host "  $msg" -ForegroundColor Green }
function Write-Err($msg) { Write-Host "  $msg" -ForegroundColor Red }

# Banner
Write-Host "`n╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Mindrift — AI Agent Dashboard        ║" -ForegroundColor Cyan
Write-Host "║     一键安装 · 自动运行                   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝`n" -ForegroundColor Cyan

# 1. Check Node.js
Write-Step 1 "Checking Node.js..."
try {
    $nv = node --version 2>$null
    if (-not $nv) { throw }
    Write-OK "Node.js $nv"
} catch {
    Write-Err "Node.js not found. Install from https://nodejs.org"
    pause; exit 1
}

# 2. Install dependencies (skip if already done)
$needInstall = -not (Test-Path "$ROOT\server\node_modules") -or -not (Test-Path "$ROOT\client\node_modules")
if ($needInstall) {
    Write-Step 2 "Installing dependencies (first run)..."
    Write-Host "  This may take 1-2 minutes..."

    Push-Location "$ROOT\server"
    npm install --silent 2>$null
    if ($LASTEXITCODE -ne 0) { npm install 2>$null }
    Pop-Location
    Write-OK "Server packages ready"

    Push-Location "$ROOT\client"
    npm install --silent 2>$null
    if ($LASTEXITCODE -ne 0) { npm install 2>$null }
    Pop-Location
    Write-OK "Client packages ready"
} else {
    Write-Step 2 "Dependencies already installed"
    Write-OK "Skipping"
}

# 3. Build frontend (skip if dist exists)
$needBuild = -not (Test-Path "$ROOT\client\dist\index.html")
if ($needBuild) {
    Write-Step 3 "Building frontend..."
    Push-Location "$ROOT\client"
    npx vite build 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Build failed, retrying..."
        Remove-Item -Recurse -Force "$ROOT\client\node_modules\.vite" -ErrorAction SilentlyContinue
        npx vite build 2>$null
    }
    Pop-Location
    Write-OK "Frontend built"
} else {
    Write-Step 3 "Frontend already built"
    Write-OK "Skipping"
}

# 4. Start server
Write-Step 4 "Starting Mindrift server..."

$existing = netstat -ano 2>$null | Select-String ":$PORT.*LISTENING"
if ($existing) {
    Write-OK "Already running on port $PORT"
} else {
    Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$ROOT\server`" && npx tsx index.ts" -WindowStyle Hidden

    Write-Host "  Waiting for server to start..."
    $tries = 0
    while ($tries -lt 15) {
        Start-Sleep 1
        if (netstat -ano 2>$null | Select-String ":$PORT.*LISTENING") { break }
        $tries++
    }
}

# 5. Open browser
Write-Step 5 "Opening dashboard..."
Start-Process "http://localhost:$PORT"

Write-Host "`n╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Mindrift is running!                  ║" -ForegroundColor Cyan
Write-Host "║   Dashboard: http://localhost:$PORT       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Tip: Close this window. Mindrift keeps running in background." -ForegroundColor Gray
Start-Sleep 3
