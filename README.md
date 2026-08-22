# Service Tracker

A simple, mobile-friendly web UI to monitor services on your home server (Sonarr, Lidarr, Transmission, Home Assistant, Agent DVR, and others).

Features
- FastAPI backend (REST API) to manage services and credentials
- Static frontend (Tailwind CSS + vanilla JS) for a clean, responsive UI
- Docker Compose for easy deployment
- install.sh: one-script installer to set up the app on your server

Defaults
- Default admin user: admin
- Default admin password: admin

Quick install (on your Ubuntu server)

1. Make the install script executable and run it:

```bash
curl -sL https://raw.githubusercontent.com/nick709r/service-tracker/main/install.sh | bash
```

2. The frontend will be available at http://<your-server-ip>:8080 and the backend at http://<your-server-ip>:8000

Customize
- Configure services and Home Assistant integration from the web UI after logging in.

Security
- This is intended for use on your home network. If you expose it to the internet, secure it behind a reverse proxy with authentication (e.g., Nginx + OAuth, or use a VPN).
