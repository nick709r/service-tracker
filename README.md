# Service Tracker

Service Tracker is a lightweight dashboard for self-hosted media and home automation services. It gives you a clean, mobile-friendly view of the apps you depend on most, like Sonarr, Lidarr, Transmission, Home Assistant, and Agent DVR, so you can tell at a glance whether they are online or failing.

It runs as a simple Linux service, not in Docker, and is designed for home servers and homelab setups.

<p align="center">
  <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80" alt="Home server dashboard" width="1000" />
</p>

## What it monitors

This app is aimed at the kind of services you typically run on a home server:

- Sonarr — TV library automation and download health
- Lidarr — music library / download health
- Transmission — torrent client availability
- Home Assistant — smart home control panel and automation status
- Agent DVR — NVR / camera system availability
- Generic HTTP services — any app with a web UI, such as Jellyfin, Radarr, qBittorrent, Nextcloud, Pi-hole, etc.

The app checks the HTTP endpoint for each configured service and reports whether it responds successfully, fails, or is unreachable.

### Example service list

| Service | Typical URL | What it tells you |
| --- | --- | --- |
| Sonarr | http://sonarr:8989 | Is your TV automation service responding? |
| Lidarr | http://lidarr:8686 | Is music automation alive and reachable? |
| Transmission | http://transmission:9091 | Is the torrent client still active? |
| Home Assistant | http://homeassistant:8123 | Is the smart home hub online? |
| Agent DVR | http://agentdvr:8090 | Is your camera/NVR system reachable? |
| Custom service | http://server.local:8080 | Any other app you want to monitor |

## Features

- FastAPI backend for the monitoring API and configuration
- Simple static frontend for mobile and desktop access
- Login-protected admin access
- Configurable service list and URLs
- Home Assistant connection check
- Runs as a systemd service at boot
- One-command installer for Linux servers

## Dashboard and examples

<p align="center">
  <img src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80" alt="Home lab server setup" width="1000" />
</p>

The web UI is kept intentionally simple:

- Add a service name and URL
- See the service status in the list
- Trigger a manual health check
- Save Home Assistant URL/token metadata
- Maintain a quick overview of your self-hosted tools

### Example service entry

```json
{
  "id": "sonarr",
  "name": "Sonarr",
  "type": "sonarr",
  "url": "http://sonarr:8989",
  "api_key": ""
}
```

### Example status response

```json
{
  "status": "ok",
  "code": 200
}
```

```json
{
  "status": "unreachable",
  "error": "Connection refused"
}
```

## Home Assistant support

Service Tracker can also store a Home Assistant URL and long-lived token so you can verify the HA connection from the dashboard.

Example configuration:

```json
{
  "url": "http://homeassistant:8123",
  "token": "your_long_lived_token_here"
}
```

This is especially useful when your server is hosting both media automation and home automation tools and you want a single quick view of the whole stack.

## Default credentials

The default admin login is:

- Username: admin
- Password: admin

It is strongly recommended to change the password after the first login.

## Quick install

1. Run the installer on your Linux server:

```bash
curl -sL https://raw.githubusercontent.com/nick709r/service-tracker/main/install.sh | sudo bash
```

2. Open the app in a browser:

- Frontend: http://<your-server-ip>:6969
- Backend: http://<your-server-ip>:6962

3. Log in with the default admin credentials and add your services.

## Service configuration

- Frontend port: 6969
- Backend port: 6962
- Data directory: /opt/service-tracker/data
- Logs: /opt/service-tracker/logs

To change the ports before installation, edit the values in the service file or export `FRONTEND_PORT` and `BACKEND_PORT` before running the service start script.

## Typical setup

A common homelab layout looks like this:

- Media stack: Sonarr, Lidarr, Transmission
- Automation: Home Assistant
- Security / NVR: Agent DVR
- Dashboard: Service Tracker

This gives you one simple place to check whether your core apps are up before you dig into logs or restart anything.

## Security

This is intended for use on your home network. If you expose it to the internet, secure it behind a reverse proxy with authentication (for example Nginx + OAuth, or use a VPN).

## Example use cases

- Check whether your media automation stack is still healthy after an update
- Confirm your torrent client is still alive before adding jobs
- Verify Home Assistant is reachable from the same server
- Keep tabs on a camera/NVR service without opening multiple browser tabs
- Quickly check if a custom internal service is online

## Project goals

The goal of Service Tracker is not to replace full monitoring platforms. It is a fast, simple, low-overhead web dashboard for the services you actually run on your home server and want to know are still alive.

<p align="center">
  <img src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80" alt="Server monitoring and health checks" width="1000" />
</p>
