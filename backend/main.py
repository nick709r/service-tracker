from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from pathlib import Path
import json
import asyncio
import aiohttp
import bcrypt
from fastapi.middleware.cors import CORSMiddleware

DATA_DIR = Path("/app/data")
CONFIG_FILE = DATA_DIR / "config.json"
SERVICES_FILE = DATA_DIR / "services.json"

app = FastAPI(title="Service Tracker API")

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
            "home_assistant": {}
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
    if '://' not in value:
        value = f"http://{value}"
    return value


def load_services():
    ensure_data_dir()
    if not SERVICES_FILE.exists():
        default_services = [
            {"id": "sonarr", "name": "Sonarr", "type": "sonarr", "url": "", "api_key": ""},
            {"id": "lidarr", "name": "Lidarr", "type": "lidarr", "url": "", "api_key": ""},
            {"id": "transmission", "name": "Transmission", "type": "transmission", "url": "", "api_key": ""},
            {"id": "homeassistant", "name": "Home Assistant", "type": "homeassistant", "url": "", "api_key": ""},
            {"id": "agentdvr", "name": "Agent DVR", "type": "agentdvr", "url": "", "api_key": ""}
        ]
        SERVICES_FILE.write_text(json.dumps(default_services, indent=2))
        return default_services

    services = json.loads(SERVICES_FILE.read_text())
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
    }
    changed = False
    for service in services:
        url = (service.get("url") or "").strip()
        if url in legacy_urls:
            service["url"] = ""
            changed = True
    if changed:
        save_services(services)
    return services


def save_services(svcs):
    ensure_data_dir()
    SERVICES_FILE.write_text(json.dumps(svcs, indent=2))


@app.on_event("startup")
async def startup_event():
    load_config()
    load_services()


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
                            camera_id = str(camera.get("id") or camera.get("cameraId") or camera.get("deviceId") or camera.get("ID") or "").strip()
                            name = camera.get("name") or camera.get("cameraName") or camera.get("label") or f"Camera {camera_id or len(result)+1}"
                            status = camera.get("status") or camera.get("state") or camera.get("recordingState") or ("online" if camera.get("isOnline") or camera.get("isConnected") else "offline")
                            snapshot = camera.get("snapshotUrl") or camera.get("snapshot_url") or camera.get("snapshot") or camera.get("image") or camera.get("thumbnail")
                            if snapshot and not snapshot.startswith("http"):
                                snapshot = f"{base_url.rstrip('/')}/{snapshot.lstrip('/')}"
                            if camera_id and not snapshot:
                                snapshot = f"{base_url.rstrip('/')}/api/cameras/{camera_id}/snapshot"
                            result.append({
                                "id": camera_id,
                                "name": name,
                                "status": str(status).lower(),
                                "online": bool(camera.get("isOnline") or camera.get("isConnected") or str(status).lower() in {"online", "connected", "recording"}),
                                "recording": bool(camera.get("isRecording") or camera.get("recording") or str(status).lower() in {"recording"}),
                                "snapshot_url": snapshot,
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
            url = coerce_service_url(s.get("url"))
            if not url:
                return {"status": "no_url"}
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=5) as resp:
                        return {"status": "ok" if resp.status < 400 else "error", "code": resp.status}
            except Exception as e:
                return {"status": "unreachable", "error": str(e)}
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
