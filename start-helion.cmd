@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-helion.ps1"
if errorlevel 1 pause
