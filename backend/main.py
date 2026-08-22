import asyncio
import json
import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

import aiohttp
import bcrypt
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DEFAULT_DATA_DIR = Path("/app/data")
LOCAL_DATA_DIR = Path(__file__).resolve().parent / "data"


def resolve_data_dir():
    preferred = os.environ.get("SERVICE_TRACKER_DATA_DIR")
    if preferred:
        return Path(preferred)
    for candidate in (DEFAULT_DATA_DIR, LOCAL_DATA_DIR):
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            return candidate
        except PermissionError:
            continue
    return LOCAL_DATA_DIR


DATA_DIR = resolve_data_dir()
CONFIG_FILE = DATA_DIR / "config.json"
SERVICES_FILE = DATA_DIR / "services.json"
LAST_SERVICE_STATUS = {}

app = FastAPI(title="LennyCat Service Monitor API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    username: str
    current_password: str
    new_password: str


class ServiceItem(BaseModel):
    id: str | None = None
    name: str
    type: str | None = None
    url: str | None = None
    api_key: str | None = None


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_config():
    ensure_data_dir()
    if not CONFIG_FILE.exists():
        default = {
            "admin_user": "admin",
            "admin_password_hash": bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode(),
            "home_assistant": {},
            "email_notifications": {
                "enabled": False,
                "smtp_host": "",
                "smtp_port": 587,
                "smtp_username": "",
                "smtp_password": "",
                "from_email": "",
                "to_email": "",
                "use_tls": True,
            },
        }
        CONFIG_FILE.write_text(json.dumps(default, indent=2))
    return json.loads(CONFIG_FILE.read_text())


def save_config(cfg: dict):
    ensure_data_dir()
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def coerce_service_url(url: str | None):
    if not url:
        return url
    value = url.strip()
    if not value:
        return value
    if "://" not in value:
        value = f"http://{value}"
    return value


def coerce_status_url(url: str | None):
    return coerce_service_url(url)


def load_services():
    ensure_data_dir()
    if not SERVICES_FILE.exists():
        default_services = [
            {"id": "sonarr", "name": "Sonarr", "type": "sonarr", "url": "", "api_key": ""},
            {"id": "lidarr", "name": "Lidarr", "type": "lidarr", "url": "", "api_key": ""},
            {"id": "transmission", "name": "Transmission", "type": "transmission", "url": "", "api_key": ""},
            {"id": "homeassistant", "name": "Home Assistant", "type": "homeassistant", "url": "", "api_key": ""},
            {"id": "agentdvr", "name": "Agent DVR", "type": "agentdvr", "url": "", "api_key": ""},
        ]
        SERVICES_FILE.write_text(json.dumps(default_services, indent=2))
        return default_services

    services = json.loads(SERVICES_FILE.read_text())
    if not isinstance(services, list):
        services = []

    legacy_urls = {
        "http://sonarr:8989",
        "http://lidarr:8686",
        "http://transmission:9091",
        "http://homeassistant:8123",
        "http://agentdvr:8090",
        "http://localhost:8989",
        "http://localhost:8686",
        "http://localhost:9091",
        "http://localhost:8123",
        "http://localhost:8090",
        "http://127.0.0.1:8989",
        "http://127.0.0.1:8686",
        "http://127.0.0.1:9091",
        "http://127.0.0.1:8123",
        "http://127.0.0.1:8090",
    }

    cleaned = []
    seen_ids = set()
    seen_pairs = set()
    changed = False
    for service in services:
        if not isinstance(service, dict):
            changed = True
            continue

        svc = dict(service)
        svc["id"] = str(svc.get("id") or svc.get("name") or "").strip().lower().replace(" ", "_")
        if not svc["id"]:
            svc["id"] = f"service_{len(cleaned)}"

        url = (svc.get("url") or "").strip()
        if url in legacy_urls:
            svc["url"] = ""
            changed = True

        if not svc.get("name"):
            svc["name"] = svc["id"].replace("_", " ").title()
            changed = True

        pair = (svc.get("id"), (svc.get("url") or "").strip(), (svc.get("name") or "").strip())
        if svc.get("id") in seen_ids or pair in seen_pairs:
            changed = True
            continue

        seen_ids.add(svc["id"])
        seen_pairs.add(pair)
        cleaned.append(svc)

    if changed:
        save_services(cleaned)
    return cleaned


def save_services(svcs):
    ensure_data_dir()
    SERVICES_FILE.write_text(json.dumps(svcs, indent=2))


def as_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def resolve_email_settings(cfg: dict | None = None):
    cfg = cfg or load_config()
    email_cfg = cfg.get("email_notifications", {})
    return {
        "enabled": bool(email_cfg.get("enabled") or os.environ.get("SERVICE_TRACKER_EMAIL_ENABLED", "").lower() in {"1", "true", "yes"}),
        "smtp_host": (email_cfg.get("smtp_host") or os.environ.get("SERVICE_TRACKER_SMTP_HOST", "")).strip(),
        "smtp_port": int(email_cfg.get("smtp_port") or os.environ.get("SERVICE_TRACKER_SMTP_PORT", "587") or 587),
        "smtp_username": (email_cfg.get("smtp_username") or os.environ.get("SERVICE_TRACKER_SMTP_USERNAME", "")).strip(),
        "smtp_password": (email_cfg.get("smtp_password") or os.environ.get("SERVICE_TRACKER_SMTP_PASSWORD", "")).strip(),
        "from_email": (email_cfg.get("from_email") or os.environ.get("SERVICE_TRACKER_FROM_EMAIL", "")).strip(),
        "to_email": (email_cfg.get("to_email") or os.environ.get("SERVICE_TRACKER_TO_EMAIL", "")).strip(),
        "use_tls": as_bool(email_cfg.get("use_tls", os.environ.get("SERVICE_TRACKER_SMTP_USE_TLS", "true")), True),
    }


async def send_email_notification(service_name: str, status: str, details: dict):
    cfg = load_config()
    settings = resolve_email_settings(cfg)
    if not settings.get("enabled"):
        return
    required = [settings.get("smtp_host"), settings.get("from_email"), settings.get("to_email")]
    if not all(required):
        return

    msg = EmailMessage()
    msg["Subject"] = f"LennyCat Service Monitor: {service_name} is {status}"
    msg["From"] = settings["from_email"]
    msg["To"] = settings["to_email"]
    body_lines = [
        f"Service: {service_name}",
        f"Status: {status}",
        f"URL: {details.get('url', 'n/a')}",
        f"Code: {details.get('code', 'n/a')}",
        f"Final URL: {details.get('final_url', 'n/a')}",
        f"Error: {details.get('error') or 'n/a'}",
        "",
        "This is an alert from LennyCat Service Monitor.",
    ]
    msg.set_content("\n".join(body_lines))

    try:
        with smtplib.SMTP(settings["smtp_host"], settings["smtp_port"]) as smtp:
            if settings.get("use_tls"):
                smtp.starttls()
            if settings.get("smtp_username"):
                smtp.login(settings["smtp_username"], settings["smtp_password"])
            smtp.send_message(msg)
    except Exception:
        return


async def _service_status_payload(service: dict):
    url = coerce_status_url(service.get("url"))
    if not url:
        return {"status": "no_url", "url": service.get("url")}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=10, allow_redirects=True) as resp:
                return {
                    "status": "reachable" if resp.status < 600 else "error",
                    "code": resp.status,
                    "final_url": str(resp.url),
                    "reason": "reachable HTTP endpoint" if resp.status < 600 else "server responded with an error",
                    "url": url,
                }
    except Exception as e:
        return {"status": "unreachable", "error": str(e), "url": url}


