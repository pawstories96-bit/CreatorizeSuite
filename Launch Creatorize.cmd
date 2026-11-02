@echo off
cd /d "%~dp0"
if exist "release\v0.3.3\win-unpacked\Creatorize Suite.exe" (
  start "" "release\v0.3.3\win-unpacked\Creatorize Suite.exe"
  exit /b
)
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" "."
  exit /b
)
echo Build Creatorize Suite first: npm ci, npm run build, npm start.
pause
