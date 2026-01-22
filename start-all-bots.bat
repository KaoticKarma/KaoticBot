@echo off
echo ========================================
echo   ChaosSquadBot - Starting All Services
echo ========================================
echo.

cd /d "%~dp0"

REM Check if root node_modules exists
if not exist "node_modules" (
    echo Installing root dependencies and setting up workspaces...
    call npm install
    echo.
)

REM Check bot node_modules
cd apps\bot
if not exist "node_modules" (
    echo Installing bot dependencies...
    call npm install
    echo.
)

REM Check dashboard node_modules
cd ..\dashboard
if not exist "node_modules" (
    echo Installing dashboard dependencies...
    call npm install
    echo.
)

cd ..\..

echo.
echo Starting services...
start "ChaosSquadBot - Backend" cmd /k "cd /d "%~dp0apps\bot" && npm run dev"
timeout /t 3 /nobreak > nul
start "ChaosSquadBot - Dashboard" cmd /k "cd /d "%~dp0apps\dashboard" && npm run dev"

echo.
echo ========================================
echo   Services Started!
echo ========================================
echo.
echo Bot Backend:    http://localhost:3000
echo Dashboard:      http://localhost:5173
echo.
echo To stop: Close the command windows
echo.
pause
