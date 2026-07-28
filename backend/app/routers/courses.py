from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from ..dependencies import CurrentUser, Database, assert_enrolled, require_teacher
from ..models.assignment import Assignment, Submission
from ..models.conversation import Conversation, Message
from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.event import Announcement, CalendarEvent
from ..models.flashcard import Flashcard
from ..models.forum import ForumReply, ForumThread
from ..models.job import IngestionJob
from ..models.material import Material
from ..models.notification import Notification
from ..models.quiz import Attempt, AttemptAttachment, Question, Quiz
from ..models.user import Role, User
from ..schemas.course import CourseCreate, CourseJoin, CourseOut, CourseUpdate
from ..services.ingestion import delete_course_chunks
from ..services.storage import get_storage
from ..utils.security import generate_course_code
from ..utils.web_parsers import is_web_url

log = logging.getLogger(__name__)
router = APIRouter()


async def _serialize(db, course: Course, viewer_id: str) -> CourseOut:
    student_count = await db.scalar(
        select(func.count(Enrollment.user_id)).where(Enrollment.course_id == course.id)
    ) or 0
    material_count = await db.scalar(
        select(func.count(Material.id)).where(Material.course_id == course.id)
    ) or 0
    enrolled = False
    if course.teacher_id == viewer_id:
        enrolled = True
    else:
        hit = await db.scalar(
            select(Enrollment.user_id).where(
                Enrollment.course_id == course.id, Enrollment.user_id == viewer_id
            )
        )
        enrolled = hit is not None
    teacher = course.teacher
    return CourseOut(
        id=course.id,
        name=course.name,
        code=course.code,
        description=course.description,
        semester=course.semester,
        gradient=course.gradient,
        accent_hue=course.accent_hue,
        ai_name=course.ai_name,
        ai_personality=course.ai_personality,
        rag_mode=course.rag_mode,  # type: ignore[arg-type]
        teacher_id=course.teacher_id,
        teacher_name=teacher.name if teacher else "",
        student_count=int(student_count),
        material_count=int(material_count),
        enrolled=enrolled,
        created_at=course.created_at,
    )


@router.get("", response_model=list[CourseOut])
async def list_courses(current: CurrentUser, db: Database) -> list[CourseOut]:
    """List courses the current user teaches or is enrolled in."""
    if current.role == Role.ADMIN.value:
        result = await db.execute(select(Course).options(selectinload(Course.teacher)))
        courses = list(result.scalars().all())
    else:
        taught = await db.execute(
            select(Course)
            .where(Course.teacher_id == current.id)
            .options(selectinload(Course.teacher))
        )
        enrolled = await db.execute(
            select(Course)
            .join(Enrollment, Enrollment.course_id == Course.id)
            .where(Enrollment.user_id == current.id)
            .options(selectinload(Course.teacher))
        )
        seen: dict[str, Course] = {}
        for c in list(taught.scalars().all()) + list(enrolled.scalars().all()):
            seen[c.id] = c
        courses = list(seen.values())

    courses.sort(key=lambda c: c.created_at, reverse=True)
    return [await _serialize(db, c, current.id) for c in courses]


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: CourseCreate,
    db: Database,
    teacher: Annotated[User, Depends(require_teacher)],
) -> CourseOut:
    # Generate a unique course code
    for _ in range(10):
        code = generate_course_code()
        exists = await db.scalar(select(Course.id).where(Course.code == code))
        if not exists:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique course code")

    course = Course(
        teacher_id=teacher.id,
        code=code,
        **payload.model_dump(),
    )
    db.add(course)
    await db.commit()
    await db.refresh(course, attribute_names=["teacher"])
    return await _serialize(db, course, teacher.id)


