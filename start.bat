@echo off
cd /d "%~dp0"

echo Mindrift - Starting...
echo.

REM Check Node.js
node --version >nul 2>nul
if errorlevel 1 goto NO_NODE
echo Node.js OK

REM Install if needed
if not exist "server\node_modules\" goto INSTALL
if not exist "client\node_modules\" goto INSTALL
if not exist "client\dist\index.html" goto BUILD
goto START

:NO_NODE
echo ERROR: Node.js not found.
echo Install from https://nodejs.org then try again.
pause
exit /b 1

:INSTALL
echo Installing dependencies...
cd server
call npm install
if errorlevel 1 goto FAIL
cd ..\client
call npm install
if errorlevel 1 goto FAIL
cd ..

:BUILD
echo Building frontend...
cd client
call npx vite build
if errorlevel 1 goto FAIL
cd ..

:START
echo Starting server...

netstat -ano 2>nul | find ":3344" | find "LISTENING" >nul
if not errorlevel 1 goto OPEN

cd server
start "Mindrift" /min cmd /c "npx tsx index.ts"
cd ..

echo Waiting...
set N=0
:LOOP
timeout /t 1 /nobreak >nul
netstat -ano 2>nul | find ":3344" | find "LISTENING" >nul
if not errorlevel 1 goto OPEN
set /a N=%N%+1
if %N% lss 15 goto LOOP
echo Server didn't start. Try: cd server ^& npx tsx index.ts
pause
exit /b 1

:OPEN
echo Opening http://localhost:3344
start "" http://localhost:3344

echo.
echo Mindrift running! Close this window anytime.
pause
exit /b 0

:FAIL
echo Something went wrong. Check the error above.
cd "%~dp0"
pause
exit /b 1
