@echo off
REM TradingView Desktop Launch Script for Windows App (.msix)
REM This launches TradingView Desktop with remote debugging on port 9222

echo ========================================
echo TradingView Desktop - CDP Launch
echo Windows App Version (.msix)
echo ========================================
echo.

REM Find TradingView installation
for /f "tokens=*" %%i in ('powershell.exe -Command "Get-AppxPackage -Name '*TradingView*' | Select-Object -ExpandProperty InstallLocation"') do set TV_PATH=%%i

if "%TV_PATH%"=="" (
    echo [ERROR] TradingView Desktop not found!
    echo.
    echo Please install TradingView from:
    echo https://www.tradingview.com/desktop/
    echo Or run: C:\Users\gesti\Downloads\TradingView.msix
    echo.
    pause
    exit /b 1
)

set TV_EXE=%TV_PATH%\TradingView.exe

echo [FOUND] TradingView at: %TV_EXE%
echo.

REM Check if TradingView is running
tasklist /FI "IMAGENAME eq TradingView.exe" 2>NUL | find /I /N "TradingView.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [WARNING] TradingView is already running!
    echo.
    echo Closing existing instance...
    taskkill /F /IM TradingView.exe >NUL 2>&1
    timeout /t 3 /nobreak >NUL
)

echo [LAUNCH] Starting TradingView with CDP on port 9222...
echo.

REM Start TradingView with remote debugging
start "" "%TV_EXE%" --remote-debugging-port=9222 --no-first-run --no-default-browser-check

echo [WAIT] Waiting for TradingView to start...
timeout /t 5 /nobreak >NUL

echo.
echo [CHECK] Verifying CDP connection...
timeout /t 2 /nobreak >NUL

curl -s http://localhost:9222/json/version >nul 2>&1
if "%ERRORLEVEL%"=="0" (
    echo.
    echo [SUCCESS] TradingView is running with CDP enabled!
    echo [INFO] CDP available at: http://localhost:9222
    echo.
    echo You can now connect via TradingView MCP
    echo.
    echo Next steps:
    echo   1. Wait for TradingView to fully load
    echo   2. Open a chart (e.g., BTCUSDT)
    echo   3. Run: node trading_tv_connected.js
    echo.
) else (
    echo [ERROR] CDP port 9222 not accessible
    echo.
    echo Troubleshooting:
    echo   1. Check if port 9222 is already in use: netstat -ano | findstr :9222
    echo   2. Try a different port: --remote-debugging-port=9223
    echo   3. Check Windows Firewall settings
    echo.
)

pause
