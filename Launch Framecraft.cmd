@echo off
cd /d "%~dp0"
if exist "release\win-unpacked\Framecraft Studio.exe" (
  start "" "release\win-unpacked\Framecraft Studio.exe"
  exit /b
)
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" "."
  exit /b
)
echo Build the app first: npm ci, npm run build, npm start.
pause
