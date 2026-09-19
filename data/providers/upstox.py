"""Upstox provider: REST v2/v3 + the v3 protobuf market-data websocket.

Credentials (all the user's own, from https://account.upstox.com/developer/apps):
  UPSTOX_API_KEY / UPSTOX_API_SECRET / UPSTOX_REDIRECT_URI → "Login with Upstox"
  UPSTOX_ACCESS_TOKEN → the daily token (expires 03:30 IST); either minted by the
  OAuth callback or pasted by hand.
"""
from __future__ import annotations

import base64
import json
import secrets
import ssl
import threading
import time
import urllib.parse
import uuid
from datetime import date, datetime, timedelta

import certifi
import requests
import websocket
from websocket import ABNF

import config
from proto.MarketDataFeed_pb2 import FeedResponse

from .base import INDICES, INTERVALS, Chain, ChainRow, Leg, NotConnected, Provider

V2 = "https://api.upstox.com/v2"
V3 = "https://api.upstox.com/v3"
TIMEOUT = 10
MAX_PENDING_LOGINS = 8  # OAuth states kept at once; older ones are dropped


class LoginError(ValueError):
    """A "Log in with Upstox" failure. `code` goes back to the web app in the
    redirect URL, which maps it to its own wording — so the URL can't be used
    to put arbitrary text on the settings page."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _token_exp(token: str):
    try:
        p = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))["exp"]
    except Exception:
        return None


class Upstox(Provider):
    name = "upstox"
    label = "Upstox"

    def __init__(self):
        self._oauth_states: dict[str, float] = {}
        self._verified: tuple[str, float] | None = None  # (token, checked_at)

    # ── http ─────────────────────────────────────────────────────
    def _token(self) -> str:
        t = config.get("UPSTOX_ACCESS_TOKEN")
        exp = _token_exp(t)
        if not t or not exp or exp < time.time():
            raise NotConnected("Upstox token missing or expired")
        return t

    def _get(self, url: str, params: dict | None = None):
        r = requests.get(
            url, params=params, timeout=TIMEOUT,
            headers={"Authorization": f"Bearer {self._token()}", "Accept": "application/json"},
        )
        if r.status_code == 401:
            raise NotConnected("Upstox rejected the token")
        r.raise_for_status()
        return r.json()["data"]

    # ── credentials ──────────────────────────────────────────────
    def oauth_ready(self) -> bool:
        return bool(config.get("UPSTOX_API_KEY") and config.get("UPSTOX_API_SECRET")
                    and config.get("UPSTOX_REDIRECT_URI"))

    def status(self) -> dict:
        t = config.get("UPSTOX_ACCESS_TOKEN")
        exp = _token_exp(t)
        out = {"connected": False, "expires_at": exp, "oauth": self.oauth_ready(), "detail": ""}
        if not t:
            out["detail"] = "No access token yet"
        elif not exp or exp < time.time():
            out["detail"] = "Token expired — log in again (Upstox tokens expire 03:30 IST)"
        else:
            # a live check, cached so a polling settings page doesn't hammer Upstox
            if self._verified and self._verified[0] == t and time.time() - self._verified[1] < 60:
                out["connected"] = True
            else:
                try:
                    self._get(f"{V2}/user/profile")
                    self._verified = (t, time.time())
                    out["connected"] = True
                except Exception:
                    out["detail"] = "Upstox rejected the token"
        return out

    def connect(self, fields: dict) -> dict:
        """Either an app (key/secret/redirect → enables OAuth) or a pasted token."""
        app = {k: (fields.get(k) or "").strip() for k in ("api_key", "api_secret", "redirect_uri")}
        if any(app.values()):
            if not all(app.values()):
                raise ValueError("API key, API secret and redirect URL are all required")
            u = urllib.parse.urlsplit(app["redirect_uri"])
            if u.scheme not in ("http", "https") or not u.netloc:
                raise ValueError("The redirect URL must be a full http:// or https:// address")
            config.save(UPSTOX_API_KEY=app["api_key"], UPSTOX_API_SECRET=app["api_secret"],
                        UPSTOX_REDIRECT_URI=app["redirect_uri"])
        token = (fields.get("access_token") or "").strip()
        if token:
            self._accept_token(token)
        return self.status()

    def _accept_token(self, token: str):
        exp = _token_exp(token)
        if not exp:
            raise ValueError("That isn't an Upstox access token (expected a JWT)")
        if exp < time.time():
            raise ValueError("That token has already expired")
        try:
            r = requests.get(f"{V2}/user/profile", timeout=TIMEOUT,
                             headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        except requests.RequestException:
            raise LoginError("network", "Couldn't reach Upstox — check your internet connection")
        if not r.ok:
            raise ValueError("Upstox rejected this token")
        config.save(UPSTOX_ACCESS_TOKEN=token)
        self._verified = (token, time.time())

    def login_url(self) -> str:
        if not self.oauth_ready():
            raise LoginError("setup", "Add your Upstox API key, secret and redirect URL first")
        # state ties the callback to a login this server started (CSRF guard).
        # Any page can make the browser open this URL, so keep only a few
        # recent states instead of letting them pile up.
        now = time.time()
        live = sorted((t, s) for s, t in self._oauth_states.items() if now - t < 600)
        state = secrets.token_urlsafe(24)
        self._oauth_states = {s: t for t, s in live[-(MAX_PENDING_LOGINS - 1):]}
        self._oauth_states[state] = now
        q = urllib.parse.urlencode({
            "response_type": "code",
            "client_id": config.get("UPSTOX_API_KEY"),
            "redirect_uri": config.get("UPSTOX_REDIRECT_URI"),
            "state": state,
        })
        return f"{V2}/login/authorization/dialog?{q}"

    def finish_login(self, code: str, state: str):
        if not state or self._oauth_states.pop(state, None) is None:
            raise LoginError("state", "Login expired or didn't start here — try again")
        try:
            r = requests.post(
                f"{V2}/login/authorization/token", timeout=TIMEOUT,
                headers={"Accept": "application/json"},
                data={
                    "code": code,
                    "client_id": config.get("UPSTOX_API_KEY"),
                    "client_secret": config.get("UPSTOX_API_SECRET"),
                    "redirect_uri": config.get("UPSTOX_REDIRECT_URI"),
                    "grant_type": "authorization_code",
                },
            )
        except requests.RequestException:
            raise LoginError("network", "Couldn't reach Upstox")
        try:
            body = r.json() if r.ok else None
        except ValueError:  # not JSON
            body = None
        token = body.get("access_token") if isinstance(body, dict) else None
        if not isinstance(token, str):
            raise LoginError("refused", "Upstox refused the login code")
        try:
            self._accept_token(token)
        except LoginError:
            raise
        except ValueError as e:
            raise LoginError("refused", str(e))

    # ── market data ──────────────────────────────────────────────
    def nearest_expiry(self, index_id):
        contracts = self._get(f"{V2}/option/contract", {"instrument_key": INDICES[index_id][0]})
        today = date.today().isoformat()
        live = sorted((c for c in contracts if c["expiry"] >= today), key=lambda c: c["expiry"])
        if not live:
            raise RuntimeError(f"no live {index_id} contracts")
        return live[0]["expiry"], int(live[0]["lot_size"])  # lot is authoritative — never hardcode

    def chain(self, index_id, expiry):
        rows = self._get(f"{V2}/option/chain",
                         {"instrument_key": INDICES[index_id][0], "expiry_date": expiry})
        rows.sort(key=lambda r: r["strike_price"])
        out = Chain(spot=rows[0]["underlying_spot_price"] if rows else 0.0)
        for r in rows:
            out.rows.append(ChainRow(r["strike_price"], _leg(r["call_options"]), _leg(r["put_options"])))
        return out

    def prev_close(self, index_id):
        """Last completed daily candle — the websocket's own cp field is unreliable."""
        today = date.today()
        for c in self._historical(INDICES[index_id][0], "days", 1, today, today - timedelta(days=10)):
            if not c[0].startswith(today.isoformat()):  # newest first; skip today's partial
                return c[4]
        return 0.0

    def _historical(self, key, unit, n, to: date, frm: date):
        k = urllib.parse.quote(key, safe="")
        return self._get(f"{V3}/historical-candle/{k}/{unit}/{n}/{to.isoformat()}/{frm.isoformat()}")["candles"]

    def candles(self, key, interval):
        minutes = INTERVALS[interval]
        today = date.today()
        if minutes == 1440:
            raw = self._historical(key, "days", 1, today, today - timedelta(days=180))
        else:
            k = urllib.parse.quote(key, safe="")
            raw = self._get(f"{V3}/historical-candle/intraday/{k}/minutes/{minutes}")["candles"]
            if not raw:  # pre-market: pad with the last few sessions
                raw = self._historical(key, "minutes", minutes, today, today - timedelta(days=5))
        # [[iso_ts, o, h, l, c, vol, oi], ...] newest first
        out = [{
            "time": int(datetime.fromisoformat(c[0]).timestamp()),
            "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5],
            "oi": c[6] if len(c) > 6 else 0,
        } for c in raw]
        out.sort(key=lambda c: c["time"])
        return out

    # ── websocket ────────────────────────────────────────────────
    def stream(self, keys, on_tick, stop):
        url = self._get(f"{V3}/feed/market-data-feed/authorize")["authorized_redirect_uri"]
        failure: list[str] = []

        def on_open(ws):
            sub = {"guid": str(uuid.uuid4()), "method": "sub",
                   "data": {"mode": "full", "instrumentKeys": keys}}
            ws.send(json.dumps(sub).encode("utf-8"), opcode=ABNF.OPCODE_BINARY)

        def on_message(ws, message):
            if isinstance(message, (bytes, bytearray)):
                on_tick(_decode(message))

        def on_error(ws, error):
            failure.append(str(error))

        ws = websocket.WebSocketApp(url, on_open=on_open, on_message=on_message, on_error=on_error)
        done = threading.Event()

        def watch():
            while not done.is_set():
                if stop.wait(0.5):
                    ws.close()
                    return

        threading.Thread(target=watch, daemon=True).start()
        try:
            ws.run_forever(sslopt={"ca_certs": certifi.where()}, ping_interval=20, ping_timeout=10)
        finally:
            done.set()
        if not stop.is_set():
            raise RuntimeError(failure[-1] if failure else "Upstox feed closed")


