from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .database import init_db
from .middleware import (
    BodySizeLimitMiddleware,
    RequestIDMiddleware,
    SecurityHeadersMiddleware,
    get_request_id,
)
from .routers import (
    admin,
    analytics,
    announcements,
    assignments,
    auth,
    calendar,
    chat,
    courses,
    forum,
    health,
    jobs,
    materials,
    notifications,
    quizzes,
    study_buddy,
)
from .services.jobs import drain as drain_jobs
from .services.jobs import recover_stuck_jobs
from .services.limiter import limiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("paragon")

# Optional error tracking — a no-op unless SENTRY_DSN is set (free tier, opt-in).
if settings.sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.0, environment=settings.app_env)
        log.info("Sentry error tracking enabled")
    except Exception as e:  # never let telemetry setup break boot
        log.warning("Sentry init failed: %s", e)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    log.info("Database initialized — %s", settings.database_url.split("://")[0])
    log.info("LLM provider: %s, embeddings: %s", settings.active_llm_provider, settings.embedding_provider)
    # Recover any ingestion jobs a previous crash/redeploy left mid-flight.
    try:
        await recover_stuck_jobs()
    except Exception:  # never let recovery block startup
        log.exception("Job recovery on boot failed")
    yield
    # Graceful shutdown (SIGTERM on Render): drain in-flight ingestion, close pool.
    try:
        await drain_jobs(timeout=15.0)
    except Exception:
        log.exception("Job drain on shutdown failed")
    try:
        from .database import engine

        await engine.dispose()
    except Exception:
        log.exception("Engine dispose on shutdown failed")


app = FastAPI(
    title="Paragon API",
    version="0.1.0",
    description="RAG-powered classrooms with dedicated per-course AI assistants.",
    lifespan=lifespan,
)

# ─────────────────────────────────────────────────────
# Rate limiter (in-memory; see services/limiter.py)
# ─────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ─────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────
# Explicit allowlist from CORS_ORIGINS (falls back to APP_FRONTEND_ORIGIN).
# In development a regex also allows any localhost/127.0.0.1 port so every
# Vite/preview port works without listing them. Preflight for Authorization +
# Content-Type is handled by allow_headers=["*"].
_allowed_origins = settings.cors_origins_list or ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
log.info("CORS allowlist: %s (regex=%s)", _allowed_origins, settings.cors_allow_origin_regex)

# Order matters: added last runs first. Request ID should wrap everything so its
# value is available to all downstream handlers and logs.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=(settings.max_upload_mb + 5) * 1024 * 1024)
app.add_middleware(RequestIDMiddleware)


# ─────────────────────────────────────────────────────
# Error handlers — consistent JSON shape
# ─────────────────────────────────────────────────────
@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "message": exc.detail, "request_id": get_request_id()}},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": 422,
                "message": "Validation failed",
                "details": exc.errors(),
                "request_id": get_request_id(),
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, exc: Exception):
    """Last-resort handler: consistent envelope + request id, never a raw
    traceback or provider error leaked to the client."""
    rid = get_request_id()
    log.exception("Unhandled exception rid=%s: %s", rid, exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": 500, "message": "Internal server error", "request_id": rid}},
    )


# ─────────────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(courses.router, prefix="/courses", tags=["courses"])
app.include_router(materials.router, tags=["materials"])
app.include_router(jobs.router, tags=["jobs"])
app.include_router(chat.router, tags=["chat"])
app.include_router(quizzes.router, tags=["quizzes"])
app.include_router(assignments.router, tags=["assignments"])
app.include_router(forum.router, tags=["forum"])
app.include_router(calendar.router, tags=["calendar"])
app.include_router(announcements.router, tags=["announcements"])
app.include_router(notifications.router, tags=["notifications"])
app.include_router(study_buddy.router, tags=["study-buddy"])
app.include_router(analytics.router, tags=["analytics"])
app.include_router(admin.router)


@app.get("/")
async def root() -> dict:
    return {"name": "Paragon API", "docs": "/docs", "health": "/health"}
