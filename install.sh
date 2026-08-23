#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/service-tracker}"
REPO_URL="${REPO_URL:-https://github.com/nick709r/service-tracker.git}"
SERVICE_NAME="service-tracker"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "This installer must run as root. Use sudo bash install.sh" >&2
  exit 1
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "Updating existing install in $APP_DIR..."
  git -C "$APP_DIR" pull --ff-only
else
  if [ -d "$APP_DIR" ]; then
    echo "Removing stale non-git directory at $APP_DIR..."
    rm -rf "$APP_DIR"
  fi
  echo "Cloning repository into $APP_DIR..."
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
chmod +x "$APP_DIR/start.sh" "$APP_DIR/stop.sh"

if [ ! -d "$APP_DIR/venv" ]; then
  python3 -m venv "$APP_DIR/venv"
fi

"$APP_DIR/venv/bin/pip" install --upgrade pip >/dev/null
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt"

mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
cp "$APP_DIR/service-tracker.service" "/etc/systemd/system/${SERVICE_NAME}.service"

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
  echo "Service Tracker is installed and running as a systemd service."
else
  "$APP_DIR/start.sh"
  echo "Service Tracker is installed. Start it with: $APP_DIR/start.sh"
fi

echo "Frontend: http://<server-ip>:6969"
echo "Backend:  http://<server-ip>:6962"
