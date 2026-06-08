@echo off
echo ========================================
echo   Mindrift - One-Click Setup
echo   AI Agent Observability Dashboard
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Installing server dependencies...
cd server
call npm install --silent
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Server npm install failed
    pause
    exit /b 1
)
echo       Done.

echo [2/4] Installing client dependencies...
cd ..\client
call npm install --silent
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Client npm install failed
    pause
    exit /b 1
)
echo       Done.

echo [3/4] Building frontend...
call npx vite build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo       Done.

echo [4/4] Starting Mindrift server...
cd ..\server
start "Mindrift" /MIN node index.js

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   Mindrift is running!
echo   Dashboard: http://localhost:3344
echo.
echo   Press any key to open in browser...
pause >nul
start http://localhost:3344
echo.
echo   To stop: close this window OR
echo   run: taskkill /F /IM node.exe
echo ========================================
pause