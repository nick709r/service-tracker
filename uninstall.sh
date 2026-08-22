#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="lennycat-service-monitor"
APP_DIR="/opt/lennycat-service-monitor"
START_SCRIPT="/opt/lennycat-service-monitor/start.sh"
STOP_SCRIPT="/opt/lennycat-service-monitor/stop.sh"
SYSTEMD_SERVICE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ -f "$STOP_SCRIPT" ]; then
  "$STOP_SCRIPT" || true
fi

if command -v systemctl >/dev/null 2>&1 && [ -f "$SYSTEMD_SERVICE" ]; then
  systemctl disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "$SYSTEMD_SERVICE"
  systemctl daemon-reload >/dev/null 2>&1 || true
fi

rm -f "$START_SCRIPT" "$STOP_SCRIPT"
if [ -d "$APP_DIR" ]; then
  echo "Removing installed app files from $APP_DIR..."
  rm -rf "$APP_DIR"
fi

echo "LennyCat Service Monitor has been removed."
echo "To clean up leftover logs: sudo rm -f /var/log/lennycat-service-monitor-*.log"
