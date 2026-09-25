@echo off
cd /d "%~dp0"
node scripts\clasificar-menores.mjs --limit=20
pause
