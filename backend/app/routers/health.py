from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Response
from sqlalchemy import text

from ..config import settings
from ..database import engine

router = APIRouter(tags=["health"])
log = logging.getLogger(__name__)


@router.get("/healthz")
async def healthz() -> dict:
    """Liveness — cheap, no dependencies. Render's health check hits this so a
    cold start flips healthy the instant the process is up, without waiting on
    the DB."""
    return {"status": "ok"}


# Back-compat alias.
@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "env": settings.app_env,
        "llm_provider": settings.active_llm_provider,
        "embedding_provider": settings.embedding_provider,
        # Diagnostics: what the server ACTUALLY sees, so config can be verified
        # without guessing.
        "require_email_verification": settings.require_email_verification,
        "smtp_configured": settings.smtp_configured,
        "email_verification_enforced": settings.email_verification_enforced,
        "frontend_base": settings.cors_origins_list[:2],
    }


@router.get("/readyz")
async def readyz(response: Response) -> dict:
    """Readiness — checks the dependencies a request actually needs. Returns 503
    if any is unreachable so a load balancer / uptime pinger sees the difference
    between 'alive' and 'able to serve'."""
    checks: dict[str, str] = {}
    ok = True

    # Database
    try:
        async with asyncio.timeout(5):
            async with engine.connect() as c:
                await c.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:  # noqa: BLE001
        checks["database"] = f"error: {type(e).__name__}"
        ok = False

    # Vector store (only meaningful in prod / pgvector; chroma is local disk)
    checks["vector_backend"] = settings.vector_backend
    # Storage backend (config presence, not a network round-trip — keep it cheap)
    checks["storage_backend"] = settings._effective_storage_backend

    if not ok:
        response.status_code = 503
    return {"status": "ok" if ok else "degraded", "checks": checks}
