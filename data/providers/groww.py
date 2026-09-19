"""Groww provider: the official `growwapi` SDK (REST + NATS live feed).

Credentials (the user's own, from https://groww.in/trade-api → API keys):
  GROWW_AUTH=totp      GROWW_API_KEY (the TOTP token) + GROWW_TOTP_SECRET
                       → a fresh access token is minted whenever needed, no daily login
  GROWW_AUTH=approval  GROWW_API_KEY + GROWW_API_SECRET
                       → approve the key once a day on Groww, then Reconnect
  GROWW_AUTH=token     GROWW_ACCESS_TOKEN pasted by hand (daily)

Live data (quotes, option chain, feed, candles) needs a paid Groww Trade API
plan; without it every market-data call returns 403.

Option chains carry LTP, OI, volume, IV and delta but no bid/ask and no previous
OI. Bid/ask come from the market-depth feed; previous OI and previous close come
from one quote per contract, fetched once a day in the background at a rate that
stays well under Groww's live-data limit (10 req/s).
"""
from __future__ import annotations

import base64
import csv
import io
import json
import queue
import threading
import time
from datetime import date, datetime, timedelta

import requests

import config

from .base import INDEX_BY_KEY, INDICES, INTERVALS, Chain, ChainRow, Leg, NotConnected, Provider

INSTRUMENTS_URL = "https://growwapi-assets.groww.in/instruments/instrument.csv"
UNDERLYINGS = {v[3] for v in INDICES.values()}
QUOTE_RATE = 4  # background quote calls per second

CANDLE = {1: "1minute", 5: "5minute", 15: "15minute", 1440: "1day"}


def _jwt_exp(token: str):
    try:
        p = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))).get("exp")
    except Exception:
        return None


