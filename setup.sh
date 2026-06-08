#!/usr/bin/env bash
# Mindrift — One-Click Install & Start (macOS / Linux)
# Run: bash setup.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT=3344

echo ""
echo -e "\033[36m╔══════════════════════════════════════════╗\033[0m"
echo -e "\033[36m║       Mindrift — Agent Observability     ║\033[0m"
echo -e "\033[36m║         One-Click Setup v1.0             ║\033[0m"
echo -e "\033[36m╚══════════════════════════════════════════╝\033[0m"
echo ""

# 1. Check Node.js
echo -e "\033[33m[1/5] Checking Node.js...\033[0m"
if ! command -v node &>/dev/null; then
    echo -e "\033[31m  ERROR: Node.js is required. Install from https://nodejs.org\033[0m"
    exit 1
fi
echo -e "\033[32m  Node.js $(node --version)\033[0m"

# 2. Install server dependencies
echo -e "\033[33m[2/5] Installing server dependencies...\033[0m"
cd "$ROOT/server" && npm install --silent
echo -e "\033[32m  Server dependencies installed\033[0m"

# 3. Install client dependencies
echo -e "\033[33m[3/5] Installing client dependencies...\033[0m"
cd "$ROOT/client" && npm install --silent
echo -e "\033[32m  Client dependencies installed\033[0m"

# 4. Build frontend
echo -e "\033[33m[4/5] Building frontend...\033[0m"
cd "$ROOT/client" && npx vite build --logLevel error
echo -e "\033[32m  Frontend built successfully\033[0m"

# 5. Start server
echo -e "\033[33m[5/5] Starting Mindrift server...\033[0m"

# Check if already running
if lsof -i :$PORT &>/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":$PORT.*LISTEN"; then
    echo -e "\033[33m  Port $PORT is already in use. Opening browser...\033[0m"
    open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null
    exit 0
fi

# Start in background
cd "$ROOT/server"
nohup npx tsx index.ts > /tmp/mindrift.log 2>&1 &
sleep 3

echo ""
echo -e "\033[32m  Mindrift is running!\033[0m"
echo -e "\033[36m  Dashboard: http://localhost:$PORT\033[0m"
echo -e "\033[36m  Logs: /tmp/mindrift.log\033[0m"
echo ""

# Open browser
open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null