@echo off
cd /d "%~dp0"
title Mindrift

echo.
echo ========================================
echo   Mindrift - AI Agent Dashboard
echo ========================================
echo.

:: --- Check Node.js ---
echo [1/5] Checking Node.js...

REM Try to run node directly
node -e "process.exit(0)" >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo *** ERROR: Node.js is not installed or not in PATH ***
    echo.
    echo Please install Node.js from https://nodejs.org
    echo Then double-click start.bat again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -e "console.log(process.version)"') do echo   Node.js %%v found

:: --- Install ---
set NEED_BUILD=0
if not exist "server\node_modules\" set NEED_BUILD=1
if not exist "client\node_modules\" set NEED_BUILD=1

if %NEED_BUILD% equ 1 (
    echo.
    echo [2/5] Installing dependencies (first run)...
    echo   This takes 1-2 minutes.
    echo.
    cd server
    call npm install
    if %errorlevel% neq 0 (
        echo *** Install failed! Check your internet. ***
        cd ..
        pause
        exit /b 1
    )
    cd ..\client
    call npm install
    if %errorlevel% neq 0 (
        echo *** Install failed! ***
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo   Packages installed.
)

:: --- Build ---
if not exist "client\dist\index.html" set NEED_BUILD=1

if %NEED_BUILD% equ 1 (
    echo.
    echo [3/5] Building frontend...
    cd client
    call npx vite build
    if %errorlevel% neq 0 (
        echo *** Build failed! ***
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo   Build done.
)

:: --- Start ---
echo.
echo [4/5] Starting server...

netstat -ano 2>nul | find ":3344" | find "LISTENING" >nul
if %errorlevel% equ 0 (
    echo   Server already running on port 3344.
    goto OPEN
)

cd server
start "Mindrift" /min cmd /c "npx tsx index.ts"
cd ..

echo   Waiting for server to start...
set COUNT=0
:WAIT
timeout /t 1 /nobreak >nul
netstat -ano 2>nul | find ":3344" | find "LISTENING" >nul
if %errorlevel% equ 0 goto OPEN
set /a COUNT=%COUNT%+1
if %COUNT% lss 15 goto WAIT

echo   Server didn't start in 15s.
echo   Try: cd server ^& npx tsx index.ts
pause
exit /b 1

:: --- Open ---
:OPEN
echo.
echo [5/5] Opening http://localhost:3344 ...
start "" http://localhost:3344

echo.
echo ========================================
echo   Mindrift is running!
echo   http://localhost:3344
echo.
echo   Close this window anytime.
echo ========================================
echo.
pause
