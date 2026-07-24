from __future__ import annotations

import logging
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..config import settings
from ..dependencies import CurrentUser, Database, assert_enrolled
from ..models.assignment import Assignment, Submission
from ..models.course import Course
from ..models.user import Role, User
from ..schemas.assignment import (
    AssignmentCreate,
    AssignmentOut,
    AssignmentUpdate,
    SubmissionCreate,
    SubmissionGrade,
    SubmissionOut,
)
from ..services.notifications import notify, notify_course
from ..services.storage import get_storage

log = logging.getLogger(__name__)
router = APIRouter()


async def _is_teacher(db, course_id: str, user: User) -> bool:
    if user.role == Role.ADMIN.value:
        return True
    course = await db.get(Course, course_id)
    return bool(course) and course.teacher_id == user.id


async def _serialize_assignment(db, a: Assignment, viewer_id: str) -> AssignmentOut:
    sub_count = await db.scalar(
        select(func.count(Submission.id)).where(Submission.assignment_id == a.id)
    ) or 0
    graded = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.assignment_id == a.id, Submission.grade.is_not(None)
        )
    ) or 0
    mine = await db.scalar(
        select(Submission)
        .where(Submission.assignment_id == a.id, Submission.student_id == viewer_id)
        .order_by(Submission.submitted_at.desc())
        .limit(1)
    )
    return AssignmentOut(
        id=a.id,
        course_id=a.course_id,
        title=a.title,
        description=a.description,
        deadline=a.deadline,
        max_points=a.max_points,
        rubric=a.rubric or [],
        status=a.status,  # type: ignore[arg-type]
        submission_count=int(sub_count),
        graded_count=int(graded),
        my_submission_id=mine.id if mine else None,
        my_grade=mine.grade if mine else None,
        created_at=a.created_at,
    )


# ─────────────────────────────────────────────────────
# Assignments
# ─────────────────────────────────────────────────────

@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentOut])
async def list_assignments(
    course_id: str, current: CurrentUser, db: Database
) -> list[AssignmentOut]:
    await assert_enrolled(db, current, course_id)
    rows = (
        await db.execute(
            select(Assignment)
            .where(Assignment.course_id == course_id)
            .order_by(Assignment.deadline.asc())
        )
    ).scalars().all()
    return [await _serialize_assignment(db, a, current.id) for a in rows]


