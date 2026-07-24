"""Firebase auth path — with token verification mocked (no network / no real
Firebase project needed). Exercises the dual-mode get_current_user + /auth/sync."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


def _enable_firebase(monkeypatch, *, uid: str, email: str, verified: bool = True, name: str = "User"):
    from app.config import settings
    from app.services import firebase_auth

    monkeypatch.setattr(settings, "firebase_project_id", "demo-project")

    def fake_verify(_token: str):
        return firebase_auth.FirebaseIdentity(
            uid=uid, email=email, email_verified=verified, name=name, picture=None
        )

    monkeypatch.setattr(firebase_auth, "verify_id_token", fake_verify)


@pytest.mark.asyncio
async def test_sync_creates_user_with_chosen_role(client: AsyncClient, monkeypatch):
    _enable_firebase(monkeypatch, uid="fb-teacher-1", email="teach@paragon.edu", name="Teacher One")

    r = await client.post(
        "/auth/sync", json={"role": "teacher", "name": "Teacher One"},
        headers=await auth_headers("firebase-token"),
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "teacher"
    assert r.json()["email"] == "teach@paragon.edu"

    # A subsequent request auto-resolves the SAME user (role unchanged).
    me = await client.get("/auth/me", headers=await auth_headers("firebase-token"))
    assert me.status_code == 200
    assert me.json()["role"] == "teacher"


@pytest.mark.asyncio
async def test_get_current_user_autoprovisions_student(client: AsyncClient, monkeypatch):
    _enable_firebase(monkeypatch, uid="fb-student-1", email="stud@paragon.edu", verified=False)

    # No /auth/sync first — hitting a protected route provisions a default student.
    me = await client.get("/auth/me", headers=await auth_headers("firebase-token"))
    assert me.status_code == 200
    assert me.json()["role"] == "student"


@pytest.mark.asyncio
async def test_invalid_firebase_token_is_rejected(client: AsyncClient, monkeypatch):
    from app.config import settings
    from app.services import firebase_auth

    monkeypatch.setattr(settings, "firebase_project_id", "demo-project")

    def bad(_token: str):
        raise firebase_auth.FirebaseAuthError("bad signature")

    monkeypatch.setattr(firebase_auth, "verify_id_token", bad)

    # Firebase verify fails → falls through to legacy JWT → also invalid → 401.
    r = await client.get("/auth/me", headers=await auth_headers("garbage"))
    assert r.status_code == 401