def _leg(opt: dict) -> Leg:
    md, gk = opt["market_data"], opt["option_greeks"]
    return Leg(
        key=opt["instrument_key"], ltp=md["ltp"], bid=md["bid_price"], ask=md["ask_price"],
        oi=md["oi"], change_oi=md["oi"] - md["prev_oi"], iv=gk["iv"], delta=gk["delta"],
        volume=md["volume"], close=md["close_price"],
    )


# ── protobuf decode ──────────────────────────────────────────────────
# OI, volume and IV are deliberately not emitted: over the socket they're
# unreliable (zeroed between ticks), so the relay owns them via REST.
def _greeks(g):
    return {"delta": g.delta}


def _quote(q):
    return {"bid": q.bp, "ask": q.ap}


def _decode(raw: bytes) -> dict:
    resp = FeedResponse()
    resp.ParseFromString(raw)
    out = {}
    for key, feed in resp.feeds.items():
        kind = feed.WhichOneof("FeedUnion")
        if kind == "ltpc":
            out[key] = {"ltp": feed.ltpc.ltp, "close": feed.ltpc.cp}
        elif kind == "oc":
            oc = feed.oc
            d = {"ltp": oc.ltpc.ltp, "close": oc.ltpc.cp}
            d.update(_greeks(oc.optionGreeks))
            d.update(_quote(oc.bidAskQuote))
            out[key] = d
        elif kind == "ff":
            if feed.ff.WhichOneof("FullFeedUnion") == "marketFF":
                m = feed.ff.marketFF
                d = {"ltp": m.ltpc.ltp, "close": m.ltpc.cp}
                d.update(_greeks(m.optionGreeks))
                if m.marketLevel.bidAskQuote:
                    d.update(_quote(m.marketLevel.bidAskQuote[0]))
                out[key] = d
            else:
                idx = feed.ff.indexFF
                out[key] = {"ltp": idx.ltpc.ltp, "close": idx.ltpc.cp}
    return out
