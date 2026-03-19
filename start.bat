@echo off
echo Starting Tutor Website (Local)...

REM Check .env exists
if not exist .env (
    echo ERROR: .env file not found. Copy .env.example to .env and add your ANTHROPIC_API_KEY.
    pause
    exit /b 1
)

REM Start backend in a new terminal
start "Backend" cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

REM Wait a moment then start frontend
timeout /t 2 /nobreak >nul
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Close the Backend and Frontend windows to stop the servers.
