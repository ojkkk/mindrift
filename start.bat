@echo off
chcp 65001 >nul 2>nul
title Mindrift

:: ==============================================
::  Mindrift ? Double-click to start
::  No terminal, no commands, just double-click
:: ==============================================

cd /d "%~dp0"

echo.
echo ????????????????????????????????????????????
echo ?     Mindrift ? AI Agent Dashboard        ?
echo ?     ???? ? ???? ? ????        ?
echo ????????????????????????????????????????????
echo.

:: ?? Check Node.js ??????????????????????????
echo [1/5] Checking Node.js...

node --version >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo   [ERROR] Node.js not found!
    echo.
    echo   Please install Node.js first:
    echo   https://nodejs.org
    echo   (Download LTS version, install, then double-click start.bat again)
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do echo   Node.js %%v - OK

:: ?? Install (first run only) ???????????????
if not exist "server\node_modules\" goto INSTALL
if not exist "client\node_modules\" goto INSTALL
if not exist "client\dist\index.html" goto BUILD
goto START

:INSTALL
echo.
echo [2/5] Installing packages (first run ~1-2 min)...

echo   Installing server packages...
cd /d "%~dp0server"
call npm install 2>nul
if %errorlevel% neq 0 (
    echo   Retrying with verbose output...
    call npm install
    if %errorlevel% neq 0 (
        echo   [ERROR] Server install failed. Check your internet connection.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
)
echo   Server packages - OK

echo   Installing client packages...
cd /d "%~dp0client"
call npm install 2>nul
if %errorlevel% neq 0 (
    call npm install
    if %errorlevel% neq 0 (
        echo   [ERROR] Client install failed.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
)
echo   Client packages - OK
cd /d "%~dp0"

:: ?? Build (first run only) ?????????????????
:BUILD
echo.
echo [3/5] Building frontend...

cd /d "%~dp0client"
call npx vite build 2>nul
if %errorlevel% neq 0 (
    echo   Retrying after cache clear...
    if exist "node_modules\.vite\" rmdir /s /q "node_modules\.vite" 2>nul
    call npx vite build
    if %errorlevel% neq 0 (
        echo   [ERROR] Build failed.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
)
echo   Frontend built - OK
cd /d "%~dp0"

:: ?? Start server ???????????????????????????
:START
echo.
echo [4/5] Starting Mindrift server...

set PORT=3344

netstat -ano 2>nul | findstr ":%PORT% " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo   Already running on port %PORT%
    goto OPEN
)

cd /d "%~dp0server"
start "" /min cmd /c "npx tsx index.ts"
cd /d "%~dp0"

echo   Waiting for server...
set /a TRIES=0
:WAITLOOP
timeout /t 1 /nobreak >nul
netstat -ano 2>nul | findstr ":%PORT% " | findstr "LISTENING" >nul
if %errorlevel% equ 0 goto OPEN
set /a TRIES+=1
if %TRIES% lss 15 goto WAITLOOP

echo   [WARN] Server startup is slow or failed.
echo   Try manually: cd server ^&^& npx tsx index.ts
pause
exit /b 1

:: ?? Open browser ???????????????????????????
:OPEN
echo.
echo [5/5] Opening dashboard...
start "" http://localhost:%PORT%

echo.
echo ????????????????????????????????????????????
echo ?                                          ?
echo ?   Mindrift is running!                   ?
echo ?   Dashboard: http://localhost:%PORT%      ?
echo ?                                          ?
echo ?   You can close this window.             ?
echo ?   Mindrift runs in the background.       ?
echo ?                                          ?
echo ????????????????????????????????????????????
echo.

pause
