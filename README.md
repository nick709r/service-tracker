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

1. Run the installer:

```bash
curl -sL https://raw.githubusercontent.com/nick709r/service-tracker/main/install.sh | bash
```

2. The installer will clone the repo to /opt/lennycat-service-monitor, create a Python virtual environment, install dependencies, and register a systemd service so it starts automatically on boot.

3. The frontend will be available at http://<your-server-ip>:6969 and the backend at http://<your-server-ip>:6868

4. Default login: admin / admin

Uninstall

```bash
curl -sL https://raw.githubusercontent.com/nick709r/service-tracker/main/uninstall.sh | bash
```

This removes the service, the installed app files, and the systemd registration.

4. Default login: admin / admin

Customize
- Configure services, Home Assistant, and email alerting from the web UI after logging in.
- Email alerts are checked every 30 seconds and only fire when a service changes state.
- Example SMTP settings can also be supplied through environment variables or the alert settings form.

Local network access note
- The monitor checks URLs from the machine running the app, not from your browser.
- If your services are on the same LAN, the app must run on the same LAN or a routed network that can reach them.
- The Docker Compose file uses host networking so local LAN devices are reachable the same way public URLs are, without the Docker bridge isolation problem.
- If you run the app in a VM or container on a different network segment, local devices will still not be reachable from there.

Security
- This is intended for use on your home network. If you expose it to the internet, secure it behind a reverse proxy with authentication (e.g., Nginx + OAuth, or use a VPN).
