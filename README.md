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

2. The frontend will be available at http://<your-server-ip>:6969 and the backend at http://<your-server-ip>:6962

Notes for deployment:
- The project includes a docker-compose.yml and Dockerfiles for the frontend (nginx) and backend (uvicorn). Run `docker compose up -d --build` in the repository root to start both services.
- By default the frontend listens on port 6969 and the backend on port 6962. To change these, copy .env.example to .env and set FRONTEND_PORT and BACKEND_PORT before running docker compose.
- Ensure your Linux server firewall allows inbound connections to the chosen FRONTEND_PORT (e.g. 6969) so devices on your local network (phones, laptops) can reach the UI. The backend is proxied by the frontend for browser access; if you need direct API access, open BACKEND_PORT as well.
- The frontend nginx proxies /api/ requests to the backend container by service name (backend:6962) so both services must be on the same Docker network (the included docker-compose sets that up).


Customize
- Configure services and Home Assistant integration from the web UI after logging in.

Security
- This is intended for use on your home network. If you expose it to the internet, secure it behind a reverse proxy with authentication (e.g., Nginx + OAuth, or use a VPN).
