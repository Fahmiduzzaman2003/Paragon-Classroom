from __future__ import annotations

from fastapi import APIRouter

from ..config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "env": settings.app_env,
        "llm_provider": settings.active_llm_provider,
        "embedding_provider": settings.embedding_provider,
    }
