#!/usr/bin/env bash
set -e
REPO_URL="https://github.com/nick709r/service-tracker.git"
APP_DIR="service-tracker"

if [ -d "$APP_DIR" ]; then
  echo "Existing $APP_DIR directory found. Pulling latest changes..."
  cd "$APP_DIR"
  git pull
else
  echo "Cloning repository..."
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "Starting services with docker-compose..."
docker-compose up -d --build

echo "Done. Frontend: http://<server-ip>:6969  Backend: http://<server-ip>:6868"
