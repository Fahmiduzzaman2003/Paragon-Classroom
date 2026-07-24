"""Shared pytest fixtures.

Provides an isolated SQLite-backed app instance per test so unit + integration
tests don't touch the dev database. System tests get their own fixtures that
talk to a live backend (see tests/system/conftest.py).
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Ensure the app is importable whether tests are run from backend/ or repo root.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in os.sys.path:
    os.sys.path.insert(0, str(BACKEND_DIR))


# Note: pytest-asyncio is configured via pytest.ini (`asyncio_default_fixture_loop_scope = function`),
# so we use the built-in function-scoped event loop and don't override it here.


# ─────────────────────────────────────────────────────
# Isolated app instance
# ─────────────────────────────────────────────────────


@pytest.fixture()
def temp_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Any]:
    """Patch the global Settings to point at a fresh in-memory SQLite DB.

    Using a per-test unique named in-memory DB sidesteps two Windows
    headaches: (a) file locks surviving past test teardown, and
    (b) pytest's ``tmp_path`` cleanup racing with aiosqlite's open
    connections. Each test gets a private DB that vanishes the moment
    the engine is disposed.
    """
    import uuid as _uuid

    # Each test gets a unique named in-memory DB. SQLite honours the
    # "name" of an in-memory DB per connection, so we use a unique
    # private cache name per test. The empty :memory: URI alone would
    # be shared across all engines in the process, breaking isolation.
    db_name = f"file:memdb-{_uuid.uuid4().hex[:8]}?mode=memory&cache=private"
    uploads = tmp_path / "uploads"
    chroma = tmp_path / "chroma"
    uploads.mkdir(parents=True, exist_ok=True)
    chroma.mkdir(parents=True, exist_ok=True)

    # Stable JWT secret so test tokens survive across the same test
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("JWT_SECRET", "test-secret-do-not-use-in-prod-aaaaaaaaaaaaaaaaaaaa")
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_name}")
    monkeypatch.setenv("UPLOADS_DIR", str(uploads))
    monkeypatch.setenv("CHROMA_PATH", str(chroma))
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    monkeypatch.setenv("REQUIRE_EMAIL_VERIFICATION", "true")
    monkeypatch.setenv("GOOGLE_OAUTH_DEV_FALLBACK", "true")

    # Reload Settings from the patched env so .get_settings() picks them up.
    from app import config as config_module
    config_module.get_settings.cache_clear()  # type: ignore[attr-defined]
    settings = config_module.get_settings()
    return {
        "db_file": db_name,
        "uploads": str(uploads),
        "chroma": str(chroma),
        "settings": settings,
    }


@pytest_asyncio.fixture()
async def app(temp_env):
    """Yield the FastAPI app bound to a freshly-wiped in-memory DB.

    Rebuilds the module-level SQLAlchemy engine (which captured the dev
    DATABASE_URL at import time) so the integration tests never touch the
    dev SQLite DB that uvicorn is running against. The new engine uses
    ``StaticPool`` so the single in-memory connection is shared across
    all sessions in the same test (otherwise each session would see an
    empty database).
    """
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import StaticPool

    from app import database as db_module
    from app.main import app

    # Dispose the existing engine and point it at the temp DB.
    try:
        await db_module.engine.dispose()
    except Exception:
        pass
    settings = temp_env["settings"]
    db_module.engine = create_async_engine(
        str(settings.database_url),  # type: ignore[attr-defined]
        echo=False,
        future=True,
        connect_args={"check_same_thread": False, "uri": True},
        poolclass=StaticPool,
    )
    # Rebind the EXISTING SessionLocal in place (don't replace the object), so
    # modules that did `from ..database import SessionLocal` at import time
    # (google, ingestion, jobs, chat) use this per-test engine too. Replacing the
    # object would leave those captured references pointing at a stale engine.
    db_module.SessionLocal.configure(bind=db_module.engine)  # type: ignore[attr-defined]

    # Wipe + recreate schema on the new engine.
    from app.database import Base

    async with db_module.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield app

    try:
        await db_module.engine.dispose()
    except Exception:
        pass


@pytest_asyncio.fixture()
async def client(app) -> AsyncIterator[AsyncClient]:
    """An httpx AsyncClient wired to the FastAPI app via ASGI in-process."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Wipe the slowapi counters between tests so the per-IP per-minute
    budget doesn't leak across tests. Without this the first five logins
    of a run burn the allowance and every later login test 429s."""
    from app.services.limiter import limiter

    yield
    if hasattr(limiter, "_storage") and limiter._storage is not None:
        try:
            limiter._storage.reset()
        except Exception:
            pass


# ─────────────────────────────────────────────────────
# Reusable test data
# ─────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def make_user(temp_env):
    """Factory fixture: ``await make_user(email='...', role='teacher')``."""
    from sqlalchemy import select

    from app.models.user import Role, User
    from app.utils.security import hash_password

    created: dict[str, User] = {}

    async def _factory(
        email: str,
        *,
        name: str | None = None,
        role: str = "student",
        password: str = "paragon-demo-1234",
        email_verified: bool = True,
        institution: str | None = "Paragon University",
    ) -> User:
        key = email.lower()
        if key in created:
            return created[key]
        # Defer-lookup SessionLocal via the module so it honours the engine
        # rebuild in the `app` fixture rather than the original binding.
        from app import database as _db

        async with _db.SessionLocal() as db:
            existing = await db.scalar(select(User).where(User.email == key))
            if existing:
                created[key] = existing
                return existing
            u = User(
                email=key,
                password_hash=hash_password(password),
                name=name or key.split("@")[0].title(),
                role=role if role != "admin" else Role.STUDENT.value,
                institution=institution,
                email_verified=email_verified,
            )
            db.add(u)
            await db.commit()
            await db.refresh(u)
            created[key] = u
            return u

    yield _factory


@pytest_asyncio.fixture()
async def seeded_teacher(make_user) -> Any:
    return await make_user(
        email="prof.rivera@paragon.edu",
        name="Prof. Amelia Rivera",
        role="teacher",
        email_verified=True,
    )


@pytest_asyncio.fixture()
async def seeded_student(make_user) -> Any:
    return await make_user(
        email="fahmid@paragon.edu",
        name="Fahmid Uzzaman",
        role="student",
        email_verified=True,
    )


# ─────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────


async def login_as(client: AsyncClient, email: str, password: str = "paragon-demo-1234") -> str:
    """POST /auth/login and return the access token."""
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"login failed: {resp.status_code} {resp.text}"
    return resp.json()["access_token"]


async def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}