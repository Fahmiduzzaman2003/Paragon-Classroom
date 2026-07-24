from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..dependencies import CurrentUser
from ..models.user import Role
from ..services.llm import health_snapshot

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/llm/health")
async def llm_health(current: CurrentUser) -> dict:
    """Per-provider circuit state, recent success rates, and daily quota usage.

    Admin-only — it reveals the provider chain and operational health.
    """
    if current.role != Role.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    return health_snapshot()
