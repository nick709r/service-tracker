#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/service-tracker}"
START_SCRIPT="${APP_DIR}/start.sh"
STOP_SCRIPT="${APP_DIR}/stop.sh"
SERVICE_NAME="service-tracker"

if [ ! -d "$APP_DIR" ] || [ ! -f "$START_SCRIPT" ] || [ ! -f "$STOP_SCRIPT" ]; then
  echo "Service Tracker is not installed at $APP_DIR."
  echo "Run the installer first:"
  echo "  curl -sL https://raw.githubusercontent.com/nick709r/service-tracker/main/install.sh | sudo bash"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to update Service Tracker."
  exit 1
fi

if ! git -C "$APP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "The install at $APP_DIR is not a git repository. Reinstall to update safely."
  exit 1
fi

echo "Checking for updates..."
if ! git -C "$APP_DIR" fetch --all --tags >/dev/null 2>&1; then
  echo "Unable to reach the remote repository. Please check your internet connection and try again."
  exit 1
fi

CURRENT_BRANCH=$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
if ! git -C "$APP_DIR" pull --ff-only origin "$CURRENT_BRANCH" >/dev/null 2>&1; then
  echo "Update failed. Your local copy may be behind or contain conflicting changes."
  echo "Try resetting the repo to the current upstream state or reinstall the app if needed."
  exit 1
fi

if [ -d "$APP_DIR/venv" ]; then
  echo "Updating Python dependencies..."
  "$APP_DIR/venv/bin/pip" install --upgrade pip >/dev/null 2>&1 || true
  "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt" >/dev/null 2>&1 || true
fi

if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
  echo "Restarting Service Tracker service..."
  "$STOP_SCRIPT" || true
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl restart "$SERVICE_NAME" >/dev/null 2>&1 || true
else
  echo "Restarting Service Tracker manually..."
  "$STOP_SCRIPT" || true
  "$START_SCRIPT"
fi

echo ""
echo "Service Tracker updated successfully."
echo "Frontend: http://<server-ip>:6969"
echo "Backend:  http://<server-ip>:6962"
