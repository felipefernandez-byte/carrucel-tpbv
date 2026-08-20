@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp002_PREPARAR_ENV_LOCAL.ps1"
pause