@router.post(
    "/courses/{course_id}/assignments",
    response_model=AssignmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_assignment(
    course_id: str,
    payload: AssignmentCreate,
    current: CurrentUser,
    db: Database,
) -> AssignmentOut:
    if not await _is_teacher(db, course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can create assignments")

    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    a = Assignment(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        deadline=payload.deadline,
        max_points=payload.max_points,
        rubric=[r.model_dump() for r in payload.rubric],
        status=payload.status,
    )
    db.add(a)
    await db.flush()
    await notify_course(
        db,
        course,
        type="assignment_due",
        title=f"New assignment: {a.title}",
        body=f"Due {a.deadline.strftime('%b %d, %I:%M %p')}",
        payload={"assignment_id": a.id},
    )
    await db.commit()
    await db.refresh(a)
    return await _serialize_assignment(db, a, current.id)


@router.get("/assignments/{assignment_id}", response_model=AssignmentOut)
async def get_assignment(
    assignment_id: str, current: CurrentUser, db: Database
) -> AssignmentOut:
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await assert_enrolled(db, current, a.course_id)
    return await _serialize_assignment(db, a, current.id)


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut)
async def update_assignment(
    assignment_id: str,
    payload: AssignmentUpdate,
    current: CurrentUser,
    db: Database,
) -> AssignmentOut:
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not await _is_teacher(db, a.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can edit this assignment")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "rubric" and value is not None:
            a.rubric = [r if isinstance(r, dict) else r.model_dump() for r in value]
        else:
            setattr(a, field, value)
    await db.commit()
    await db.refresh(a)
    return await _serialize_assignment(db, a, current.id)


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: str, current: CurrentUser, db: Database
) -> None:
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not await _is_teacher(db, a.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can delete this assignment")
    await db.delete(a)
    await db.commit()


# ─────────────────────────────────────────────────────
# Submissions
# ─────────────────────────────────────────────────────

async def _serialize_submission(db, s: Submission) -> SubmissionOut:
    student = await db.get(User, s.student_id)
    a = await db.get(Assignment, s.assignment_id)
    is_late = False
    if a and s.submitted_at and a.deadline:
        deadline = a.deadline if a.deadline.tzinfo else a.deadline.replace(tzinfo=timezone.utc)
        submitted = (
            s.submitted_at if s.submitted_at.tzinfo else s.submitted_at.replace(tzinfo=timezone.utc)
        )
        is_late = submitted > deadline
    return SubmissionOut(
        id=s.id,
        assignment_id=s.assignment_id,
        student_id=s.student_id,
        student_name=student.name if student else "",
        text=s.text,
        files=s.files or [],
        submitted_at=s.submitted_at,
        grade=s.grade,
        feedback=s.feedback,
        rubric_scores=s.rubric_scores or [],
        graded_at=s.graded_at,
        is_late=is_late,
    )


@router.post(
    "/assignments/{assignment_id}/submissions",
    response_model=SubmissionOut,
    status_code=status.HTTP_201_CREATED,
)
async def submit_assignment(
    assignment_id: str,
    current: CurrentUser,
    db: Database,
    text: Annotated[str, Form()] = "",
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> SubmissionOut:
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await assert_enrolled(db, current, a.course_id)
    if a.status == "closed":
        raise HTTPException(status_code=409, detail="Assignment is closed")

    sub_dir = f"{a.course_id}/submissions/{a.id}/{current.id}"

    saved: list[dict] = []
    for f in files or []:
        if not f.filename:
            continue
        sub_id = str(uuid.uuid4())
        safe_name = Path(f.filename).name
        mime = f.content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"

        async def _iter(file=f):
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
            await file.close()

        try:
            stored = await get_storage().save(
                stream=_iter(),
                filename=safe_name,
                mime=mime,
                folder=sub_dir,
                key_hint=sub_id,
            )
        except ValueError as e:
            raise HTTPException(status_code=413, detail=str(e)) from None
        except Exception as e:
            log.exception("Submission upload failed")
            raise HTTPException(status_code=502, detail=f"Upload storage failed: {e}") from None

        saved.append({"filename": stored.filename, "path": stored.url, "size": stored.size})

    s = Submission(
        assignment_id=assignment_id,
        student_id=current.id,
        text=text,
        files=saved,
    )
    db.add(s)
    await db.flush()
    await notify(
        db,
        user_ids=[(await db.get(Course, a.course_id)).teacher_id],  # type: ignore[union-attr]
        type="graded",  # use a generic 'graded' bucket to surface in teacher inbox
        title=f"New submission for {a.title}",
        body=f"{current.name} submitted",
        course_id=a.course_id,
        course_name=(await db.get(Course, a.course_id)).name if await db.get(Course, a.course_id) else None,  # type: ignore[union-attr]
        payload={"assignment_id": a.id, "submission_id": s.id},
    )
    await db.commit()
    await db.refresh(s)
    return await _serialize_submission(db, s)


@router.get(
    "/assignments/{assignment_id}/submissions",
    response_model=list[SubmissionOut],
)
async def list_submissions(
    assignment_id: str, current: CurrentUser, db: Database
) -> list[SubmissionOut]:
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    is_teacher = await _is_teacher(db, a.course_id, current)
    if is_teacher:
        rows = (
            await db.execute(
                select(Submission)
                .where(Submission.assignment_id == assignment_id)
                .order_by(Submission.submitted_at.desc())
            )
        ).scalars().all()
    else:
        rows = (
            await db.execute(
                select(Submission)
                .where(
                    Submission.assignment_id == assignment_id,
                    Submission.student_id == current.id,
                )
                .order_by(Submission.submitted_at.desc())
            )
        ).scalars().all()
    return [await _serialize_submission(db, s) for s in rows]


@router.post("/submissions/{submission_id}/grade", response_model=SubmissionOut)
async def grade_submission(
    submission_id: str,
    payload: SubmissionGrade,
    current: CurrentUser,
    db: Database,
) -> SubmissionOut:
    s = await db.get(Submission, submission_id)
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    a = await db.get(Assignment, s.assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not await _is_teacher(db, a.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can grade submissions")
    if payload.grade > a.max_points:
        raise HTTPException(
            status_code=400,
            detail=f"Grade exceeds the assignment's maximum of {a.max_points}",
        )
    s.grade = int(payload.grade)
    s.feedback = payload.feedback
    s.rubric_scores = payload.rubric_scores
    s.graded_at = datetime.now(timezone.utc)
    s.graded_by = current.id

    course = await db.get(Course, a.course_id)
    await notify(
        db,
        user_ids=[s.student_id],
        type="graded",
        title=f"Graded: {a.title}",
        body=f"You scored {s.grade}/{a.max_points}",
        course_id=a.course_id,
        course_name=course.name if course else None,
        payload={"assignment_id": a.id, "submission_id": s.id, "grade": s.grade},
    )
    await db.commit()
    await db.refresh(s)
    return await _serialize_submission(db, s)
