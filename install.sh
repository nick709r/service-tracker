#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/nick709r/service-tracker.git"
APP_DIR="service-tracker"
SERVICE_NAME="lennycat-service-monitor"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed. Please install git and try again."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not installed. Please install Docker Engine or Docker Desktop, then rerun this script."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is required but not installed. Please install the Docker Compose plugin or docker-compose and try again."
  exit 1
fi

if [ -d "$APP_DIR" ]; then
  echo "Existing $APP_DIR directory found. Pulling latest changes..."
  cd "$APP_DIR"
  git pull --ff-only
else
  echo "Cloning repository..."
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "Building and starting LennyCat Service Monitor with Docker..."
"${COMPOSE_CMD[@]}" up -d --build

if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=LennyCat Service Monitor
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=${PWD}
ExecStart=/usr/bin/env bash -lc 'docker compose up -d --remove-orphans'
ExecStop=/usr/bin/env bash -lc 'docker compose down'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.service"
  echo "Auto-start enabled via systemd."
else
  echo "systemd not available or script is not running as root; Docker services will still start manually with this script."
fi

echo ""
echo "Installation complete."
echo "Frontend: http://<server-ip>:6969"
echo "Backend:  http://<server-ip>:6868"
echo "Login: admin / admin"
echo ""
echo "To inspect the running containers:"
echo "  ${COMPOSE_CMD[*]} ps"
echo "To restart or stop the app later:"
echo "  sudo systemctl stop ${SERVICE_NAME}"
echo "  sudo systemctl start ${SERVICE_NAME}"
