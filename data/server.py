"""Paperstrike data service: broker market data + the paper account store.

Run: uvicorn server:app --host 127.0.0.1 --port 8000

Built to run on the user's own machine. It holds their broker keys, so it only
answers the web app's origin and local hostnames, and never echoes a secret back.
"""
import asyncio
import json
import os
import sqlite3
import time
from urllib.parse import urlencode

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

import config
import providers
from providers.base import INDICES, INTERVALS, NotConnected
from relay import relay

WEB_ORIGINS = [o.strip().rstrip("/") for o in
               os.environ.get("WEB_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]
ALLOWED_HOSTS = {h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,api").split(",")}

app = FastAPI(title="Paperstrike data service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=WEB_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def local_only(request: Request, call_next):
    # Host check blocks DNS-rebinding; the Origin/content-type check stops another
    # website from quietly POSTing to this service from the user's browser.
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]")
    if host not in ALLOWED_HOSTS:
        return JSONResponse({"detail": "Host not allowed"}, status_code=403)
    if request.method in ("POST", "PUT", "DELETE"):
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") not in WEB_ORIGINS:
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        if not request.headers.get("content-type", "").startswith("application/json"):
            return JSONResponse({"detail": "Expected JSON"}, status_code=415)
    return await call_next(request)


@app.exception_handler(NotConnected)
async def _not_connected(request: Request, e: NotConnected):
    return JSONResponse({"detail": str(e), "connect": True}, status_code=503)


# ── paper-trade persistence ───────────────────────────────────────────
# The account (balance, positions, orders, trades) lives here in SQLite so it
# survives a browser cache wipe — localStorage on the client is just an offline
# cache. One row per profile; "__meta__" holds the profile list and active name.
def _db():
    c = sqlite3.connect(config.DB_FILE)
    c.execute("CREATE TABLE IF NOT EXISTS paper (profile TEXT PRIMARY KEY, json TEXT, updated REAL)")
    return c


class PaperBlob(BaseModel):
    data: dict


@app.get("/paper")
def paper_meta():
    with _db() as c:
        row = c.execute("SELECT json FROM paper WHERE profile='__meta__'").fetchone()
    return json.loads(row[0]) if row else {"profiles": [], "active": ""}


@app.get("/paper/{profile}")
def paper_get(profile: str):
    with _db() as c:
        row = c.execute("SELECT json FROM paper WHERE profile=?", (profile,)).fetchone()
    if not row:
        raise HTTPException(404, "No saved state for this profile")
    return json.loads(row[0])


@app.put("/paper/{profile}")
def paper_put(profile: str, body: PaperBlob):
    with _db() as c:
        c.execute(
            "INSERT INTO paper(profile, json, updated) VALUES(?,?,?) "
            "ON CONFLICT(profile) DO UPDATE SET json=excluded.json, updated=excluded.updated",
            (profile, json.dumps(body.data), time.time()),
        )
        c.commit()
    return {"ok": True}


# ── market data ───────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/indices")
def indices():
    return [{"id": i, "key": v[0], "label": v[1]} for i, v in INDICES.items()]


@app.websocket("/ws")
async def ws(sock: WebSocket):
    """Push every index's chain, about once a second, only when ticks arrived."""
    origin = (sock.headers.get("origin") or "").rstrip("/")
    if origin and origin not in WEB_ORIGINS:
        await sock.close(code=1008)
        return
    await sock.accept()
    relay.start()
    last_version = -1
    try:
        while True:
            snap = relay.snapshot()
            if snap["version"] != last_version and snap["indices"]:
                last_version = snap["version"]
                await sock.send_json(snap)
            await asyncio.sleep(0.9)  # broker-like cadence; faster just makes prices unreadable
    except (WebSocketDisconnect, RuntimeError):
        pass


@app.get("/candles")
def candles(key: str, interval: str = "5m"):
    if interval not in INTERVALS:
        raise HTTPException(400, f"interval must be one of {list(INTERVALS)}")
    p = providers.active()
    if p is None:
        raise NotConnected("No broker connected")
    try:
        return p.candles(key, interval)
    except (NotConnected, HTTPException):
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"{p.label}: {e}")


# ── bring your own key ────────────────────────────────────────────────
@app.get("/status")
def status():
    """Which broker is active and whether it works. Never includes a secret."""
    active = providers.active()
    out = {
        "broker": active.name if active else None,
        "brokers": [{"id": p.name, "label": p.label, "configured": p.configured(),
                     "oauth": getattr(p, "oauth_ready", lambda: False)()}
                    for p in providers.PROVIDERS.values()],
        "connected": False,
        "feed_error": relay.error,
    }
    if active:
        out.update(active.status())
    return out


class ConnectIn(BaseModel):
    broker: str
    fields: dict[str, str] = {}


@app.post("/connect")
def connect(body: ConnectIn):
    try:
        p = providers.get(body.broker)
    except KeyError:
        raise HTTPException(400, "Unknown broker")
    try:
        st = p.connect(body.fields)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if st.get("connected"):
        config.save(BROKER=p.name)
        relay.restart()
    return {"broker": p.name, **st}


class DisconnectIn(BaseModel):
    broker: str


@app.post("/disconnect")
def disconnect(body: DisconnectIn):
    """Forget a broker's saved keys on this machine."""
    if body.broker not in providers.PROVIDERS:
        raise HTTPException(400, "Unknown broker")
    prefix = body.broker.upper() + "_"
    config.save(**{k: None for k in config.KEYS if k.startswith(prefix)})
    if config.get("BROKER") == body.broker:
        config.save(BROKER=None)
        relay.restart()
    return {"ok": True}


# Upstox OAuth ("Login with Upstox"): the browser opens /auth/upstox/login →
# Upstox sign-in → Upstox redirects to /auth/upstox/callback with a code.
# UPSTOX_REDIRECT_URI in the user's Upstox app must point at that callback.
def _back(**query: str):
    return RedirectResponse(f"{WEB_ORIGINS[0]}/trade/settings?{urlencode(query)}")


@app.get("/auth/upstox/login")
def upstox_login():
    try:
        return RedirectResponse(providers.get("upstox").login_url())
    except ValueError as e:
        return _back(error=str(e))


@app.get("/auth/upstox/callback")
def upstox_callback(code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return _back(error="Upstox login was cancelled")
    try:
        providers.get("upstox").finish_login(code, state)
    except ValueError as e:
        return _back(error=str(e))
    config.save(BROKER="upstox")
    relay.restart()
    return _back(connected="upstox")
