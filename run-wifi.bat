@echo off
title IITM IEAC Asset Management - Local WiFi Host
echo ==========================================================
echo Starting IITM IEAC Asset Management Server...
echo ==========================================================

:: Change directory to the project folder
cd /d "D:\inten\IITM IEAS KISEM\model 3\New assest management\Intenship_project_at_IITM_IEAC-main-backup"

:: Try to extract active local IPv4 address
set IP=
for /f "tokens=4" %%a in ('route print 0.0.0.0 ^| findstr /i "0.0.0.0"') do (
    set IP=%%a
)

if "%IP%"=="" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4 Address"') do (
        set IP=%%a
    )
)

:: Clean up leading spaces if any
if not "%IP%"=="" (
    set IP=%IP: =%
) else (
    set IP=localhost
)

echo.
echo ==========================================================
echo Your machine is hosting the site on local Wi-Fi.
echo Open this URL on your phone/tablet/laptop:
echo.
echo   http://%IP%:3000
echo ==========================================================
echo.
echo Starting Node.js server...
npm start
pause
