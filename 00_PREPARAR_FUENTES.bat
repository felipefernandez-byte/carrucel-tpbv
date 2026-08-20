@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PREPARAR_FUENTES.ps1"
pause
