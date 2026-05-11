from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..dependencies import CurrentUser, Database, assert_enrolled
from ..models.course import Course
from ..models.event import Announcement
from ..models.user import Role, User
from ..schemas.event import AnnouncementCreate, AnnouncementOut
from ..services.notifications import notify_course

log = logging.getLogger(__name__)
router = APIRouter()


async def _is_teacher(db, course_id: str, user: User) -> bool:
    if user.role == Role.ADMIN.value:
        return True
    course = await db.get(Course, course_id)
    return bool(course) and course.teacher_id == user.id


def _serialize(a: Announcement, author_name: str = "") -> AnnouncementOut:
    return AnnouncementOut(
        id=a.id,
        course_id=a.course_id,
        author_id=a.author_id,
        author_name=author_name,
        title=a.title,
        body=a.body,
        pinned=a.pinned,
        created_at=a.created_at,
    )


@router.get("/courses/{course_id}/announcements", response_model=list[AnnouncementOut])
async def list_announcements(
    course_id: str, current: CurrentUser, db: Database
) -> list[AnnouncementOut]:
    await assert_enrolled(db, current, course_id)
    rows = (
        await db.execute(
            select(Announcement)
            .where(Announcement.course_id == course_id)
            .order_by(Announcement.pinned.desc(), Announcement.created_at.desc())
        )
    ).scalars().all()
    # Hydrate author names
    author_ids = {a.author_id for a in rows}
    authors: dict[str, str] = {}
    if author_ids:
        authors = {
            u.id: u.name
            for u in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        }
    return [_serialize(a, authors.get(a.author_id, "")) for a in rows]


@router.post(
    "/courses/{course_id}/announcements",
    response_model=AnnouncementOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_announcement(
    course_id: str,
    payload: AnnouncementCreate,
    current: CurrentUser,
    db: Database,
) -> AnnouncementOut:
    if not await _is_teacher(db, course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can post announcements")
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    a = Announcement(
        course_id=course_id,
        author_id=current.id,
        title=payload.title,
        body=payload.body,
        pinned=payload.pinned,
    )
    db.add(a)
    await db.flush()

    await notify_course(
        db,
        course,
        type="announcement",
        title=a.title,
        body=(a.body or "")[:240],
        payload={"announcement_id": a.id, "pinned": a.pinned},
        exclude_user_ids=[current.id],
    )
    await db.commit()
    await db.refresh(a)
    return _serialize(a, current.name)


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: str, current: CurrentUser, db: Database
) -> None:
    a = await db.get(Announcement, announcement_id)
    if not a:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if not await _is_teacher(db, a.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can delete announcements")
    await db.delete(a)
    await db.commit()
