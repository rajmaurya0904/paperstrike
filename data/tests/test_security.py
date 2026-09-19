"""The data service's local-only guards and the .env writer. No network, no keys.

Run: python -m pytest tests   (from data/)
"""
from urllib.parse import parse_qs, urlsplit

import pytest
import requests
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import config
import server

APP = "http://localhost:3000"


@pytest.fixture
def client():
    with TestClient(server.app, base_url="http://localhost:8000") as c:
        yield c


def test_rejects_unknown_host(client):
    # DNS rebinding: a page on evil.example resolving to 127.0.0.1
    r = client.get("/status", headers={"host": "evil.example:8000"})
    assert r.status_code == 403


def test_writes_need_the_app_origin_and_json(client):
    body = {"broker": "upstox"}
    assert client.post("/disconnect", json=body, headers={"origin": "https://evil.example"}).status_code == 403
    r = client.post("/disconnect", content=b'{"broker":"upstox"}',
                    headers={"origin": APP, "content-type": "text/plain"})
    assert r.status_code == 415
    assert client.post("/disconnect", json=body, headers={"origin": APP}).status_code == 200


def test_oversized_writes_are_refused(client):
    r = client.put("/paper/demo", content=b"{}", headers={
        "origin": APP, "content-type": "application/json",
        "content-length": str(server.MAX_BODY + 1)})
    assert r.status_code == 413


def test_security_headers(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "no-store"


def test_websocket_checks_origin_and_host(client, monkeypatch):
    # the test client defaults to ws://testserver, so spell the host out
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("ws://localhost:8000/ws", headers={"origin": "https://evil.example"}):
            pass
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("ws://evil.example:8000/ws", headers={"origin": APP}):
            pass

    # the app itself gets through and receives snapshots
    from relay import relay
    monkeypatch.setattr(relay, "_started", True)  # no broker threads
    monkeypatch.setattr(relay, "snapshot", lambda: {"version": 1, "indices": {"NIFTY": {}}})
    with client.websocket_connect("ws://localhost:8000/ws", headers={"origin": APP}) as ws:
        assert ws.receive_json()["indices"] == {"NIFTY": {}}


def test_status_never_returns_secrets(client):
    config.save(UPSTOX_API_KEY="key-123", UPSTOX_API_SECRET="secret-456",
                UPSTOX_REDIRECT_URI="http://localhost:8000/auth/upstox/callback")
    try:
        text = client.get("/status").text
        assert "secret-456" not in text and "key-123" not in text
    finally:
        config.save(UPSTOX_API_KEY=None, UPSTOX_API_SECRET=None, UPSTOX_REDIRECT_URI=None)


def test_connect_rejects_env_injection(client):
    r = client.post("/connect", headers={"origin": APP}, json={
        "broker": "groww", "fields": {"mode": "token", "access_token": "abc\nBROKER=upstox"}})
    assert r.status_code == 400
    assert config.get("BROKER") == ""


def test_upstox_redirect_must_be_http(client):
    r = client.post("/connect", headers={"origin": APP}, json={
        "broker": "upstox",
        "fields": {"api_key": "k", "api_secret": "s", "redirect_uri": "javascript:alert(1)"}})
    assert r.status_code == 400


def test_oauth_errors_come_back_as_codes(client):
    r = client.get("/auth/upstox/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert r.headers["location"].endswith("/trade/settings?error=cancelled")
    r = client.get("/auth/upstox/callback", params={"code": "x", "state": "forged"}, follow_redirects=False)
    assert r.headers["location"].endswith("/trade/settings?error=state")
    r = client.get("/auth/upstox/login", follow_redirects=False)  # no app saved yet
    assert r.headers["location"].endswith("/trade/settings?error=setup")


def _offline(*args, **kwargs):
    raise requests.ConnectionError("offline")


def _refused(*args, **kwargs):
    class Reply:
        ok = False

        def json(self):
            return {"status": "error"}

    return Reply()


@pytest.mark.parametrize("post, code", [(_offline, "network"), (_refused, "refused")])
def test_oauth_exchange_failures_are_codes(client, monkeypatch, post, code):
    up = server.providers.get("upstox")
    config.save(UPSTOX_API_KEY="k", UPSTOX_API_SECRET="s",
                UPSTOX_REDIRECT_URI="http://localhost:8000/auth/upstox/callback")
    try:
        state = parse_qs(urlsplit(up.login_url()).query)["state"][0]
        monkeypatch.setattr(requests, "post", post)
        r = client.get("/auth/upstox/callback", params={"code": "x", "state": state}, follow_redirects=False)
        assert r.headers["location"].endswith(f"/trade/settings?error={code}")
    finally:
        config.save(UPSTOX_API_KEY=None, UPSTOX_API_SECRET=None, UPSTOX_REDIRECT_URI=None)


def test_oauth_states_are_bounded():
    up = server.providers.get("upstox")
    config.save(UPSTOX_API_KEY="k", UPSTOX_API_SECRET="s",
                UPSTOX_REDIRECT_URI="http://localhost:8000/auth/upstox/callback")
    try:
        for _ in range(50):
            up.login_url()
        assert len(up._oauth_states) <= 8
    finally:
        config.save(UPSTOX_API_KEY=None, UPSTOX_API_SECRET=None, UPSTOX_REDIRECT_URI=None)


def test_paper_store_round_trip_and_names(client):
    state = {"account": {"name": "Asha"}, "positions": [], "orders": [], "trades": []}
    assert client.put("/paper/Asha", json={"data": state}, headers={"origin": APP}).status_code == 200
    assert client.get("/paper/Asha").json() == state
    assert client.put("/paper/" + "x" * 65, json={"data": state}, headers={"origin": APP}).status_code == 400
    bad_meta = {"data": {"profiles": "Asha", "active": 1}}
    assert client.put("/paper/__meta__", json=bad_meta, headers={"origin": APP}).status_code == 400


def test_candles_validates_the_key(client):
    assert client.get("/candles", params={"key": "../../etc/passwd"}).status_code == 400


@pytest.mark.parametrize("value", [
    "plain-token_1.2", "a b c", "with#hash", 'quote"inside', "single'quote",
    r"back\slash\n", "${HOME}", "trailing=equals==", "ünïcode",
])
def test_env_values_round_trip(value):
    from dotenv import dotenv_values
    config.save(GROWW_API_SECRET=value)
    try:
        assert dotenv_values(config.ENV_FILE, interpolate=False)["GROWW_API_SECRET"] == value
    finally:
        config.save(GROWW_API_SECRET=None)


@pytest.mark.parametrize("value", ["line\nbreak", "carriage\rreturn", "nul\x00byte", "x" * 9000])
def test_env_rejects_unsafe_values(value):
    with pytest.raises(ValueError):
        config.save(GROWW_API_SECRET=value)
