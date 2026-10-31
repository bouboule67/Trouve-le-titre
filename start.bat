@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installation des dependances...
  call npm install
)
echo.
call npm start
pause
