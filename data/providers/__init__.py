"""Broker registry. BROKER in .env picks which one feeds the app.

Adding a broker: subclass providers.base.Provider in its own module and register
an instance here. The relay and server only ever call the Provider interface.
"""
from __future__ import annotations

import config

from .base import Provider
from .groww import Groww
from .upstox import Upstox

PROVIDERS: dict[str, Provider] = {p.name: p for p in (Upstox(), Groww())}


def active() -> Provider | None:
    return PROVIDERS.get(config.get("BROKER").lower())


def get(name: str) -> Provider:
    if name not in PROVIDERS:
        raise KeyError(name)
    return PROVIDERS[name]
