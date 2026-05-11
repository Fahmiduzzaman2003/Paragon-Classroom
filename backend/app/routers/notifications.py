from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update

from ..dependencies import CurrentUser, Database
from ..models.notification import Notification
from ..schemas.notification import NotificationOut

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(
    current: CurrentUser, db: Database, unread_only: bool = False, limit: int = 50
) -> list[NotificationOut]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == current.id)
        .order_by(Notification.created_at.desc())
        .limit(min(max(limit, 1), 200))
    )
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    rows = (await db.execute(stmt)).scalars().all()
    return [NotificationOut.model_validate(n) for n in rows]


@router.get("/notifications/unread-count")
async def unread_count(current: CurrentUser, db: Database) -> dict:
    n = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current.id, Notification.read.is_(False)
        )
    )
    return {"count": int(n or 0)}


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_read(notification_id: str, current: CurrentUser, db: Database) -> NotificationOut:
    n = await db.get(Notification, notification_id)
    if not n or n.user_id != current.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read = True
    await db.commit()
    await db.refresh(n)
    return NotificationOut.model_validate(n)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(current: CurrentUser, db: Database) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current.id, Notification.read.is_(False))
        .values(read=True)
    )
    await db.commit()
