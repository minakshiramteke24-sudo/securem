@echo off
echo =======================================
echo    SECUREM ONE-CLICK UPDATE (v2.2.5)
echo =======================================
echo.
echo 1. Saving to GitHub (Backup)...
git add .
git commit -m "Automated Update"
git push origin main
echo.
echo 2. Pushing Live to Vercel...
call vercel --prod
echo.
echo =======================================
echo    SUCCESS! Your site is now LIVE.
echo =======================================
pause
