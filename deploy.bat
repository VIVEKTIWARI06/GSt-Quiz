@echo off
REM ============================================================
REM deploy.bat — double-click this after copying in any new files
REM from Claude to push to GitHub AND deploy to Cloudflare in one go.
REM Save this file directly inside your gst-quiz folder.
REM ============================================================

cd /d "%~dp0"

echo.
echo ==============================================
echo   GST Quiz - One-Click Deploy
echo ==============================================
echo.

set /p COMMITMSG="Describe what changed (e.g. 'fixed cert bug'): "
if "%COMMITMSG%"=="" set COMMITMSG=Update

echo.
echo --- Step 1: Saving to GitHub ---
git add .
git commit -m "%COMMITMSG%"
git push

echo.
echo --- Step 2: Deploying to Cloudflare ---
call npx wrangler deploy

echo.
echo ==============================================
echo   Done! Check the output above for any errors.
echo ==============================================
echo.
pause