async def service_monitor_loop():
    while True:
        try:
            services = load_services()
            for service in services:
                svc_id = str(service.get("id") or "").strip()
                if not svc_id:
                    continue
                result = await _service_status_payload(service)
                current_status = result.get("status")
                previous = LAST_SERVICE_STATUS.get(svc_id)
                if previous != current_status:
                    if current_status in {"reachable", "unreachable"}:
                        await send_email_notification(service.get("name") or svc_id, current_status, result)
                    LAST_SERVICE_STATUS[svc_id] = current_status
        except Exception:
            pass
        await asyncio.sleep(30)


@app.on_event("startup")
async def startup_event():
    load_config()
    load_services()
    asyncio.create_task(service_monitor_loop())


@app.post("/api/login")
async def login(payload: LoginRequest):
    cfg = load_config()
    stored_hash = cfg.get("admin_password_hash")
    if payload.username == cfg.get("admin_user") and stored_hash and bcrypt.checkpw(payload.password.encode(), stored_hash.encode()):
        return {"success": True, "username": payload.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/api/change_password")
async def change_password(payload: ChangePasswordRequest):
    cfg = load_config()
    if payload.username != cfg.get("admin_user"):
        raise HTTPException(status_code=403, detail="Invalid user")
    if not bcrypt.checkpw(payload.current_password.encode(), cfg.get("admin_password_hash").encode()):
        raise HTTPException(status_code=403, detail="Current password incorrect")
    cfg["admin_password_hash"] = bcrypt.hashpw(payload.new_password.encode(), bcrypt.gensalt()).decode()
    save_config(cfg)
    return {"success": True}


@app.get("/api/services")
async def get_services():
    return load_services()


@app.post("/api/services")
async def add_service(item: ServiceItem):
    svcs = load_services()
    new_id = item.id or item.name.lower().replace(" ", "_")
    url = coerce_service_url(item.url)
    svc = {"id": new_id, "name": item.name, "type": item.type, "url": url, "api_key": item.api_key}
    svcs.append(svc)
    save_services(svcs)
    return svc


@app.put("/api/services/{svc_id}")
async def update_service(svc_id: str, item: ServiceItem):
    svcs = load_services()
    for s in svcs:
        if s.get("id") == svc_id:
            s.update({"name": item.name, "type": item.type, "url": coerce_service_url(item.url), "api_key": item.api_key})
            save_services(svcs)
            return s
    raise HTTPException(status_code=404, detail="Service not found")


@app.delete("/api/services/{svc_id}")
async def delete_service(svc_id: str):
    svcs = load_services()
    new = [s for s in svcs if s.get("id") != svc_id]
    if len(new) == len(svcs):
        raise HTTPException(status_code=404, detail="Service not found")
    save_services(new)
    return {"success": True}


async def _agent_dvr_camera_data(base_url: str, api_key: str | None = None):
    candidates = [
        f"{base_url.rstrip('/')}/api/cameras",
        f"{base_url.rstrip('/')}/api/cameras/",
        f"{base_url.rstrip('/')}/api/v1/cameras",
        f"{base_url.rstrip('/')}/api/JSON?request=GetCameras",
    ]
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["X-API-Key"] = api_key
    for candidate in candidates:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(candidate, headers=headers, timeout=5) as resp:
                    if resp.status != 200:
                        continue
                    payload = await resp.json(content_type=None)
                    items = payload
                    if isinstance(payload, dict):
                        for key in ["cameras", "items", "data", "cameraList", "results"]:
                            if isinstance(payload.get(key), list):
                                items = payload[key]
                                break
                    if isinstance(items, list):
                        result = []
                        for camera in items:
                            if not isinstance(camera, dict):
                                continue
                            def pick(*values):
                                for value in values:
                                    if value is None:
                                        continue
                                    if isinstance(value, str) and value.strip() == "":
                                        continue
                                    return value
                                return None

                            camera_id = str(pick(camera.get("id"), camera.get("cameraId"), camera.get("deviceId"), camera.get("ID"), camera.get("camera_id")) or "").strip()
                            name = pick(camera.get("name"), camera.get("cameraName"), camera.get("label"), camera.get("title"), f"Camera {camera_id or len(result)+1}")
                            status = pick(camera.get("status"), camera.get("state"), camera.get("recordingState"), camera.get("cameraStatus"), "online" if camera.get("isOnline") or camera.get("isConnected") else "offline")
                            online = bool(camera.get("isOnline") or camera.get("isConnected") or str(status).lower() in {"online", "connected", "recording", "active"})
                            recording = bool(camera.get("isRecording") or camera.get("recording") or camera.get("isRecordingNow") or str(status).lower() in {"recording"})
                            motion_detected = bool(camera.get("isMotionDetected") or camera.get("motionDetected") or camera.get("motion") or camera.get("motionDetected") or camera.get("isMotion") or str(status).lower() in {"motion", "motion_detected"})
                            snapshot = pick(camera.get("snapshotUrl"), camera.get("snapshot_url"), camera.get("snapshot"), camera.get("image"), camera.get("thumbnail"), camera.get("snapshotUrl"))
                            stream_url = pick(camera.get("streamUrl"), camera.get("stream_url"), camera.get("rtsp"), camera.get("uri"), camera.get("url"))
                            if snapshot and not str(snapshot).startswith("http"):
                                snapshot = f"{base_url.rstrip('/')}/{str(snapshot).lstrip('/')}"
                            if camera_id and not snapshot:
                                snapshot = f"{base_url.rstrip('/')}/api/cameras/{camera_id}/snapshot"
                            if stream_url and not str(stream_url).startswith("http"):
                                stream_url = f"{base_url.rstrip('/')}/{str(stream_url).lstrip('/')}"

                            width = pick(camera.get("width"), camera.get("imageWidth"), camera.get("streamWidth"))
                            height = pick(camera.get("height"), camera.get("imageHeight"), camera.get("streamHeight"))
                            resolution = None
                            if width or height:
                                resolution = f"{width}x{height}" if width and height else (str(width) if width else str(height))

                            details = []
                            for label, value in [
                                ("Status", status),
                                ("Online", "Yes" if online else "No"),
                                ("Recording", "Yes" if recording else "No"),
                                ("Motion", "Detected" if motion_detected else "Idle"),
                                ("Resolution", resolution),
                                ("FPS", pick(camera.get("fps"), camera.get("frameRate"), camera.get("frame_rate"))),
                                ("Channel", pick(camera.get("channel"), camera.get("channelNumber"), camera.get("channel_number"))),
                                ("Codec", pick(camera.get("codec"), camera.get("videoCodec"), camera.get("video_codec"))),
                                ("Address", pick(camera.get("address"), camera.get("host"), camera.get("ip"))),
                            ]:
                                if value is not None:
                                    details.append({"label": label, "value": str(value)})

                            result.append({
                                "id": camera_id,
                                "name": str(name),
                                "status": str(status).lower(),
                                "online": bool(online),
                                "recording": bool(recording),
                                "motion_detected": bool(motion_detected),
                                "snapshot_url": snapshot,
                                "stream_url": stream_url,
                                "resolution": resolution,
                                "details": details,
                            })
                        return {"cameras": result}
        except Exception:
            continue
    return {"cameras": []}


@app.get("/api/services/{svc_id}/status")
async def service_status(svc_id: str):
    svcs = load_services()
    for s in svcs:
        if s.get("id") == svc_id:
            result = await _service_status_payload(s)
            if result.get("status") == "no_url":
                return {"status": "no_url"}
            return result
    raise HTTPException(status_code=404, detail="Service not found")


@app.get("/api/services/{svc_id}/cameras")
async def service_cameras(svc_id: str):
    svcs = load_services()
    for s in svcs:
        if s.get("id") == svc_id:
            if s.get("type") != "agentdvr":
                return {"cameras": []}
            url = s.get("url")
            if not url:
                return {"cameras": []}
            api_key = s.get("api_key")
            return await _agent_dvr_camera_data(url, api_key)
    raise HTTPException(status_code=404, detail="Service not found")


@app.get("/api/email_notifications")
async def get_email_notifications():
    cfg = load_config()
    return resolve_email_settings(cfg)


@app.post("/api/email_notifications")
async def set_email_notifications(cfg_payload: dict):
    cfg = load_config()
    email_cfg = cfg.setdefault("email_notifications", {})
    for key, value in cfg_payload.items():
        if key == "smtp_port":
            try:
                email_cfg[key] = int(value)
            except (TypeError, ValueError):
                email_cfg[key] = 587
        elif key in {"enabled", "use_tls"}:
            email_cfg[key] = bool(value)
        else:
            email_cfg[key] = value
    save_config(cfg)
    return {"success": True}


async def _home_assistant_states():
    cfg = load_config()
    ha = cfg.get("home_assistant", {})
    url = ha.get("url")
    token = ha.get("token")
    if not url or not token:
        raise HTTPException(status_code=400, detail="Home Assistant not configured")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(f"{url}/api/states", timeout=10) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="Unable to fetch Home Assistant state data")
            return await resp.json()


