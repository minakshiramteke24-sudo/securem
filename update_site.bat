@echo off
echo =======================================
echo    SECUREM ONE-CLICK UPDATE (v2.2.5)
echo =======================================
echo.
echo 1. Collecting latest changes...
git add .
echo.
echo 2. Saving changes...
git commit -m "Automated Update"
echo.
echo 3. Sending to GitHub / Vercel...
git push
echo.
echo =======================================
echo    SUCCESS! Wait 45 seconds for Vercel.
echo =======================================
pause