@router.get("/{course_id}", response_model=CourseOut)
async def get_course(course_id: str, current: CurrentUser, db: Database) -> CourseOut:
    course = await db.scalar(
        select(Course).where(Course.id == course_id).options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await assert_enrolled(db, current, course_id)
    return await _serialize(db, course, current.id)


@router.patch("/{course_id}", response_model=CourseOut)
async def update_course(
    course_id: str,
    payload: CourseUpdate,
    current: CurrentUser,
    db: Database,
) -> CourseOut:
    course = await db.scalar(
        select(Course).where(Course.id == course_id).options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current.id and current.role != Role.ADMIN.value:
        raise HTTPException(status_code=403, detail="Only the course teacher can edit this course")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    await db.commit()
    await db.refresh(course, attribute_names=["teacher"])
    return await _serialize(db, course, current.id)


async def _purge_course(db, course: Course) -> None:
    """Delete a course and everything hanging off it.

    Most child tables reference ``courses.id`` with a plain FK (no ON DELETE
    CASCADE), so Postgres rejects the parent delete unless we clear them here,
    deepest-first. Blob URLs are collected before their rows go, then cleaned
    up best-effort *after* the transaction commits — an orphaned file is a far
    better outcome than a half-deleted course.
    """
    course_id = course.id
    collection = course.collection_name

    quiz_ids = list((await db.scalars(select(Quiz.id).where(Quiz.course_id == course_id))).all())
    assignment_ids = list(
        (await db.scalars(select(Assignment.id).where(Assignment.course_id == course_id))).all()
    )
    thread_ids = list(
        (await db.scalars(select(ForumThread.id).where(ForumThread.course_id == course_id))).all()
    )
    convo_ids = list(
        (await db.scalars(select(Conversation.id).where(Conversation.course_id == course_id))).all()
    )
    attempt_ids = (
        list((await db.scalars(select(Attempt.id).where(Attempt.quiz_id.in_(quiz_ids)))).all())
        if quiz_ids
        else []
    )

    blobs: list[str] = list(
        (await db.scalars(select(Material.path).where(Material.course_id == course_id))).all()
    )
    if quiz_ids:
        blobs += [
            p
            for p in (
                await db.scalars(
                    select(Question.image_path).where(Question.quiz_id.in_(quiz_ids))
                )
            ).all()
            if p  # image_path is nullable — most questions have no image
        ]
    if attempt_ids:
        blobs += list(
            (
                await db.scalars(
                    select(AttemptAttachment.path).where(
                        AttemptAttachment.attempt_id.in_(attempt_ids)
                    )
                )
            ).all()
        )
    if assignment_ids:
        rows = (
            await db.scalars(
                select(Submission.files).where(Submission.assignment_id.in_(assignment_ids))
            )
        ).all()
        for files in rows:
            blobs += [f["path"] for f in (files or []) if isinstance(f, dict) and f.get("path")]

    if attempt_ids:
        await db.execute(
            delete(AttemptAttachment).where(AttemptAttachment.attempt_id.in_(attempt_ids))
        )
    if quiz_ids:
        await db.execute(delete(Attempt).where(Attempt.quiz_id.in_(quiz_ids)))
        await db.execute(delete(Question).where(Question.quiz_id.in_(quiz_ids)))
    await db.execute(delete(Quiz).where(Quiz.course_id == course_id))

    if assignment_ids:
        await db.execute(delete(Submission).where(Submission.assignment_id.in_(assignment_ids)))
    await db.execute(delete(Assignment).where(Assignment.course_id == course_id))

    if thread_ids:
        await db.execute(delete(ForumReply).where(ForumReply.thread_id.in_(thread_ids)))
    await db.execute(delete(ForumThread).where(ForumThread.course_id == course_id))

    if convo_ids:
        await db.execute(delete(Message).where(Message.conversation_id.in_(convo_ids)))
    await db.execute(delete(Conversation).where(Conversation.course_id == course_id))

    await db.execute(delete(IngestionJob).where(IngestionJob.course_id == course_id))
    await db.execute(delete(Flashcard).where(Flashcard.course_id == course_id))
    await db.execute(delete(CalendarEvent).where(CalendarEvent.course_id == course_id))
    await db.execute(delete(Announcement).where(Announcement.course_id == course_id))
    await db.execute(delete(Notification).where(Notification.course_id == course_id))
    await db.execute(delete(Material).where(Material.course_id == course_id))
    await db.execute(delete(Enrollment).where(Enrollment.course_id == course_id))
    await db.execute(delete(Course).where(Course.id == course_id))
    await db.commit()

    try:
        await delete_course_chunks(collection, course_id)
    except Exception as e:  # noqa: BLE001
        log.warning("Vector cleanup failed for course %s: %s", course_id, e)

    # External links point at somebody else's server — nothing of ours to drop.
    local_blobs = [p for p in blobs if p and not is_web_url(p)]
    if local_blobs:
        try:
            storage = get_storage()
        except Exception as e:  # noqa: BLE001
            log.warning("Storage unavailable; %d blobs left orphaned: %s", len(local_blobs), e)
            return
        for path in local_blobs:
            try:
                await storage.delete(path)
            except Exception as e:  # noqa: BLE001
                log.warning("Blob deletion failed for %s: %s", path, e)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(course_id: str, current: CurrentUser, db: Database) -> None:
    """Permanently delete a course — teacher of record (or admin) only."""
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current.id and current.role != Role.ADMIN.value:
        raise HTTPException(
            status_code=403, detail="Only the course teacher can delete this course"
        )
    await _purge_course(db, course)
    log.info("Course %s deleted by %s", course_id, current.id)


@router.post("/join", response_model=CourseOut)
async def join_course(payload: CourseJoin, current: CurrentUser, db: Database) -> CourseOut:
    course = await db.scalar(
        select(Course).where(Course.code == payload.code.upper()).options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="No course matches that code")
    if course.teacher_id == current.id:
        raise HTTPException(status_code=400, detail="You're the teacher of this course")
    existing = await db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == course.id, Enrollment.user_id == current.id
        )
    )
    if not existing:
        db.add(Enrollment(user_id=current.id, course_id=course.id))
        await db.commit()
    return await _serialize(db, course, current.id)
