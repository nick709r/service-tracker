# Service Tracker

A simple, mobile-friendly web UI to monitor services on your home server (Sonarr, Lidarr, Transmission, Home Assistant, Agent DVR, and others).

Features
- FastAPI backend for service status checks and config
- Static frontend for the management UI
- Runs as a systemd service at boot
- install.sh: one-script installer for your server

Defaults
- Default admin user: admin
- Default admin password: admin

Quick install

1. Copy the installer to your server, make it executable, and run it:

```bash
curl -sL https://raw.githubusercontent.com/nick709r/service-tracker/main/install.sh | sudo bash
```

2. The app will run as a systemd service and be available at:

- Frontend: http://<your-server-ip>:6969
- Backend: http://<your-server-ip>:6962

Service configuration
- Frontend port: 6969
- Backend port: 6962
- Data directory: /opt/service-tracker/data
- Logs: /opt/service-tracker/logs

To change the ports before installation, edit the values in the service file or export FRONTEND_PORT and BACKEND_PORT before running the service start script.

Customize
- Configure services and Home Assistant integration from the web UI after logging in.

Security
- This is intended for use on your home network. If you expose it to the internet, secure it behind a reverse proxy with authentication (e.g., Nginx + OAuth, or use a VPN).
