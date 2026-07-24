"""End-to-end tests against the live backend on :8000.

These skip if the backend isn't running. They exercise the real DB and real
Google-dev sign-in path, proving the brutal auth bug fix is loaded and
Google sign-in works from outside the FastAPI process.
"""
from __future__ import annotations

import asyncio
import time

import httpx
import pytest


async def _login(client: httpx.AsyncClient, email: str, password: str = "paragon-demo-1234"):
    """POST /auth/login with a brief retry when slowapi's per-minute counter
    is fresh from a sibling test in the same suite."""
    last = None
    for _ in range(5):
        r = await client.post("/auth/login", json={"email": email, "password": password})
        if r.status_code != 429:
            return r
        last = r
        await asyncio.sleep(1.2)
    assert last is not None
    return last


@pytest.mark.asyncio
async def test_health_endpoint(live_client: httpx.AsyncClient):
    r = await live_client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


@pytest.mark.asyncio
async def test_password_login_with_seeded_teacher(live_client: httpx.AsyncClient):
    """This test is the regression gate for the brutal auth bug fix.

    Before the fix, this returned 403 (Email not verified).
    After: 200 with bearer token.
    """
    r = await _login(live_client, "prof.rivera@paragon.edu")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20


@pytest.mark.asyncio
async def test_me_endpoint_with_bearer(live_client: httpx.AsyncClient):
    login = await _login(live_client, "prof.rivera@paragon.edu")
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    r = await live_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["email"] == "prof.rivera@paragon.edu"
    assert r.json()["role"] == "teacher"


@pytest.mark.asyncio
async def test_google_dev_signin_returns_tokens(live_client: httpx.AsyncClient):
    # Unique email each run so repeated executions don't 409.
    email = f"system-test-{int(time.time())}@paragon.edu"
    r = await live_client.post(
        "/auth/google/dev",
        json={"email": email, "name": "System Test"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert "access_token" in body


@pytest.mark.asyncio
async def test_google_login_descriptor(live_client: httpx.AsyncClient):
    r = await live_client.get("/auth/google/login")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] in {"redirect", "dev"}
