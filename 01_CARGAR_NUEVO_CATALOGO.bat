@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp001_CARGAR_NUEVO_CATALOGO.ps1"
pause
