@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-helion.ps1"
if errorlevel 1 pause
