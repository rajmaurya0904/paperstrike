"""Paperstrike data service: broker market data + the paper account store.

Run: uvicorn server:app --host 127.0.0.1 --port 8000

Built to run on the user's own machine. It holds their broker keys, so it only
answers the web app's origin and local hostnames, and never echoes a secret back.
"""
import asyncio
import json
import os
import re
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
from providers.upstox import LoginError
from relay import relay

WEB_ORIGINS = [o.strip().rstrip("/") for o in
               os.environ.get("WEB_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]
ALLOWED_HOSTS = {h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,api").split(",")}
MAX_BODY = 16 * 1024 * 1024  # a paper account with years of trades is still well under this

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"cache-control", b"no-store"),
]

# interactive API docs load their scripts from a CDN, so they're opt-in
DOCS = os.environ.get("API_DOCS") == "1"
app = FastAPI(title="Paperstrike data service", docs_url="/docs" if DOCS else None,
              redoc_url=None, openapi_url="/openapi.json" if DOCS else None)


class LocalOnly:
    """Guards every HTTP request and websocket, not just the HTTP routes.

    - Host allowlist: blocks DNS rebinding (a page on evil.com resolving to 127.0.0.1).
    - Origin allowlist on websockets and on anything that changes state, plus a
      JSON content type on writes, so another website can't quietly POST here
      from the user's browser.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        kind = scope["type"]
        if kind not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in scope["headers"]}

        problem = None
        host = headers.get("host", "").rsplit(":", 1)[0].strip("[]")
        origin = headers.get("origin", "").rstrip("/")
        if host not in ALLOWED_HOSTS:
            problem = (403, "Host not allowed")
        elif kind == "websocket":
            if origin and origin not in WEB_ORIGINS:
                problem = (403, "Origin not allowed")
        elif scope["method"] in ("POST", "PUT", "PATCH", "DELETE"):
            if origin and origin not in WEB_ORIGINS:
                problem = (403, "Origin not allowed")
            elif not headers.get("content-type", "").startswith("application/json"):
                problem = (415, "Expected JSON")
            elif not headers.get("content-length", "").isdigit():
                problem = (411, "Content-Length required")
            elif int(headers["content-length"]) > MAX_BODY:
                problem = (413, "Request too large")

        if problem and kind == "websocket":
            return await send({"type": "websocket.close", "code": 1008})  # refused before accept
        if problem:
            status, detail = problem
            return await JSONResponse({"detail": detail}, status_code=status,
                                      headers={k.decode(): v.decode() for k, v in SECURITY_HEADERS})(
                scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                message["headers"] = list(message.get("headers", [])) + SECURITY_HEADERS
            await send(message)

        await self.app(scope, receive, send_with_headers if kind == "http" else send)


# added first so CORS wraps it: an allowed origin can still read a 413 or 415
app.add_middleware(LocalOnly)
app.add_middleware(
    CORSMiddleware,
    allow_origins=WEB_ORIGINS,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(NotConnected)
async def _not_connected(request: Request, e: NotConnected):
    return JSONResponse({"detail": str(e), "connect": True}, status_code=503)


# ── paper-trade persistence ───────────────────────────────────────────
# The account (balance, positions, orders, trades) lives here in SQLite so it
# survives a browser cache wipe — localStorage on the client is just an offline
# cache. One row per profile; "__meta__" holds the profile list and active name.
PROFILE = re.compile(r"[^\x00-\x1f\x7f]{1,64}")


def _db():
    c = sqlite3.connect(config.DB_FILE)
    c.execute("CREATE TABLE IF NOT EXISTS paper (profile TEXT PRIMARY KEY, json TEXT, updated REAL)")
    return c


def _profile(name: str) -> str:
    if not PROFILE.fullmatch(name) or not name.strip():
        raise HTTPException(400, "Profile names are 1-64 characters, no control characters")
    return name


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
        row = c.execute("SELECT json FROM paper WHERE profile=?", (_profile(profile),)).fetchone()
    if not row:
        raise HTTPException(404, "No saved state for this profile")
    return json.loads(row[0])


@app.put("/paper/{profile}")
def paper_put(profile: str, body: PaperBlob):
    if profile == "__meta__":
        profiles, active = body.data.get("profiles"), body.data.get("active")
        if not (isinstance(profiles, list) and all(isinstance(p, str) for p in profiles)
                and isinstance(active, str)):
            raise HTTPException(400, "Malformed profile list")
    with _db() as c:
        c.execute(
            "INSERT INTO paper(profile, json, updated) VALUES(?,?,?) "
            "ON CONFLICT(profile) DO UPDATE SET json=excluded.json, updated=excluded.updated",
            (_profile(profile), json.dumps(body.data), time.time()),
        )
        c.commit()
    return {"ok": True}


# ── market data ───────────────────────────────────────────────────────
INSTRUMENT = re.compile(r"(NSE|BSE)_(FO|INDEX)\|[A-Za-z0-9 ]{1,32}")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/indices")
def indices():
    return [{"id": i, "key": v[0], "label": v[1]} for i, v in INDICES.items()]


@app.websocket("/ws")
async def ws(sock: WebSocket):
    """Push every index's chain, about once a second, only when ticks arrived."""
    await sock.accept()
    relay.start()

    # Notice a closed tab even while nothing is being sent (market shut, no
    # broker) — otherwise every page reload would leave a loop running forever.
    gone = asyncio.Event()

    async def watch_close():
        try:
            while (await sock.receive())["type"] != "websocket.disconnect":
                pass
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            gone.set()

    watcher = asyncio.create_task(watch_close())
    last_version = -1
    try:
        while not gone.is_set():
            snap = relay.snapshot()
            if snap["version"] != last_version and snap["indices"]:
                last_version = snap["version"]
                await sock.send_json(snap)
            try:  # broker-like cadence; faster just makes prices unreadable
                await asyncio.wait_for(gone.wait(), timeout=0.9)
            except asyncio.TimeoutError:
                pass
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        watcher.cancel()


@app.get("/candles")
def candles(key: str, interval: str = "5m"):
    if interval not in INTERVALS:
        raise HTTPException(400, f"interval must be one of {list(INTERVALS)}")
    if not INSTRUMENT.fullmatch(key):
        raise HTTPException(400, "Unknown instrument key")
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
        fields = {k: config.check_value(v.strip()) for k, v in body.fields.items()}
        st = p.connect(fields)
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
# Failures go back as a short code, never as free text (see LoginError).
def _back(**query: str):
    return RedirectResponse(f"{WEB_ORIGINS[0]}/trade/settings?{urlencode(query)}")


@app.get("/auth/upstox/login")
def upstox_login():
    try:
        return RedirectResponse(providers.get("upstox").login_url())
    except LoginError as e:
        return _back(error=e.code)


@app.get("/auth/upstox/callback")
def upstox_callback(code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return _back(error="cancelled")
    try:
        providers.get("upstox").finish_login(code, state)
    except LoginError as e:
        return _back(error=e.code)
    except ValueError:
        return _back(error="refused")
    config.save(BROKER="upstox")
    relay.restart()
    return _back(connected="upstox")
