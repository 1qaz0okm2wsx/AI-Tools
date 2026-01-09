@echo off
chcp 936 >nul
echo.
echo ============================================
echo        Chrome Remote Debugging Launcher
echo ============================================
echo.

:: Check if Chrome is already running
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9222" ^| findstr "LISTENING"') do set PID=%%a
if defined PID (
    echo WARNING: Chrome is already running (PID: %PID%)
    echo         If connection fails, please close Chrome first
    echo.
    set /p CONTINUE="Continue to start a new Chrome instance? (Y/N): "
    if /i not "%CONTINUE%"=="Y" (
        echo Operation cancelled
        pause
        exit /b 0
    )
)

:: Check Chrome installation path
set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)
:: Support Edge browser
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "CHROME=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "CHROME=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
    set "CHROME=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
)

if "%CHROME%"=="" (
    echo ERROR: Chrome/Edge browser not found
    echo.
    echo Please try:
    echo   1. Install Chrome: https://www.google.com/chrome/
    echo   2. Install Edge: https://www.microsoft.com/edge
    echo   3. Or run manually:
    echo      chrome.exe --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\chrome-debug"
    echo.
    pause
    exit /b 1
)

:: Check user data directory
set "USER_DATA=%USERPROFILE%\chrome-debug"
if exist "%USER_DATA%" (
    echo Using existing data directory: %USER_DATA%
) else (
    echo Creating new data directory: %USER_DATA%
    mkdir "%USER_DATA%" 2>nul
)

:: Get browser name
for %%i in ("%CHROME%") do set "BROWSER_NAME=%%~ni"

echo.
echo Starting %BROWSER_NAME%...
echo   - Remote debug port: 9222
echo   - User data directory: %USER_DATA%
echo.

:: Start Chrome/Edge with proper arguments
"%CHROME%" --remote-debugging-port=9222 --user-data-dir="%USER_DATA%" --no-first-run --disable-default-apps

timeout /t 3 /nobreak >nul

:: Verify connection
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9222" ^| findstr "LISTENING"') do set PID=%%a

if defined PID (
    echo.
    echo ============================================
    echo.
    echo SUCCESS: %BROWSER_NAME% started!
    echo   - Process ID: %PID%
    echo   - Remote debug port: 9222
    echo.
    echo ============================================
    echo.
    echo TIP: Close this window, browser will continue running
    echo      To fully stop, close the %BROWSER_NAME% browser window
    echo.
    echo Now you can run start.bat to start the AI Model Manager
    echo.
) else (
    echo.
    echo WARNING: %BROWSER_NAME% is starting, please wait...
    echo.
    echo If not successful after 10 seconds, check:
    echo   1. Firewall blocking the browser
    echo   2. Port 9222 already in use
    echo.
)

:: Monitor loop - check every 10 seconds
:monitor_loop
timeout /t 10 /nobreak >nul

:: Check if Chrome is still running
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9222" ^| findstr "LISTENING"') do set CHECK_PID=%%a

if defined CHECK_PID (
    goto monitor_loop
)

:: Chrome exited
echo.
echo ============================================
echo.
echo %BROWSER_NAME% exited (PID: %PID%)
echo ============================================
echo.
echo Restarting %BROWSER_NAME%...
echo.

"%CHROME%" --remote-debugging-port=9222 --user-data-dir="%USER_DATA%" --no-first-run --disable-default-apps

timeout /t 2 /nobreak >nul

:: Re-verify
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9222" ^| findstr "LISTENING"') do set NEW_PID=%%a

if defined NEW_PID (
    echo.
    echo ============================================
    echo.
    echo SUCCESS: %BROWSER_NAME% restarted (New PID: %NEW_PID%)
    echo ============================================
    echo.
    echo Auto-restart mode enabled
    echo Press Ctrl+C to stop this monitor
    echo.
    goto monitor_loop
)

:: If restart failed
echo.
echo ============================================
echo.
echo ERROR: Cannot restart %BROWSER_NAME%
echo ============================================
echo.
echo Please check:
echo   1. Firewall blocking
echo   2. Port 9222 in use
echo   3. Browser corrupted
echo.
pause

exit /b 1
