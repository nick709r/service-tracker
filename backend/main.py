from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from pathlib import Path
import json
import asyncio
import aiohttp
import bcrypt as bcrypt_lib
from fastapi.middleware.cors import CORSMiddleware
import os

DATA_DIR = Path(os.environ.get("SERVICE_TRACKER_DATA_DIR", "/app/data"))
CONFIG_FILE = DATA_DIR / "config.json"
SERVICES_FILE = DATA_DIR / "services.json"

app = FastAPI(title="Service Tracker API")

app.add_middleware(
    CORSMiddleware,
    # Allow origins can be set via ALLOWED_ORIGINS (comma-separated). Defaults to all for LAN use.
    allow_origins=[o.strip() for o in os.getenv('ALLOWED_ORIGINS','*').split(',')] ,
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
        # create default admin/admin
        # Default admin credentials can be provided via environment variables for deployment convenience.
        admin_user = os.getenv('ADMIN_USER', 'admin')
        admin_password = os.getenv('ADMIN_PASSWORD', 'admin')
        default = {
            "admin_user": admin_user,
            "admin_password_hash": bcrypt_lib.hashpw(admin_password.encode(), bcrypt_lib.gensalt()).decode(),
            "home_assistant": {}
        }
        CONFIG_FILE.write_text(json.dumps(default, indent=2))
    return json.loads(CONFIG_FILE.read_text())


def save_config(cfg: dict):
    ensure_data_dir()
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def load_services():
    ensure_data_dir()
    if not SERVICES_FILE.exists():
        default_services = [
            {"id": "sonarr", "name": "Sonarr", "type": "sonarr", "url": "http://sonarr:8989", "api_key": ""},
            {"id": "lidarr", "name": "Lidarr", "type": "lidarr", "url": "http://lidarr:8686", "api_key": ""},
            {"id": "transmission", "name": "Transmission", "type": "transmission", "url": "http://transmission:9091", "api_key": ""},
            {"id": "homeassistant", "name": "Home Assistant", "type": "homeassistant", "url": "http://homeassistant:8123", "api_key": ""},
            {"id": "agentdvr", "name": "Agent DVR", "type": "agentdvr", "url": "http://agentdvr:8090", "api_key": ""}
        ]
        SERVICES_FILE.write_text(json.dumps(default_services, indent=2))
    return json.loads(SERVICES_FILE.read_text())


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
    if payload.username == cfg.get("admin_user") and bcrypt_lib.checkpw(payload.password.encode(), cfg.get("admin_password_hash").encode()):
        return {"success": True, "username": payload.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/api/change_password")
async def change_password(payload: ChangePasswordRequest):
    cfg = load_config()
    if payload.username != cfg.get("admin_user"):
        raise HTTPException(status_code=403, detail="Invalid user")
    if not bcrypt_lib.checkpw(payload.current_password.encode(), cfg.get("admin_password_hash").encode()):
        raise HTTPException(status_code=403, detail="Current password incorrect")
    cfg["admin_password_hash"] = bcrypt_lib.hashpw(payload.new_password.encode(), bcrypt_lib.gensalt()).decode()
    save_config(cfg)
    return {"success": True}


@app.get("/api/services")
async def get_services():
    return load_services()


@app.post("/api/services")
async def add_service(item: ServiceItem):
    svcs = load_services()
    new_id = item.id or item.name.lower().replace(" ", "_")
    svc = {"id": new_id, "name": item.name, "type": item.type, "url": item.url, "api_key": item.api_key}
    svcs.append(svc)
    save_services(svcs)
    return svc


@app.put("/api/services/{svc_id}")
async def update_service(svc_id: str, item: ServiceItem):
    svcs = load_services()
    for s in svcs:
        if s.get("id") == svc_id:
            s.update({"name": item.name, "type": item.type, "url": item.url, "api_key": item.api_key})
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


@app.get("/api/services/{svc_id}/status")
async def service_status(svc_id: str):
    svcs = load_services()
    for s in svcs:
        if s.get("id") == svc_id:
            url = s.get("url")
            if not url:
                return {"status": "no_url"}
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=5) as resp:
                        return {"status": "ok" if resp.status < 400 else "error", "code": resp.status}
            except Exception as e:
                return {"status": "unreachable", "error": str(e)}
    raise HTTPException(status_code=404, detail="Service not found")


@app.get("/api/home_assistant/check")
async def check_home_assistant():
    cfg = load_config()
    ha = cfg.get("home_assistant", {})
    url = ha.get("url")
    token = ha.get("token")
    if not url or not token:
        raise HTTPException(status_code=400, detail="Home Assistant not configured")
    # Use Bearer token for Home Assistant API requests
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
