"""Local settings store: the user's own broker keys live in a .env on their machine.

DATA_DIR (default: this folder) holds `.env` and `paper.db`, so Docker can mount
one volume and keep both. Nothing in here is ever returned to the browser —
/status reports only whether a broker is connected, never the secrets.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent)).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
ENV_FILE = DATA_DIR / ".env"
DB_FILE = DATA_DIR / "paper.db"

# Every key the app may persist. Anything else in .env is left alone.
KEYS = (
    "BROKER",
    "UPSTOX_API_KEY", "UPSTOX_API_SECRET", "UPSTOX_REDIRECT_URI", "UPSTOX_ACCESS_TOKEN",
    "GROWW_AUTH", "GROWW_API_KEY", "GROWW_API_SECRET", "GROWW_TOTP_SECRET", "GROWW_ACCESS_TOKEN",
)


def _load():
    # process env wins (docker -e, shell exports); .env fills the gaps
    for k, v in dotenv_values(ENV_FILE).items() if ENV_FILE.exists() else ():
        if v is not None and k not in os.environ:
            os.environ[k] = v


_load()


def get(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def save(**values: str | None):
    """Update keys in .env (None deletes one), keeping every other line as-is."""
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    pending = dict(values)
    out = []
    for line in lines:
        name = line.split("=", 1)[0].strip()
        if name in pending:
            v = pending.pop(name)
            if v is not None:
                out.append(f"{name}={v}")
            continue
        out.append(line)
    out += [f"{k}={v}" for k, v in pending.items() if v is not None]
    ENV_FILE.write_text("\n".join(out) + "\n")
    try:
        ENV_FILE.chmod(0o600)  # owner-only; a no-op on Windows
    except OSError:
        pass
    for k, v in values.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
