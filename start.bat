@echo off
REM ChemAR launcher: starts the FastAPI backend and the Vite frontend in two windows.
set VENV=%USERPROFILE%\chemar-venv
start "ChemAR backend" cmd /k "cd /d %~dp0backend && %VENV%\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000"
start "ChemAR frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 4 >nul
start http://localhost:5173
