@echo off
REM ============================================================
REM recover.bat — run this on a BRAND NEW computer to get your
REM entire GST Quiz setup back, after Node.js and Git are installed.
REM
REM Before running this: install Node.js (nodejs.org) and Git
REM (git-scm.com) first — those two need their own installer clicks,
REM nothing can skip that part. Once both are installed, save this
REM file to your Desktop and double-click it.
REM ============================================================

echo.
echo ==============================================
echo   GST Quiz - Disaster Recovery Setup
echo ==============================================
echo.

echo --- Step 1: Checking Node.js and Git are installed ---
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Node.js is not installed. Go to nodejs.org, install it,
    echo then run this script again.
    pause
    exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Git is not installed. Go to git-scm.com, install it,
    echo then run this script again.
    pause
    exit /b 1
)
echo Both found. Continuing...

echo.
echo --- Step 2: Downloading your code from GitHub ---
cd /d "%USERPROFILE%\Desktop"
git clone https://github.com/VIVEKTIWARI06/GSt-Quiz.git gst-quiz
cd gst-quiz

echo.
echo --- Step 3: Installing dependencies ---
call npm install

echo.
echo --- Step 4: Logging into Cloudflare ---
echo A browser window will open - log in as vtvivek2@gmail.com and click Allow.
call npx wrangler login

echo.
echo --- Step 5: Deploying ---
call npx wrangler deploy

echo.
echo ==============================================
echo   Done! Your site, database, and all secrets
echo   were already safe on Cloudflare - this just
echo   reconnected this new computer to them.
echo ==============================================
echo.
pause
