@echo off
echo ============================================
echo   IT Stock - Build Windows Installer
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
    echo Error installing dependencies!
    pause
    exit /b 1
)

echo.
echo [2/3] Building Windows installer...
call npm run build:win
if errorlevel 1 (
    echo Error building!
    pause
    exit /b 1
)

echo.
echo [3/3] Build complete!
echo Output folder: ..\dist
echo.
dir /b "..\dist\*.exe" 2>nul
echo.
echo Press any key to exit...
pause >nul
