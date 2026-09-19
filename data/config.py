"""Local settings store: the user's own broker keys live in a .env on their machine.

DATA_DIR (default: this folder) holds `.env` and `paper.db`, so Docker can mount
one volume and keep both. Nothing in here is ever returned to the browser —
/status reports only whether a broker is connected, never the secrets.
"""
from __future__ import annotations

import os
import re
import threading
from pathlib import Path

from dotenv import dotenv_values

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent)).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
ENV_FILE = DATA_DIR / ".env"
DB_FILE = DATA_DIR / "paper.db"

# Every key the app may persist. Anything else in .env is left alone.
KEYS = (
    "BROKER",
    "UPSTOX_API_KEY", "UPSTOX_API_SECRET", "UPSTOX_REDIRECT_URI", "UPSTOX_ACCESS_TOKEN",
    "GROWW_AUTH", "GROWW_API_KEY", "GROWW_API_SECRET", "GROWW_TOTP_SECRET", "GROWW_ACCESS_TOKEN",
)

MAX_VALUE = 8192
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_BARE = re.compile(r"[A-Za-z0-9_\-.:/+=@,~]*")  # written unquoted; anything else is quoted
# the relay thread (token refresh) and request threads both write .env
_lock = threading.RLock()


def _owner_only(path: Path):
    try:
        path.chmod(0o600)  # a no-op on Windows
    except OSError:
        pass


def _load():
    # process env wins (docker -e, shell exports); .env fills the gaps.
    # No ${VAR} interpolation: a secret must come back exactly as it was saved.
    if not ENV_FILE.exists():
        return
    _owner_only(ENV_FILE)  # tighten files written by older versions
    for k, v in dotenv_values(ENV_FILE, interpolate=False).items():
        if v is not None and k not in os.environ:
            os.environ[k] = v


_load()


def get(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def check_value(v: str) -> str:
    """Reject what could break out of a .env line (newlines, control characters)."""
    if len(v) > MAX_VALUE:
        raise ValueError("That value is too long")
    if _CONTROL.search(v):
        raise ValueError("Keys can't contain line breaks or control characters")
    return v


def _encode(v: str) -> str:
    if _BARE.fullmatch(v):
        return v
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'


def save(**values: str | None):
    """Update keys in .env (None deletes one), keeping every other line as-is."""
    for v in values.values():
        if v is not None:
            check_value(v)
    with _lock:
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
        pending = dict(values)
        out = []
        for line in lines:
            name = line.split("=", 1)[0].strip()
            if name in pending:
                v = pending.pop(name)
                if v is not None:
                    out.append(f"{name}={_encode(v)}")
                continue
            out.append(line)
        out += [f"{k}={_encode(v)}" for k, v in pending.items() if v is not None]

        # write a sibling file that is owner-only from the start, then swap it
        # in, so the keys are never world-readable and a crash can't leave a
        # half-written .env behind
        tmp = ENV_FILE.with_name(f".env.{os.getpid()}.{threading.get_ident()}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write("\n".join(out) + "\n")
            os.replace(tmp, ENV_FILE)
        finally:
            if tmp.exists():
                tmp.unlink()
        _owner_only(ENV_FILE)

        for k, v in values.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
