@echo off
REM ============================================================
REM  Live2D Companion - one-click launcher (Windows)
REM  Double-click this file. It installs anything missing
REM  (Node.js, dependencies, assets, Ollama + a model) and
REM  then starts the app.
REM ============================================================
setlocal enableextensions
cd /d "%~dp0"
title Live2D Companion

echo.
echo ==================================================
echo   Live2D Companion - starting up
echo ==================================================
echo.

REM --- Make sure Node.js is available ---------------------------------
where node >nul 2>nul
if %errorlevel%==0 goto haveNode

echo Node.js was not found. Trying to install it with winget...
echo.
where winget >nul 2>nul
if not %errorlevel%==0 (
  echo   winget is not available on this system.
  echo   Please install Node.js LTS from https://nodejs.org/ and run this again.
  echo.
  pause
  exit /b 1
)

winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

where node >nul 2>nul
if %errorlevel%==0 goto haveNode

echo.
echo   Node.js was installed, but this window must be reopened to use it.
echo   Please CLOSE this window and double-click start.bat again.
echo.
pause
exit /b 0

:haveNode
REM --- Hand off to the cross-platform doctor / installer --------------
node scripts\setup.mjs --start
set EXITCODE=%errorlevel%

if not "%EXITCODE%"=="0" (
  echo.
  echo Setup did not complete cleanly. Review the messages above.
  echo.
  pause
)
exit /b %EXITCODE%
