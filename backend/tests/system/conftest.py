"""Shared fixtures for system-level tests that hit the live backend on :8000."""
from __future__ import annotations

import os

import httpx
import pytest

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


def _backend_up() -> bool:
    try:
        with httpx.Client(timeout=2.0) as c:
            r = c.get(f"{BACKEND_URL}/health")
            return r.status_code == 200
    except Exception:
        return False


@pytest.fixture(scope="session")
def backend_url() -> str:
    if not _backend_up():
        pytest.skip(f"backend not reachable at {BACKEND_URL}")
    return BACKEND_URL


@pytest.fixture()
def live_client(backend_url: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=backend_url, timeout=10.0)