class Groww(Provider):
    name = "groww"
    label = "Groww"

    def __init__(self):
        self._lock = threading.RLock()
        self._client = None
        self._client_token = ""
        self._inst: dict | None = None
        self._inst_at = 0.0
        # daily reference values: key -> {"prev_oi", "close"}; reset each session
        self._ref: dict[str, dict] = {}
        self._ref_day = ""
        self._ref_q: queue.Queue = queue.Queue()
        self._ref_pending: set[str] = set()
        self._ref_thread: threading.Thread | None = None

    # ── credentials ──────────────────────────────────────────────
    def _mint(self) -> str:
        """Exchange the user's API key for an access token (TOTP or daily approval)."""
        from growwapi import GrowwAPI

        mode, key = config.get("GROWW_AUTH"), config.get("GROWW_API_KEY")
        if mode == "totp" and key and config.get("GROWW_TOTP_SECRET"):
            import pyotp
            token = GrowwAPI.get_access_token(api_key=key, totp=pyotp.TOTP(config.get("GROWW_TOTP_SECRET")).now())
        elif mode == "approval" and key and config.get("GROWW_API_SECRET"):
            token = GrowwAPI.get_access_token(api_key=key, secret=config.get("GROWW_API_SECRET"))
        else:
            raise NotConnected("Groww access token missing or expired")
        config.save(GROWW_ACCESS_TOKEN=token)
        return token

    def _groww(self):
        from growwapi import GrowwAPI

        with self._lock:
            token = config.get("GROWW_ACCESS_TOKEN")
            exp = _jwt_exp(token) if token else None
            if not token or (exp and exp < time.time() + 60):
                token = self._mint()
            if self._client is None or token != self._client_token:
                self._client, self._client_token = GrowwAPI(token), token
            return self._client

    def _call(self, fn, *args, **kw):
        """SDK call with one re-mint on an auth failure (tokens reset daily ~06:00 IST)."""
        from growwapi.groww.exceptions import (
            GrowwAPIAuthenticationException, GrowwAPIAuthorisationException)

        for attempt in (0, 1):
            try:
                return getattr(self._groww(), fn)(*args, **kw)
            except GrowwAPIAuthenticationException:
                if attempt or config.get("GROWW_AUTH") == "token":
                    raise NotConnected("Groww rejected the access token")
                with self._lock:
                    config.save(GROWW_ACCESS_TOKEN=None)
            except GrowwAPIAuthorisationException:
                raise NotConnected("Groww refused market data — does your Trade API plan include live data?")

    def status(self) -> dict:
        mode = config.get("GROWW_AUTH")
        out = {"connected": False, "expires_at": _jwt_exp(config.get("GROWW_ACCESS_TOKEN")),
               "mode": mode or None, "detail": ""}
        try:
            self._call("get_user_profile")
            out["connected"] = True
            out["expires_at"] = _jwt_exp(config.get("GROWW_ACCESS_TOKEN"))
        except NotConnected as e:
            out["detail"] = str(e)
        except Exception as e:
            out["detail"] = f"Groww: {e}" if mode != "approval" else \
                "Approve today's key on Groww (API keys page), then Reconnect"
        return out

    def connect(self, fields: dict) -> dict:
        mode = (fields.get("mode") or "").strip()
        f = {k: (fields.get(k) or "").strip() for k in ("api_key", "api_secret", "totp_secret", "access_token")}
        if mode == "totp":
            if not (f["api_key"] and f["totp_secret"]):
                raise ValueError("TOTP token and TOTP secret are both required")
            new = dict(GROWW_AUTH="totp", GROWW_API_KEY=f["api_key"], GROWW_TOTP_SECRET=f["totp_secret"],
                       GROWW_API_SECRET=None, GROWW_ACCESS_TOKEN=None)
        elif mode == "approval":
            if not (f["api_key"] and f["api_secret"]):
                raise ValueError("API key and API secret are both required")
            new = dict(GROWW_AUTH="approval", GROWW_API_KEY=f["api_key"], GROWW_API_SECRET=f["api_secret"],
                       GROWW_TOTP_SECRET=None, GROWW_ACCESS_TOKEN=None)
        elif mode == "token":
            if not f["access_token"]:
                raise ValueError("Paste an access token")
            new = dict(GROWW_AUTH="token", GROWW_ACCESS_TOKEN=f["access_token"])
        elif mode == "reconnect":
            new = dict(GROWW_ACCESS_TOKEN=None) if config.get("GROWW_AUTH") != "token" else {}
        else:
            raise ValueError("Pick how to connect: totp, approval or token")

        # try the credentials before they overwrite a working setup
        previous = {k: config.get(k) or None for k in new}
        config.save(**new)
        with self._lock:
            self._client = None
        try:
            self._call("get_user_profile")
        except Exception as e:
            config.save(**previous)
            msg = str(e) or e.__class__.__name__
            raise ValueError(f"Groww didn't accept these credentials: {msg}")
        return self.status()

    # ── instrument master (public CSV, no auth) ──────────────────
    def _instruments(self) -> dict:
        with self._lock:
            if self._inst is None or time.time() - self._inst_at > 6 * 3600:
                r = requests.get(INSTRUMENTS_URL, timeout=60)
                r.raise_for_status()
                by_token, by_symbol, options = {}, {}, {}
                for row in csv.DictReader(io.StringIO(r.text)):
                    if row["instrument_type"] in ("CE", "PE") and row["underlying_symbol"] in UNDERLYINGS \
                            and row["segment"] == "FNO":
                        key = f"{row['exchange']}_FO|{row['exchange_token']}"
                        by_token[key] = row
                        by_symbol[(row["exchange"], row["trading_symbol"])] = key
                        options.setdefault((row["exchange"], row["underlying_symbol"]), []).append(row)
                self._inst, self._inst_at = {"by_token": by_token, "by_symbol": by_symbol,
                                             "options": options}, time.time()
            return self._inst

    def _index(self, index_id):
        """(exchange, exchange_token, groww_symbol, trading_symbol) for an index."""
        _, _, exch, sym = INDICES[index_id]
        token = "1" if sym == "SENSEX" else sym  # from the instrument master; SENSEX is token 1
        return exch, token, f"{exch}-{sym}", sym

    # ── market data ──────────────────────────────────────────────
    def nearest_expiry(self, index_id):
        _, _, exch, sym = INDICES[index_id]
        today = date.today().isoformat()
        rows = [r for r in self._instruments()["options"].get((exch, sym), []) if r["expiry_date"] >= today]
        if not rows:
            raise RuntimeError(f"no live {index_id} contracts")
        expiry = min(r["expiry_date"] for r in rows)
        lot = next(int(float(r["lot_size"])) for r in rows if r["expiry_date"] == expiry)
        return expiry, lot

    def chain(self, index_id, expiry):
        _, _, exch, sym = INDICES[index_id]
        raw = self._call("get_option_chain", exchange=exch, underlying=sym, expiry_date=expiry)
        by_symbol = self._instruments()["by_symbol"]
        self._roll_day()
        out = Chain(spot=float(raw.get("underlying_ltp") or 0))
        for strike, sides in sorted((raw.get("strikes") or {}).items(), key=lambda kv: float(kv[0])):
            legs = []
            for side in ("CE", "PE"):
                d = sides.get(side) or {}
                key = by_symbol.get((exch, d.get("trading_symbol", "")))
                if not key:
                    break
                legs.append(self._leg(key, d))
            if len(legs) == 2:
                out.rows.append(ChainRow(float(strike), legs[0], legs[1]))
        return out

    def _leg(self, key: str, d: dict) -> Leg:
        g = d.get("greeks") or {}
        oi = float(d.get("open_interest") or 0)
        ref = self._ref.get(key)
        if ref is None:
            self._want_ref(key)
        return Leg(
            key=key, ltp=float(d.get("ltp") or 0), oi=oi,
            change_oi=oi - ref["prev_oi"] if ref and ref.get("prev_oi") is not None else 0.0,
            iv=float(g.get("iv") or 0), delta=float(g.get("delta") or 0),
            volume=float(d.get("volume") or 0), close=(ref or {}).get("close") or 0.0,
        )

    def prev_close(self, index_id):
        exch, _, _, sym = self._index(index_id)
        q = self._call("get_quote", trading_symbol=sym, exchange=exch, segment="CASH")
        return _prev_close(q)

    # previous-day OI / close: one quote per contract, once per day, throttled
    def _roll_day(self):
        today = date.today().isoformat()
        if self._ref_day != today:
            self._ref, self._ref_day, self._ref_pending = {}, today, set()

    def _want_ref(self, key):
        if key in self._ref_pending:
            return
        self._ref_pending.add(key)
        self._ref_q.put(key)
        if self._ref_thread is None or not self._ref_thread.is_alive():
            self._ref_thread = threading.Thread(target=self._fill_refs, daemon=True)
            self._ref_thread.start()

    def _fill_refs(self):
        while True:
            try:
                key = self._ref_q.get(timeout=30)
            except queue.Empty:
                return
            row = self._instruments()["by_token"].get(key)
            if row:
                try:
                    q = self._call("get_quote", trading_symbol=row["trading_symbol"],
                                   exchange=row["exchange"], segment="FNO")
                    prev = q.get("previous_open_interest")
                    self._ref[key] = {"prev_oi": float(prev) if prev is not None else None,
                                      "close": _prev_close(q)}
                except Exception:
                    self._ref_pending.discard(key)  # retried the next time the chain lists it
            time.sleep(1 / QUOTE_RATE)

    def _resolve(self, key: str):
        """Canonical key -> (exchange, segment, groww_symbol, trading_symbol, exchange_token)."""
        if key in INDEX_BY_KEY:
            exch, token, gsym, tsym = self._index(INDEX_BY_KEY[key])
            return exch, "CASH", gsym, tsym, token
        row = self._instruments()["by_token"].get(key)
        if not row:
            raise ValueError(f"unknown instrument {key}")
        return row["exchange"], "FNO", row["groww_symbol"], row["trading_symbol"], row["exchange_token"]

    def candles(self, key, interval):
        exch, seg, gsym, tsym, _ = self._resolve(key)
        minutes = INTERVALS[interval]
        now = datetime.now()
        if minutes == 1440:
            windows = [now - timedelta(days=180)]
        else:  # today, or the last few sessions before the open
            windows = [now.replace(hour=9, minute=0, second=0, microsecond=0), now - timedelta(days=5)]
        for start in windows:
            raw = self._fetch_candles(exch, seg, gsym, tsym, minutes, start, now)
            if raw:
                return raw
        return []

    def _fetch_candles(self, exch, seg, gsym, tsym, minutes, start, end):
        fmt = "%Y-%m-%d %H:%M:%S"
        try:
            raw = self._call("get_historical_candles", exchange=exch, segment=seg, groww_symbol=gsym,
                             start_time=start.strftime(fmt), end_time=end.strftime(fmt),
                             candle_interval=CANDLE[minutes])
        except NotConnected:
            raise
        except Exception:  # older accounts/SDKs: the v1 endpoint
            raw = self._call("get_historical_candle_data", trading_symbol=tsym, exchange=exch, segment=seg,
                             start_time=start.strftime(fmt), end_time=end.strftime(fmt),
                             interval_in_minutes=minutes)
        out = []
        for c in (raw or {}).get("candles") or []:
            t = _epoch(c[0])
            if t is None:
                continue
            out.append({"time": t, "open": c[1], "high": c[2], "low": c[3], "close": c[4],
                        "volume": c[5] if len(c) > 5 and c[5] is not None else 0,
                        "oi": c[6] if len(c) > 6 and c[6] is not None else 0})
        out.sort(key=lambda c: c["time"])
        return out

    # ── live feed ────────────────────────────────────────────────
    def stream(self, keys, on_tick, stop):
        from growwapi import GrowwFeed

        feed = GrowwFeed(self._groww())
        back, idx, opts = {}, [], []  # back: (exchange, segment, token) -> our key
        for key in keys:
            exch, seg, _, _, token = self._resolve(key)
            (idx if seg == "CASH" else opts).append({"exchange": exch, "segment": seg, "exchange_token": token})
            back[(exch, seg, str(token))] = key

        if idx:
            feed.subscribe_index_value(idx)
        if opts:
            feed.subscribe_ltp(opts)
            feed.subscribe_market_depth(opts)
        seen: dict[tuple, float] = {}
        try:
            while not stop.wait(0.4):
                tick: dict[str, dict] = {}
                for kind, getter in (("index", feed.get_index_value), ("ltp", feed.get_ltp),
                                     ("depth", feed.get_market_depth)):
                    for (exch, seg, token), d in _walk(_safe(getter)):
                        key = back.get((exch, seg, token))
                        ts = d.get("tsInMillis") or 0
                        if not key or seen.get((kind, key)) == ts:
                            continue
                        seen[(kind, key)] = ts
                        tick.setdefault(key, {}).update(_fields(kind, d))
                if tick:
                    on_tick(tick)
        finally:
            for fn, lst in ((feed.unsubscribe_index_value, idx), (feed.unsubscribe_ltp, opts),
                            (feed.unsubscribe_market_depth, opts)):
                if lst:
                    _safe(lambda: fn(lst))