@app.get("/api/home_assistant/network")
async def home_assistant_network():
    states = await _home_assistant_states()

    def label(state_obj):
        attrs = state_obj.get("attributes") or {}
        return (attrs.get("friendly_name") or state_obj.get("entity_id") or "Unknown").strip()

    zigbee = []
    bluetooth = []
    network_devices = []
    device_tracker = []

    for state in states:
        entity_id = (state.get("entity_id") or "").lower()
        friendly = label(state)
        cleaned = {
            "entity_id": state.get("entity_id"),
            "state": state.get("state"),
            "friendly_name": friendly,
            "attributes": state.get("attributes") or {},
        }

        if "zigbee" in entity_id or "zha" in entity_id or "mqtt" in entity_id and "network" in entity_id:
            zigbee.append(cleaned)
        if "bluetooth" in entity_id or "bt" in entity_id or "mesh" in entity_id:
            bluetooth.append(cleaned)
        if entity_id.startswith("device_tracker.") or "network" in entity_id or "wifi" in entity_id or "lan" in entity_id:
            device_tracker.append(cleaned)

        if entity_id.startswith("device_tracker."):
            network_devices.append({
                "entity_id": state.get("entity_id"),
                "friendly_name": friendly,
                "state": state.get("state"),
                "source_type": (state.get("attributes") or {}).get("source_type", "unknown"),
                "last_seen": (state.get("attributes") or {}).get("last_seen") or (state.get("attributes") or {}).get("last_updated") or None,
            })

    def status_from_value(value):
        if value is None:
            return "unknown"
        v = str(value).lower()
        if v in {"on", "home", "connected", "online", "active", "ok", "ready"}:
            return "online"
        if v in {"off", "away", "disconnected", "offline", "not_home", "unavailable", "unknown", "error"}:
            return "offline"
        return "unknown"

    zigbee_summary = {
        "status": status_from_value((zigbee[0].get("state") if zigbee else "unknown")),
        "count": len(zigbee),
        "items": zigbee[:10],
    }
    bluetooth_summary = {
        "status": status_from_value((bluetooth[0].get("state") if bluetooth else "unknown")),
        "count": len(bluetooth),
        "items": bluetooth[:10],
    }
    connected_devices = [d for d in network_devices if str(d.get("state") or "").lower() in {"home", "connected", "on", "online", "active", "ready"}]
    disconnected_devices = [d for d in network_devices if str(d.get("state") or "").lower() not in {"home", "connected", "on", "online", "active", "ready"}]

    return {
        "zigbee": zigbee_summary,
        "bluetooth": bluetooth_summary,
        "network": {
            "total": len(network_devices),
            "connected": len(connected_devices),
            "disconnected": len(disconnected_devices),
            "devices": network_devices[:25],
            "connected_devices": connected_devices[:10],
            "disconnected_devices": disconnected_devices[:10],
        },
        "device_tracker": device_tracker[:25],
    }


@app.get("/api/home_assistant/check")
async def check_home_assistant():
    cfg = load_config()
    ha = cfg.get("home_assistant", {})
    url = ha.get("url")
    token = ha.get("token")
    if not url or not token:
        raise HTTPException(status_code=400, detail="Home Assistant not configured")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(f"{url}/api/", timeout=5) as resp:
                return {"status": "ok" if resp.status == 200 else "error", "code": resp.status}
    except Exception as e:
        return {"status": "unreachable", "error": str(e)}


@app.post("/api/home_assistant")
async def set_home_assistant(cfg_payload: dict):
    cfg = load_config()
    cfg["home_assistant"] = cfg_payload
    save_config(cfg)
    return {"success": True}
