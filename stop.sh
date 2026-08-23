#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

for pid_file in "$APP_DIR/.backend.pid" "$APP_DIR/.frontend.pid"; do
  if [ -f "$pid_file" ]; then
    PID="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" || true
    fi
    rm -f "$pid_file"
  fi
done

echo "Service Tracker stopped."