def _fields(kind: str, d: dict) -> dict:
    if kind == "index":
        return {"ltp": d["value"]} if d.get("value") else {}
    if kind == "ltp":
        return {"ltp": d["ltp"]} if d.get("ltp") else {}
    buy, sell = d.get("buyBook") or {}, d.get("sellBook") or {}
    best = lambda book: (book.get("1") or book.get(1) or {}).get("price")  # noqa: E731
    out = {}
    if best(buy):
        out["bid"] = best(buy)
    if best(sell):
        out["ask"] = best(sell)
    return out


def _walk(tree):
    """{exchange: {segment: {token: data}}} -> ((exchange, segment, token), data)."""
    for exch, segs in (tree or {}).items():
        for seg, items in (segs or {}).items():
            for token, data in (items or {}).items():
                if data:
                    yield (exch, seg, str(token)), data


def _prev_close(q: dict) -> float:
    last, chg = q.get("last_price"), q.get("day_change")
    if last is not None and chg is not None:
        return float(last) - float(chg)
    return float((q.get("ohlc") or {}).get("close") or 0)


def _epoch(t):
    if isinstance(t, (int, float)):
        return int(t / 1000) if t > 1e11 else int(t)
    try:
        return int(datetime.fromisoformat(str(t)).timestamp())
    except ValueError:
        return None


def _safe(fn):
    try:
        return fn()
    except Exception:
        return {}
