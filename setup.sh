#!/bin/bash
echo "========================================"
echo "  Mindrift - One-Click Setup"
echo "  AI Agent Observability Dashboard"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/4] Installing server dependencies..."
cd server && npm install --silent
if [ $? -ne 0 ]; then
    echo "ERROR: Server npm install failed"
    exit 1
fi
echo "      Done."

echo "[2/4] Installing client dependencies..."
cd ../client && npm install --silent
if [ $? -ne 0 ]; then
    echo "ERROR: Client npm install failed"
    exit 1
fi
echo "      Done."

echo "[3/4] Building frontend..."
npx vite build
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed"
    exit 1
fi
echo "      Done."

echo "[4/4] Starting Mindrift server..."
cd ../server && node index.js &
sleep 2

echo ""
echo "========================================"
echo "  Mindrift is running!"
echo "  Dashboard: http://localhost:3344"
echo ""
echo "  Press Enter to open in browser..."
read
open http://localhost:3344 2>/dev/null || xdg-open http://localhost:3344 2>/dev/null
echo ""
echo "  To stop: kill the node process"
echo "========================================"