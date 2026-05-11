from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .database import init_db
from .routers import (
    analytics,
    announcements,
    assignments,
    auth,
    calendar,
    chat,
    courses,
    forum,
    health,
    materials,
    notifications,
    quizzes,
    study_buddy,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("paragon")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    log.info("Database initialized — %s", settings.database_url.split("://")[0])
    log.info("LLM provider: %s, embeddings: %s", settings.active_llm_provider, settings.embedding_provider)
    yield


app = FastAPI(
    title="Paragon API",
    version="0.1.0",
    description="RAG-powered classrooms with dedicated per-course AI assistants.",
    lifespan=lifespan,
)

# ─────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────
# Allow either a comma-separated list of origins, or the configured single origin.
_allowed_origins = [
    o.strip()
    for o in (settings.app_frontend_origin.split(",") if settings.app_frontend_origin else [])
    if o.strip()
] or ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────
# Error handlers — consistent JSON shape
# ─────────────────────────────────────────────────────
@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "message": exc.detail}},
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
            }
        },
    )


# ─────────────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(courses.router, prefix="/courses", tags=["courses"])
app.include_router(materials.router, tags=["materials"])
app.include_router(chat.router, tags=["chat"])
app.include_router(quizzes.router, tags=["quizzes"])
app.include_router(assignments.router, tags=["assignments"])
app.include_router(forum.router, tags=["forum"])
app.include_router(calendar.router, tags=["calendar"])
app.include_router(announcements.router, tags=["announcements"])
app.include_router(notifications.router, tags=["notifications"])
app.include_router(study_buddy.router, tags=["study-buddy"])
app.include_router(analytics.router, tags=["analytics"])


@app.get("/")
async def root() -> dict:
    return {"name": "Paragon API", "docs": "/docs", "health": "/health"}
