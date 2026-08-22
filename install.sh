#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/nick709r/service-tracker.git"
APP_DIR="/opt/lennycat-service-monitor"
SERVICE_NAME="lennycat-service-monitor"
START_SCRIPT="${APP_DIR}/start.sh"
STOP_SCRIPT="${APP_DIR}/stop.sh"
SYSTEMD_SERVICE="/etc/systemd/system/${SERVICE_NAME}.service"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed. Please install git and try again."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but not installed. Please install Python 3 and try again."
  exit 1
fi

for port in 6862 6969; do
  python3 - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket()
s.settimeout(0.5)
try:
    s.connect(('127.0.0.1', port))
    print(f"Port {port} is already in use. Please free it before installing LennyCat Service Monitor.")
    raise SystemExit(1)
except OSError:
    pass
finally:
    s.close()
PY
 done

if [ -d "$APP_DIR/.git" ]; then
  echo "Existing app directory found. Updating from git..."
  git -C "$APP_DIR" pull --ff-only
else
  if [ -d "$APP_DIR" ]; then
    echo "Removing stale non-git install directory..."
    rm -rf "$APP_DIR"
  fi
  echo "Cloning repository into $APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip >/dev/null 2>&1
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt" >/dev/null 2>&1

cat > "$START_SCRIPT" <<EOF
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/opt/lennycat-service-monitor"
DATA_DIR="\$APP_DIR/data"
LOG_DIR="\$APP_DIR/logs"
mkdir -p "\$DATA_DIR" "\$LOG_DIR"
export SERVICE_TRACKER_DATA_DIR="\$DATA_DIR"

nohup "\$APP_DIR/venv/bin/python3" -m uvicorn main:app --host 0.0.0.0 --port 6862 --app-dir "\$APP_DIR/backend" >"\$LOG_DIR/backend.log" 2>&1 &
sleep 2
nohup "\$APP_DIR/venv/bin/python3" -m http.server 6969 --bind 0.0.0.0 --directory "\$APP_DIR/frontend" >"\$LOG_DIR/frontend.log" 2>&1 &
sleep 1
EOF
chmod 755 "$START_SCRIPT"

cat > "$STOP_SCRIPT" <<EOF
#!/usr/bin/env bash
set -euo pipefail
for pid in \
    \\$(pgrep -f "uvicorn.*6862.*main:app" || true) \
    \\$(pgrep -f "http.server 6969.*frontend" || true); do
  if [ -n "\$pid" ]; then
    kill "\$pid" || true
  fi
done
EOF
chmod 755 "$STOP_SCRIPT"

if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
  cat > "$SYSTEMD_SERVICE" <<EOF
[Unit]
Description=LennyCat Service Monitor
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/lennycat-service-monitor
ExecStart=/opt/lennycat-service-monitor/start.sh
ExecStop=/opt/lennycat-service-monitor/stop.sh

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
  echo "Auto-start enabled via systemd."
else
  echo "systemd is unavailable or this script is not running as root; starting the app manually now."
  "$START_SCRIPT"
fi

echo ""
echo "Installation complete."
echo "Frontend: http://<server-ip>:6969"
echo "Backend:  http://<server-ip>:6862"
echo "Login: admin / admin"
echo ""
echo "Useful commands:"
echo "  sudo systemctl start ${SERVICE_NAME}"
echo "  sudo systemctl stop ${SERVICE_NAME}"
echo "  sudo systemctl status ${SERVICE_NAME}"
echo "  sudo bash /opt/lennycat-service-monitor/uninstall.sh"
