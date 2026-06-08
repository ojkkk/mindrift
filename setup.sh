#!/usr/bin/env bash
# ==============================================
#  Mindrift — One-Click Install & Start (Unix)
#  Run: bash setup.sh
# ==============================================
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT=3344

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; GRAY='\033[0;90m'; NC='\033[0m'

step() { echo -e "\n${YELLOW}[$1/5] $2${NC}"; }
ok()   { echo -e "  ${GREEN}$1${NC}"; }
err()  { echo -e "  ${RED}$1${NC}"; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Mindrift — AI Agent Dashboard        ║${NC}"
echo -e "${CYAN}║     One-Click Setup                       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# 1. Check Node.js
step 1 "Checking Node.js..."
if ! command -v node &>/dev/null; then
    err "Node.js not found"
    echo ""
    echo "  Install Node.js: https://nodejs.org"
    echo "  Or: brew install node  /  apt install nodejs"
    exit 1
fi
ok "Node.js $(node --version)"

# 2. Install dependencies
NEED_INSTALL=false
[ ! -d "$ROOT/server/node_modules" ] && NEED_INSTALL=true
[ ! -d "$ROOT/client/node_modules" ] && NEED_INSTALL=true

if $NEED_INSTALL; then
    step 2 "Installing dependencies (first run)..."
    echo "  This may take 1-2 minutes..."

    cd "$ROOT/server"
    npm install --silent 2>/dev/null || npm install 2>/dev/null
    ok "Server packages ready"

    cd "$ROOT/client"
    npm install --silent 2>/dev/null || npm install 2>/dev/null
    ok "Client packages ready"

    cd "$ROOT"
else
    step 2 "Dependencies already installed"
    ok "Skipping"
fi

# 3. Build frontend
if [ ! -f "$ROOT/client/dist/index.html" ]; then
    step 3 "Building frontend..."
    cd "$ROOT/client"
    npx vite build 2>/dev/null || {
        rm -rf node_modules/.vite 2>/dev/null
        npx vite build
    }
    ok "Frontend built"
    cd "$ROOT"
else
    step 3 "Frontend already built"
    ok "Skipping"
fi

# 4. Start server
step 4 "Starting Mindrift server..."

# Check if already running
if lsof -i ":$PORT" &>/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":$PORT.*LISTEN"; then
    ok "Already running on port $PORT"
else
    cd "$ROOT/server"
    nohup npx tsx index.ts > /tmp/mindrift.log 2>&1 &
    cd "$ROOT"

    echo "  Waiting for server to start..."
    for i in $(seq 1 15); do
        sleep 1
        if lsof -i ":$PORT" &>/dev/null 2>&1; then break; fi
        if netstat -an 2>/dev/null | grep -q ":$PORT.*LISTEN"; then break; fi
    done
fi

# 5. Open browser
step 5 "Opening dashboard..."
if command -v open &>/dev/null; then
    open "http://localhost:$PORT"
elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:$PORT"
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Mindrift is running!                  ║${NC}"
echo -e "${CYAN}║   Dashboard: http://localhost:$PORT       ║${NC}"
echo -e "${CYAN}║   Logs: /tmp/mindrift.log               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GRAY}Tip: Close this terminal. Mindrift runs in background.${NC}"