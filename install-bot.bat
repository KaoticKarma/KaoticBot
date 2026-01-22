@echo off
echo ========================================
echo   ChaosSquadBot - Installing Dependencies
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Installing root workspace dependencies...
call npm install
echo.

echo [2/3] Installing bot dependencies...
cd apps\bot
call npm install
cd ..\..
echo.

echo [3/3] Installing dashboard dependencies...
cd apps\dashboard
call npm install
cd ..\..
echo.

echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo You can now run start-all.bat to start the bot.
echo.
pause
