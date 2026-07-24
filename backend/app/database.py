from __future__ import annotations

from collections.abc import AsyncIterator
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


def _normalize_async_db_url(url: str) -> str:
    """Make a Postgres URL safe for the async engine no matter how it was pasted.

    Neon/Render hand you a plain ``postgresql://...?sslmode=require&channel_binding=...``
    string. SQLAlchemy would then pick the *sync* psycopg2 driver (not installed),
    and asyncpg doesn't understand those libpq query params. So: force the
    ``+asyncpg`` driver and strip the query string (SSL is set via connect_args).
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgresql+asyncpg://"):
        parts = urlsplit(url)
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    return url


DB_URL = _normalize_async_db_url(settings.database_url)

engine_kwargs: dict = {"echo": False, "future": True}
if settings.is_sqlite:
    # aiosqlite: single connection by default is fine for local dev.
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Free Postgres (Neon) requires TLS and allows few connections that it drops
    # when idle. asyncpg needs SSL set explicitly ("require" = encrypt, don't
    # fuss over cert hostname). Keep the pool small + pre-ping so a connection
    # dropped during auto-suspend is transparently replaced.
    engine_kwargs["connect_args"] = {"ssl": "require"}
    engine_kwargs.update(
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle_s,
    )

engine = create_async_engine(DB_URL, **engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables. Used for dev; production should use Alembic."""
    # Import models so they are registered on Base.metadata.
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent forward-migration for EXISTING databases that pre-date newer
        # columns. create_all only creates missing tables — it never adds columns
        # to a table that already exists — so without this a Neon DB from an
        # earlier deploy would be missing (e.g.) users.firebase_uid and 500.
        if settings.is_sqlite:
            await conn.run_sync(_apply_dev_migrations)
        else:
            await conn.run_sync(_apply_pg_migrations)


def _apply_pg_migrations(sync_conn) -> None:
    """Idempotent ADD COLUMN IF NOT EXISTS for Postgres (Neon). Runs on every boot;
    a no-op once the columns exist. Mirrors _apply_dev_migrations for prod."""
    from sqlalchemy import text

    stmts = [
        # users
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false NOT NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(128)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_firebase_uid ON users (firebase_uid)",
        # quizzes
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS exam_code VARCHAR(8)",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS exam_mode BOOLEAN DEFAULT false NOT NULL",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS proctoring_enabled BOOLEAN DEFAULT false NOT NULL",
        # questions
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS accepts_attachment BOOLEAN DEFAULT false NOT NULL",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_path VARCHAR(512)",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_mime VARCHAR(100)",
        # attempts
        "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS released BOOLEAN DEFAULT false NOT NULL",
        "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS teacher_feedback TEXT DEFAULT '' NOT NULL",
        "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS violations JSON DEFAULT '[]'::json NOT NULL",
        "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64)",
        "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS late BOOLEAN DEFAULT false NOT NULL",
        "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS grading_model VARCHAR(80) DEFAULT '' NOT NULL",
        "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS rubric_version VARCHAR(20) DEFAULT '' NOT NULL",
    ]
    for s in stmts:
        try:
            sync_conn.execute(text(s))
        except Exception as e:  # table may not exist yet, or race — safe to skip
            import logging

            logging.getLogger("paragon").warning("pg migration skipped (%s): %s", e, s)


def _apply_dev_migrations(sync_conn) -> None:
    from sqlalchemy import text

    def cols(table: str) -> set[str]:
        rows = sync_conn.execute(text(f"PRAGMA table_info({table})")).all()
        return {r[1] for r in rows}

    def add(table: str, ddl: str) -> None:
        try:
            sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
        except Exception:
            pass

    if "quizzes" in {r[0] for r in sync_conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).all()}:
        c = cols("quizzes")
        if "exam_code" not in c:
            add("quizzes", "exam_code VARCHAR(8)")
        if "exam_mode" not in c:
            add("quizzes", "exam_mode BOOLEAN DEFAULT 0 NOT NULL")
        if "proctoring_enabled" not in c:
            add("quizzes", "proctoring_enabled BOOLEAN DEFAULT 0 NOT NULL")
        c = cols("questions")
        if "accepts_attachment" not in c:
            add("questions", "accepts_attachment BOOLEAN DEFAULT 0 NOT NULL")
        if "image_path" not in c:
            add("questions", "image_path VARCHAR(512)")
        if "image_mime" not in c:
            add("questions", "image_mime VARCHAR(100)")
        c = cols("attempts")
        if "released" not in c:
            add("attempts", "released BOOLEAN DEFAULT 0 NOT NULL")
        if "teacher_feedback" not in c:
            add("attempts", "teacher_feedback TEXT DEFAULT '' NOT NULL")
        if "violations" not in c:
            add("attempts", "violations JSON DEFAULT '[]' NOT NULL")
        if "idempotency_key" not in c:
            add("attempts", "idempotency_key VARCHAR(64)")
        if "late" not in c:
            add("attempts", "late BOOLEAN DEFAULT 0 NOT NULL")
        if "grading_model" not in c:
            add("attempts", "grading_model VARCHAR(80) DEFAULT '' NOT NULL")
        if "rubric_version" not in c:
            add("attempts", "rubric_version VARCHAR(20) DEFAULT '' NOT NULL")

    if "users" in {r[0] for r in sync_conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).all()}:
        c = cols("users")
        if "email_verified" not in c:
            add("users", "email_verified BOOLEAN DEFAULT 0 NOT NULL")
        if "password_reset_token_hash" not in c:
            add("users", "password_reset_token_hash VARCHAR(128)")
        if "password_reset_expires_at" not in c:
            add("users", "password_reset_expires_at DATETIME")
        if "google_sub" not in c:
            add("users", "google_sub VARCHAR(255)")
        if "firebase_uid" not in c:
            add("users", "firebase_uid VARCHAR(128)")
