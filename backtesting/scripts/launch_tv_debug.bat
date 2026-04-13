@echo off
REM TradingView Desktop Launch Script with CDP Enabled
REM This launches TradingView Desktop with remote debugging on port 9222
REM Required for TradingView MCP connection

echo ========================================
echo TradingView Desktop - CDP Launch
echo ========================================
echo.

REM Check if TradingView is running
tasklist /FI "IMAGENAME eq TradingView.exe" 2>NUL | find /I /N "TradingView.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [WARNING] TradingView is already running!
    echo Closing existing instance...
    taskkill /F /IM TradingView.exe >NUL 2>&1
    timeout /t 2 /nobreak >NUL
)

REM Common installation paths
set "TV_PATHS[0]=C:\Program Files\TradingView\TradingView.exe"
set "TV_PATHS[1]=C:\Program Files (x86)\TradingView\TradingView.exe"
set "TV_PATHS[2]=%LOCALAPPDATA%\Programs\TradingView\TradingView.exe"
set "TV_PATHS[3]=%USERPROFILE%\AppData\Local\Programs\TradingView\TradingView.exe"

REM Try each path
for /L %%i in (0,1,3) do (
    call set "PATH=%%TV_PATHS[%%i]%%"
    if exist "!PATH!" (
        echo [FOUND] TradingView at: !PATH!
        echo.
        echo [LAUNCH] Starting TradingView with CDP on port 9222...
        echo.

        start "" "!PATH!" --remote-debugging-port=9222 --no-first-run --no-default-browser-check

        echo [WAIT] Waiting for TradingView to start...
        timeout /t 5 /nobreak >NUL

        echo.
        echo [CHECK] Verifying CDP connection...
        timeout /t 2 /nobreak >NUL

        curl -s http://localhost:9222/json/version >nul 2>&1
        if "!ERRORLEVEL!"=="0" (
            echo.
            echo [SUCCESS] TradingView is running with CDP enabled!
            echo [INFO] CDP available at: http://localhost:9222
            echo.
            echo You can now connect via TradingView MCP
            echo.
            goto :end
        ) else (
            echo [ERROR] CDP port 9222 not accessible
            echo TradingView may have started but CDP is not available
        )
        goto :end
    )
)

echo.
echo [ERROR] TradingView Desktop not found!
echo.
echo Please install TradingView Desktop from:
echo https://www.tradingview.com/desktop/
echo.
echo After installation, run this script again.
echo.

:end
pause
