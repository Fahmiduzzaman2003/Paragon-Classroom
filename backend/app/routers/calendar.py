from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..dependencies import CurrentUser, Database, assert_enrolled
from ..models.assignment import Assignment
from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.event import CalendarEvent
from ..models.quiz import Quiz
from ..models.user import Role, User
from ..schemas.event import EventCreate, EventOut, EventUpdate

log = logging.getLogger(__name__)
router = APIRouter()


async def _is_teacher(db, course_id: str, user: User) -> bool:
    if user.role == Role.ADMIN.value:
        return True
    course = await db.get(Course, course_id)
    return bool(course) and course.teacher_id == user.id


def _ev(e: CalendarEvent) -> EventOut:
    return EventOut(
        id=e.id,
        course_id=e.course_id,
        title=e.title,
        description=e.description,
        start_at=e.start_at,
        end_at=e.end_at,
        type=e.type,  # type: ignore[arg-type]
        source_ref=e.source_ref,
    )


def _virtual_quiz_event(q: Quiz) -> EventOut | None:
    if not q.start_at or not q.end_at:
        return None
    return EventOut(
        id=f"quiz:{q.id}",
        course_id=q.course_id,
        title=f"Quiz: {q.title}",
        description=q.description or "",
        start_at=q.start_at,
        end_at=q.end_at,
        type="quiz",
        source_ref=q.id,
    )


def _virtual_assignment_event(a: Assignment) -> EventOut:
    return EventOut(
        id=f"assignment:{a.id}",
        course_id=a.course_id,
        title=f"Due: {a.title}",
        description=a.description or "",
        start_at=a.deadline,
        end_at=a.deadline,
        type="assignment",
        source_ref=a.id,
    )


@router.get("/courses/{course_id}/calendar", response_model=list[EventOut])
async def list_course_events(
    course_id: str, current: CurrentUser, db: Database
) -> list[EventOut]:
    await assert_enrolled(db, current, course_id)
    events: list[EventOut] = []

    custom = (
        await db.execute(
            select(CalendarEvent)
            .where(CalendarEvent.course_id == course_id)
            .order_by(CalendarEvent.start_at.asc())
        )
    ).scalars().all()
    events.extend(_ev(e) for e in custom)

    quizzes = (
        await db.execute(select(Quiz).where(Quiz.course_id == course_id))
    ).scalars().all()
    for q in quizzes:
        ve = _virtual_quiz_event(q)
        if ve:
            events.append(ve)

    assignments = (
        await db.execute(select(Assignment).where(Assignment.course_id == course_id))
    ).scalars().all()
    events.extend(_virtual_assignment_event(a) for a in assignments)

    events.sort(key=lambda e: e.start_at)
    return events


@router.get("/calendar", response_model=list[EventOut])
async def list_all_events(current: CurrentUser, db: Database) -> list[EventOut]:
    """Aggregate events across every course the user is enrolled in or teaches."""
    course_ids: set[str] = set()

    taught = (
        await db.execute(select(Course.id).where(Course.teacher_id == current.id))
    ).scalars().all()
    course_ids.update(taught)
    enrolled = (
        await db.execute(
            select(Enrollment.course_id).where(Enrollment.user_id == current.id)
        )
    ).scalars().all()
    course_ids.update(enrolled)

    out: list[EventOut] = []
    for cid in course_ids:
        out.extend(await list_course_events(cid, current, db))  # reuse logic
    out.sort(key=lambda e: e.start_at)
    return out


@router.post(
    "/courses/{course_id}/events",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_event(
    course_id: str,
    payload: EventCreate,
    current: CurrentUser,
    db: Database,
) -> EventOut:
    if not await _is_teacher(db, course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can add events")
    e = CalendarEvent(course_id=course_id, **payload.model_dump())
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return _ev(e)


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(
    event_id: str,
    payload: EventUpdate,
    current: CurrentUser,
    db: Database,
) -> EventOut:
    e = await db.get(CalendarEvent, event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    if not await _is_teacher(db, e.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can edit events")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(e, f, v)
    await db.commit()
    await db.refresh(e)
    return _ev(e)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, current: CurrentUser, db: Database) -> None:
    e = await db.get(CalendarEvent, event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    if not await _is_teacher(db, e.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can delete events")
    await db.delete(e)
    await db.commit()
