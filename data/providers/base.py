"""The one interface the relay and server talk to. Each broker adapts to it.

Instrument keys use the exchange-token convention `<EXCH>_FO|<token>` for
options and fixed `<EXCH>_INDEX|<name>` keys for the three indices. Upstox keys
already look like that and Groww exposes the same exchange tokens, so a paper
position opened on one broker still finds its quote after switching to the other.
The frontend relies on the `BSE` prefix to pick the exchange's charge schedule.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Callable

import config

# id -> (canonical key, display label, exchange, underlying symbol)
INDICES = {
    "NIFTY": ("NSE_INDEX|Nifty 50", "NIFTY 50", "NSE", "NIFTY"),
    "BANKNIFTY": ("NSE_INDEX|Nifty Bank", "BANK NIFTY", "NSE", "BANKNIFTY"),
    "SENSEX": ("BSE_INDEX|SENSEX", "SENSEX", "BSE", "SENSEX"),
}
INDEX_BY_KEY = {v[0]: k for k, v in INDICES.items()}

# UI interval -> minutes (1440 = daily)
INTERVALS = {"1m": 1, "5m": 5, "15m": 15, "1d": 1440}


class NotConnected(RuntimeError):
    """No usable credentials — the UI shows the connect screen, not an error."""


@dataclass
class Leg:
    key: str
    ltp: float = 0.0
    bid: float = 0.0
    ask: float = 0.0
    oi: float = 0.0
    change_oi: float = 0.0
    iv: float = 0.0
    delta: float = 0.0
    volume: float = 0.0
    close: float = 0.0  # previous session close, for the day's % change


@dataclass
class ChainRow:
    strike: float
    ce: Leg
    pe: Leg


@dataclass
class Chain:
    spot: float
    rows: list[ChainRow] = field(default_factory=list)


Tick = dict[str, dict]  # key -> {ltp, close, bid, ask, delta, ...}


class Provider:
    """Subclass per broker. Every method may raise NotConnected."""

    name = ""
    label = ""

    # ── credentials ──────────────────────────────────────────────
    def configured(self) -> bool:
        """Any keys saved for this broker (no network call)."""
        prefix = self.name.upper() + "_"
        return any(config.get(k) for k in config.KEYS if k.startswith(prefix))

    def status(self) -> dict:
        """{"connected": bool, "expires_at": epoch|None, "detail": str} — no secrets."""
        raise NotImplementedError

    def connect(self, fields: dict) -> dict:
        """Validate the user's keys against the broker, persist on success."""
        raise NotImplementedError

    # ── market data ──────────────────────────────────────────────
    def nearest_expiry(self, index_id: str) -> tuple[str, int]:
        """(YYYY-MM-DD, lot size) of the nearest live expiry."""
        raise NotImplementedError

    def chain(self, index_id: str, expiry: str) -> Chain:
        raise NotImplementedError

    def prev_close(self, index_id: str) -> float:
        raise NotImplementedError

    def candles(self, key: str, interval: str) -> list[dict]:
        """Ascending [{time (unix s), open, high, low, close, volume, oi}]."""
        raise NotImplementedError

    def stream(self, keys: list[str], on_tick: Callable[[Tick], None], stop: threading.Event):
        """Block, pushing ticks, until `stop` is set or the connection fails (raise)."""
        raise NotImplementedError
