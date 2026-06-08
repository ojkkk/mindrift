# Mindrift — One-Click Install & Start
# Run: powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Mindrift — Agent Observability     ║" -ForegroundColor Cyan
Write-Host "║         One-Click Setup v1.0             ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) { throw "Node.js not found" }
    Write-Host "  Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js is required. Install from https://nodejs.org" -ForegroundColor Red
    pause; exit 1
}

# 2. Install server dependencies
Write-Host "[2/5] Installing server dependencies..." -ForegroundColor Yellow
Push-Location "$ROOT\server"
npm install 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "  Server install failed!" -ForegroundColor Red; pause; exit 1 }
Write-Host "  Server dependencies installed" -ForegroundColor Green
Pop-Location

# 3. Install client dependencies
Write-Host "[3/5] Installing client dependencies..." -ForegroundColor Yellow
Push-Location "$ROOT\client"
npm install 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "  Client install failed!" -ForegroundColor Red; pause; exit 1 }
Write-Host "  Client dependencies installed" -ForegroundColor Green
Pop-Location

# 4. Build frontend
Write-Host "[4/5] Building frontend..." -ForegroundColor Yellow
Push-Location "$ROOT\client"
npx vite build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "  Build failed!" -ForegroundColor Red; pause; exit 1 }
Write-Host "  Frontend built successfully" -ForegroundColor Green
Pop-Location

# 5. Start server
Write-Host "[5/5] Starting Mindrift server..." -ForegroundColor Yellow
$PORT = 3344

# Check if already running
$existing = netstat -ano 2>$null | Select-String ":$PORT.*LISTENING"
if ($existing) {
    Write-Host "  Port $PORT is already in use. Mindrift may already be running." -ForegroundColor Yellow
    Write-Host "  Opening http://localhost:$PORT ..." -ForegroundColor Cyan
    Start-Process "http://localhost:$PORT"
    pause
    exit 0
}

# Start server in background
Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$ROOT\server`" && npx tsx index.ts" -WindowStyle Hidden
Start-Sleep 3

# Verify
$verify = netstat -ano 2>$null | Select-String ":$PORT.*LISTENING"
if ($verify) {
    Write-Host ""
    Write-Host "  Mindrift is running!" -ForegroundColor Green
    Write-Host "  Dashboard: http://localhost:$PORT" -ForegroundColor Cyan
    Write-Host ""
    Start-Process "http://localhost:$PORT"
} else {
    Write-Host "  WARNING: Server may not have started. Try running manually:" -ForegroundColor Yellow
    Write-Host "    cd $ROOT\server && npx tsx index.ts" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to close this window (Mindrift keeps running in background)..." -ForegroundColor Gray
pause | Out-Null
