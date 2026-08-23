#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
FRONTEND_PORT="${FRONTEND_PORT:-6969}"
BACKEND_PORT="${BACKEND_PORT:-6962}"
DATA_DIR="${SERVICE_TRACKER_DATA_DIR:-${APP_DIR}/data}"
LOG_DIR="${SERVICE_TRACKER_LOG_DIR:-${APP_DIR}/logs}"
BACKEND_PID_FILE="${APP_DIR}/.backend.pid"
FRONTEND_PID_FILE="${APP_DIR}/.frontend.pid"
VENV_DIR="${APP_DIR}/venv"

mkdir -p "$DATA_DIR" "$LOG_DIR"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
  "$VENV_DIR/bin/pip" install -r "$APP_DIR/backend/requirements.txt"
fi

if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE" 2>/dev/null)" 2>/dev/null; then
  echo "Backend already running"
else
  SERVICE_TRACKER_DATA_DIR="$DATA_DIR" "$VENV_DIR/bin/python" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --app-dir "$APP_DIR" > "$LOG_DIR/service-tracker-backend.log" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
fi

if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE" 2>/dev/null)" 2>/dev/null; then
  echo "Frontend already running"
else
  "$VENV_DIR/bin/python" -m http.server "$FRONTEND_PORT" --directory "$APP_DIR/frontend" > "$LOG_DIR/service-tracker-frontend.log" 2>&1 &
  echo $! > "$FRONTEND_PID_FILE"
fi

echo "Service Tracker is running. Frontend: http://localhost:${FRONTEND_PORT} Backend: http://localhost:${BACKEND_PORT}"
