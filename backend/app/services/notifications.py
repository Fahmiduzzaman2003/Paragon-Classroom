from __future__ import annotations

import logging
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.notification import Notification

log = logging.getLogger(__name__)


async def notify(
    db: AsyncSession,
    *,
    user_ids: Iterable[str],
    type: str,
    title: str,
    body: str = "",
    course_id: str | None = None,
    course_name: str | None = None,
    payload: dict | None = None,
) -> None:
    """Create one Notification row per user_id. Caller is responsible for committing
    if a transaction is in progress; this function adds rows without flushing."""
    rows: list[Notification] = []
    for uid in user_ids:
        if not uid:
            continue
        rows.append(
            Notification(
                user_id=uid,
                type=type,
                title=title,
                body=body,
                course_id=course_id,
                course_name=course_name,
                payload=payload or {},
            )
        )
    if rows:
        db.add_all(rows)


async def notify_course(
    db: AsyncSession,
    course: Course,
    *,
    type: str,
    title: str,
    body: str = "",
    payload: dict | None = None,
    include_teacher: bool = False,
    exclude_user_ids: Iterable[str] = (),
) -> None:
    """Notify everyone enrolled in a course (and optionally the teacher)."""
    excl = {u for u in exclude_user_ids}
    targets: set[str] = set()
    rows = (
        await db.execute(
            select(Enrollment.user_id).where(Enrollment.course_id == course.id)
        )
    ).scalars().all()
    targets.update(rows)
    if include_teacher:
        targets.add(course.teacher_id)
    targets -= excl
    await notify(
        db,
        user_ids=targets,
        type=type,
        title=title,
        body=body,
        course_id=course.id,
        course_name=course.name,
        payload=payload,
    )
