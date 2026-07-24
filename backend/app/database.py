from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


engine_kwargs: dict = {"echo": False, "future": True}
if settings.is_sqlite:
    # aiosqlite: single connection by default is fine for local dev.
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Free Postgres (Neon) allows few connections and drops idle ones. Keep the
    # pool small, pre-ping to avoid handing out dead connections after the DB
    # auto-suspends, and recycle before the server times them out.
    engine_kwargs.update(
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle_s,
    )

engine = create_async_engine(settings.database_url, **engine_kwargs)
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
        # Lightweight forward-migration for existing dev SQLite DBs that pre-date
        # the exam-mode columns. Alembic is the right tool in prod; here we just
        # make sure the dev DB gets the new columns idempotently.
        if settings.is_sqlite:
            await conn.run_sync(_apply_dev_migrations)


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
