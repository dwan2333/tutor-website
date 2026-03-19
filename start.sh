#!/bin/bash
set -e

echo "Starting Tutor Website (Local)..."

# Check .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and add your ANTHROPIC_API_KEY."
  exit 1
fi

# Start backend
cd backend
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Start frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
