#!/usr/bin/env bash
# One-command local dev: backend on :8000, frontend on :5173 (Vite proxies /api to the backend).
set -e
cd "$(dirname "$0")"
if [ ! -d backend/.venv ]; then
  echo "▶ creating backend venv (Python 3.11+)"; python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -d frontend/node_modules ]; then
  echo "▶ installing frontend deps"; (cd frontend && npm install)
fi
echo "▶ starting backend  → http://localhost:8000/docs"
(cd backend && .venv/bin/uvicorn main:app --reload --port 8000) &
BACK=$!
echo "▶ starting frontend → http://localhost:5173"
(cd frontend && npm run dev)
kill $BACK 2>/dev/null || true
