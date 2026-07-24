from __future__ import annotations

import logging
import mimetypes
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..config import settings
from ..dependencies import CurrentUser, Database, assert_enrolled, require_teacher
from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.quiz import Attempt, AttemptAttachment, Question, QuestionType, Quiz, QuizStatus
from ..models.user import Role, User
from ..schemas.quiz import (
    AnswerInput,
    AttachmentOut,
    AttemptResultOut,
    AttemptStartOut,
    AttemptSubmitInput,
    AttemptSummaryOut,
    GenerateQuizRequest,
    GradedQuestion,
    JoinByCodeInput,
    JoinByCodeOut,
    LeaderboardEntryOut,
    ManualGradeInput,
    QuestionOut,
    QuestionSafeOut,
    QuizCreate,
    QuizDetailOut,
    QuizOut,
    QuizStatusOut,
    QuizUpdate,
    ReleaseInput,
    ViolationEvent,
    ViolationInput,
)
from ..services.grading import grade_answer
from ..services.llm_grading import grade_written_answer
from ..services.notifications import notify_course
from ..services.quiz_generator import generate_quiz_questions
from ..services.storage import get_storage
from ..models.event import CalendarEvent

log = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────

async def _quiz_or_404(db, quiz_id: str, *, with_questions: bool = False) -> Quiz:
    stmt = select(Quiz).where(Quiz.id == quiz_id)
    if with_questions:
        stmt = stmt.options(selectinload(Quiz.questions))
    q = await db.scalar(stmt)
    if not q:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return q


def _effective_status(quiz: Quiz, now: datetime | None = None) -> str:
    """Compute live status from the schedule. Persisted status wins for draft/closed."""
    if quiz.status in {QuizStatus.DRAFT.value, QuizStatus.CLOSED.value}:
        return quiz.status
    now = now or datetime.now(timezone.utc)
    s, e = quiz.start_at, quiz.end_at
    if s and e:
        if now < s.replace(tzinfo=timezone.utc) if s.tzinfo is None else now < s:
            return QuizStatus.SCHEDULED.value
        if now > e.replace(tzinfo=timezone.utc) if e.tzinfo is None else now > e:
            return QuizStatus.CLOSED.value
        return QuizStatus.LIVE.value
    return quiz.status or QuizStatus.SCHEDULED.value


def _q_has_image(q: Question) -> bool:
    return bool(getattr(q, "image_path", None))


def _question_out(q: Question, *, hide_keys: bool = False) -> QuestionOut:
    """Serialize a question for the teacher view (or the safe student view).

    `hide_keys=True` blanks out the answer key and explanation — used when a
    student opens the quiz outside an active attempt.
    """
    return QuestionOut(
        id=q.id,
        quiz_id=q.quiz_id,
        position=q.position,
        type=q.type,  # type: ignore[arg-type]
        body=q.body,
        options=q.options,
        correct=[] if hide_keys else (q.correct or []),
        points=q.points,
        explanation="" if hide_keys else (q.explanation or ""),
        accepts_attachment=bool(q.accepts_attachment),
        has_image=_q_has_image(q),
    )


def _question_safe(q: Question) -> QuestionSafeOut:
    return QuestionSafeOut(
        id=q.id,
        quiz_id=q.quiz_id,
        position=q.position,
        type=q.type,  # type: ignore[arg-type]
        body=q.body,
        options=q.options,
        points=q.points,
        accepts_attachment=bool(q.accepts_attachment),
        has_image=_q_has_image(q),
    )


async def _serialize_quiz(db, quiz: Quiz, viewer_id: str) -> QuizOut:
    qcount = len(quiz.questions) if quiz.questions else (
        await db.scalar(select(func.count(Question.id)).where(Question.quiz_id == quiz.id)) or 0
    )
    total_points = sum(q.points for q in (quiz.questions or [])) or (
        await db.scalar(select(func.sum(Question.points)).where(Question.quiz_id == quiz.id)) or 0
    )
    submission_count = await db.scalar(
        select(func.count(Attempt.id)).where(
            Attempt.quiz_id == quiz.id, Attempt.submitted_at.is_not(None)
        )
    ) or 0

    my_attempt = await db.scalar(
        select(Attempt)
        .where(Attempt.quiz_id == quiz.id, Attempt.student_id == viewer_id)
        .order_by(Attempt.started_at.desc())
        .limit(1)
    )

    return QuizOut(
        id=quiz.id,
        course_id=quiz.course_id,
        title=quiz.title,
        description=quiz.description,
        duration_min=quiz.duration_min,
        start_at=quiz.start_at,
        end_at=quiz.end_at,
        shuffle_questions=quiz.shuffle_questions,
        show_results=quiz.show_results,
        allow_retake=quiz.allow_retake,
        one_question_at_a_time=quiz.one_question_at_a_time,
        exam_mode=bool(getattr(quiz, "exam_mode", False)),
        exam_code=getattr(quiz, "exam_code", None),
        proctoring_enabled=bool(getattr(quiz, "proctoring_enabled", False)),
        status=_effective_status(quiz),  # type: ignore[arg-type]
        question_count=int(qcount),
        total_points=int(total_points),
        submission_count=int(submission_count),
        my_attempt_id=my_attempt.id if my_attempt else None,
        my_score=my_attempt.score if my_attempt and my_attempt.submitted_at else None,
        created_at=quiz.created_at,
    )


async def _sync_quiz_calendar_event(db, quiz: Quiz) -> None:
    """Mirror the quiz schedule into the course calendar.

    Each quiz with a `start_at` produces a single calendar event of type
    'quiz' that students see on their dashboard + course calendar. We key
    the event by `source_ref` so updates are idempotent.
    """
    existing = await db.scalar(
        select(CalendarEvent).where(
            CalendarEvent.course_id == quiz.course_id,
            CalendarEvent.source_ref == f"quiz:{quiz.id}",
        )
    )
    if not quiz.start_at:
        # Schedule was cleared — drop the event if it exists.
        if existing:
            await db.delete(existing)
        return
    end = quiz.end_at or (
        quiz.start_at + timedelta(minutes=max(1, quiz.duration_min))
    )
    if existing:
        existing.title = quiz.title
        existing.description = quiz.description or ""
        existing.start_at = quiz.start_at
        existing.end_at = end
        existing.type = "quiz"
        return
    db.add(
        CalendarEvent(
            course_id=quiz.course_id,
            title=quiz.title,
            description=quiz.description or "",
            start_at=quiz.start_at,
            end_at=end,
            type="quiz",
            source_ref=f"quiz:{quiz.id}",
        )
    )


async def _is_teacher(db, course_id: str, user: User) -> bool:
    if user.role == Role.ADMIN.value:
        return True
    course = await db.get(Course, course_id)
    return bool(course) and course.teacher_id == user.id


# ─────────────────────────────────────────────────────
# Quizzes
# ─────────────────────────────────────────────────────

@router.get("/courses/{course_id}/quizzes", response_model=list[QuizOut])
async def list_quizzes(course_id: str, current: CurrentUser, db: Database) -> list[QuizOut]:
    await assert_enrolled(db, current, course_id)
    rows = (await db.execute(
        select(Quiz)
        .where(Quiz.course_id == course_id)
        .order_by(Quiz.created_at.desc())
        .options(selectinload(Quiz.questions))
    )).scalars().all()
    return [await _serialize_quiz(db, q, current.id) for q in rows]


@router.post(
    "/courses/{course_id}/quizzes",
    response_model=QuizDetailOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_quiz(
    course_id: str,
    payload: QuizCreate,
    current: CurrentUser,
    db: Database,
    _t: Annotated[User, Depends(require_teacher)],
) -> QuizDetailOut:
    if not await _is_teacher(db, course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can create quizzes")

    quiz = Quiz(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        duration_min=payload.duration_min,
        start_at=payload.start_at,
        end_at=payload.end_at,
        shuffle_questions=payload.shuffle_questions,
        show_results=payload.show_results,
        allow_retake=payload.allow_retake,
        one_question_at_a_time=payload.one_question_at_a_time,
        exam_mode=payload.exam_mode,
        proctoring_enabled=payload.proctoring_enabled,
        status=payload.status,
    )
    db.add(quiz)
    await db.flush()

    for i, q in enumerate(payload.questions):
        db.add(
            Question(
                quiz_id=quiz.id,
                position=q.position if q.position is not None else i,
                type=q.type,
                body=q.body,
                options=q.options,
                correct=q.correct,
                points=q.points,
                explanation=q.explanation,
                accepts_attachment=q.accepts_attachment,
            )
        )

    await _sync_quiz_calendar_event(db, quiz)

    # Notify enrolled students whenever the teacher publishes a scheduled exam.
    course_obj = await db.get(Course, course_id)
    if (
        course_obj
        and quiz.start_at
        and quiz.status in {QuizStatus.LIVE.value, QuizStatus.SCHEDULED.value}
    ):
        when = quiz.start_at.strftime("%a %b %d · %H:%M UTC")
        await notify_course(
            db,
            course_obj,
            type="quiz_reminder",
            title=f"Exam scheduled: {quiz.title}",
            body=f"Starts {when} · {quiz.duration_min} min",
            payload={
                "quiz_id": quiz.id,
                "starts_at": quiz.start_at.isoformat(),
                "duration_min": quiz.duration_min,
                "exam_code": quiz.exam_code,
            },
        )

    await db.commit()
    await db.refresh(quiz, attribute_names=["questions"])

    base = await _serialize_quiz(db, quiz, current.id)
    return QuizDetailOut(
        **base.model_dump(),
        questions=[_question_out(q) for q in quiz.questions],
    )


@router.get("/quizzes/{quiz_id}", response_model=QuizDetailOut)
async def get_quiz(quiz_id: str, current: CurrentUser, db: Database) -> QuizDetailOut:
    quiz = await _quiz_or_404(db, quiz_id, with_questions=True)
    await assert_enrolled(db, current, quiz.course_id)
    base = await _serialize_quiz(db, quiz, current.id)
    is_teacher = await _is_teacher(db, quiz.course_id, current)

    out_questions: list[QuestionOut] = [
        _question_out(q, hide_keys=not is_teacher) for q in quiz.questions
    ]
    return QuizDetailOut(**base.model_dump(), questions=out_questions)


@router.patch("/quizzes/{quiz_id}", response_model=QuizDetailOut)
async def update_quiz(
    quiz_id: str,
    payload: QuizUpdate,
    current: CurrentUser,
    db: Database,
) -> QuizDetailOut:
    quiz = await _quiz_or_404(db, quiz_id, with_questions=True)
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can edit this quiz")
    prior_start = quiz.start_at
    prior_status = quiz.status
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(quiz, field, value)
    await _sync_quiz_calendar_event(db, quiz)

    # Re-notify if the schedule actually changed (new start, or moved into a
    # live/scheduled state from draft).
    schedule_changed = quiz.start_at != prior_start or (
        quiz.status != prior_status
        and quiz.status in {QuizStatus.LIVE.value, QuizStatus.SCHEDULED.value}
    )
    if quiz.start_at and schedule_changed:
        course_obj = await db.get(Course, quiz.course_id)
        if course_obj:
            when = quiz.start_at.strftime("%a %b %d · %H:%M UTC")
            await notify_course(
                db,
                course_obj,
                type="quiz_reminder",
                title=f"Exam updated: {quiz.title}",
                body=f"Starts {when} · {quiz.duration_min} min",
                payload={
                    "quiz_id": quiz.id,
                    "starts_at": quiz.start_at.isoformat(),
                    "duration_min": quiz.duration_min,
                    "exam_code": quiz.exam_code,
                },
            )

    await db.commit()
    await db.refresh(quiz, attribute_names=["questions"])
    base = await _serialize_quiz(db, quiz, current.id)
    return QuizDetailOut(
        **base.model_dump(),
        questions=[_question_out(q) for q in quiz.questions],
    )


@router.delete("/quizzes/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quiz(quiz_id: str, current: CurrentUser, db: Database) -> None:
    quiz = await _quiz_or_404(db, quiz_id)
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can delete this quiz")
    await db.delete(quiz)
    await db.commit()


# ─────────────────────────────────────────────────────
# AI-assisted quiz draft
# ─────────────────────────────────────────────────────

@router.post("/courses/{course_id}/quizzes/generate", response_model=QuizDetailOut)
async def generate_quiz(
    course_id: str,
    payload: GenerateQuizRequest,
    current: CurrentUser,
    db: Database,
) -> QuizDetailOut:
    if not await _is_teacher(db, course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can generate quizzes")
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    questions = await generate_quiz_questions(
        course=course,
        num_questions=payload.num_questions,
        types=payload.types,
        instructions=payload.instructions,
    )
    if not questions:
        raise HTTPException(
            status_code=409,
            detail="No course materials are indexed yet — upload at least one file first.",
        )

    quiz = Quiz(
        course_id=course_id,
        title=payload.title,
        description="Drafted from course materials. Review before publishing.",
        duration_min=max(15, len(questions) * 3),
        status=QuizStatus.DRAFT.value,
    )
    db.add(quiz)
    await db.flush()
    for i, q in enumerate(questions):
        db.add(
            Question(
                quiz_id=quiz.id,
                position=i,
                type=q["type"],
                body=q["body"],
                options=q.get("options", []),
                correct=q.get("correct", []),
                points=int(q.get("points", 10)),
                explanation=q.get("explanation", ""),
            )
        )
    await db.commit()
    await db.refresh(quiz, attribute_names=["questions"])
    base = await _serialize_quiz(db, quiz, current.id)
    return QuizDetailOut(
        **base.model_dump(),
        questions=[_question_out(q) for q in quiz.questions],
    )


# ─────────────────────────────────────────────────────
# Attempts
# ─────────────────────────────────────────────────────

@router.get("/quizzes/{quiz_id}/status", response_model=QuizStatusOut)
async def quiz_status(
    quiz_id: str, current: CurrentUser, db: Database
) -> QuizStatusOut:
    """Single source of truth for the live state of a scheduled exam.

    The student waiting-room polls this to know exactly when to launch (we
    can't trust the client clock), and `start_attempt` calls into the same
    rules below.
    """
    quiz = await _quiz_or_404(db, quiz_id)
    await assert_enrolled(db, current, quiz.course_id)
    now = datetime.now(timezone.utc)
    eff = _effective_status(quiz, now)

    def _aware(d: datetime | None) -> datetime | None:
        if d is None:
            return None
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)

    starts = _aware(quiz.start_at)
    ends = _aware(quiz.end_at)
    starts_in = int((starts - now).total_seconds()) if starts else None
    ends_in = int((ends - now).total_seconds()) if ends else None

    is_teacher_user = await _is_teacher(db, quiz.course_id, current)
    can_start = eff == QuizStatus.LIVE.value or (
        eff == QuizStatus.SCHEDULED.value and not quiz.start_at
    )
    if is_teacher_user:
        # Teachers can dry-run a draft / scheduled quiz at any time.
        can_start = eff != QuizStatus.CLOSED.value
    return QuizStatusOut(
        quiz_id=quiz.id,
        status=eff,  # type: ignore[arg-type]
        server_now=now,
        start_at=starts,
        end_at=ends,
        starts_in_seconds=starts_in,
        ends_in_seconds=ends_in,
        can_start=can_start,
        duration_min=quiz.duration_min,
        proctoring_enabled=bool(getattr(quiz, "proctoring_enabled", False)),
    )


@router.post("/quizzes/{quiz_id}/attempts", response_model=AttemptStartOut)
async def start_attempt(quiz_id: str, current: CurrentUser, db: Database) -> AttemptStartOut:
    quiz = await _quiz_or_404(db, quiz_id, with_questions=True)
    await assert_enrolled(db, current, quiz.course_id)

    now = datetime.now(timezone.utc)
    eff = _effective_status(quiz, now)
    is_teacher_user = await _is_teacher(db, quiz.course_id, current)

    # Hard gate: a scheduled exam isn't joinable until its start_at, even if a
    # student already has the link/code. Teachers can still preview.
    if not is_teacher_user:
        if eff == QuizStatus.CLOSED.value:
            raise HTTPException(status_code=409, detail="Quiz is closed")
        if eff == QuizStatus.DRAFT.value:
            raise HTTPException(status_code=409, detail="Quiz is not yet published")
        if eff == QuizStatus.SCHEDULED.value and quiz.start_at:
            starts_at = quiz.start_at if quiz.start_at.tzinfo else quiz.start_at.replace(tzinfo=timezone.utc)
            if now < starts_at:
                wait_s = int((starts_at - now).total_seconds())
                raise HTTPException(
                    status_code=425,
                    detail=f"Exam starts in {wait_s} seconds — please wait",
                )

    # Block duplicate attempts when allow_retake is False
    if not quiz.allow_retake:
        existing = await db.scalar(
            select(Attempt)
            .where(Attempt.quiz_id == quiz.id, Attempt.student_id == current.id)
            .limit(1)
        )
        if existing and existing.submitted_at is not None:
            raise HTTPException(status_code=409, detail="You have already attempted this quiz")
        if existing and existing.submitted_at is None:
            # Resume in-progress attempt
            return _attempt_start_payload(quiz, existing)

    attempt = Attempt(
        quiz_id=quiz.id,
        student_id=current.id,
        answers={},
        graded={},
        max_score=sum(q.points for q in quiz.questions),
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return _attempt_start_payload(quiz, attempt)


def _attempt_start_payload(quiz: Quiz, attempt: Attempt) -> AttemptStartOut:
    qs = list(quiz.questions)
    if quiz.shuffle_questions:
        rnd = random.Random(attempt.id)
        rnd.shuffle(qs)
    return AttemptStartOut(
        id=attempt.id,
        quiz_id=quiz.id,
        started_at=attempt.started_at,
        duration_min=quiz.duration_min,
        questions=[_question_safe(q) for q in qs],
    )


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResultOut)
async def submit_attempt(
    attempt_id: str,
    payload: AttemptSubmitInput,
    current: CurrentUser,
    db: Database,
) -> AttemptResultOut:
    attempt = await db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.student_id != current.id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    if attempt.submitted_at is not None:
        # Idempotent retry: same client key returns the original result instead
        # of a spurious 409 after a cold-start / flaky-network re-POST.
        if payload.idempotency_key and attempt.idempotency_key == payload.idempotency_key:
            return _result_payload(attempt)
        raise HTTPException(status_code=409, detail="Attempt already submitted")

    quiz = await _quiz_or_404(db, attempt.quiz_id, with_questions=True)
    by_id = {q.id: q for q in quiz.questions}

    # Server is the source of truth for time. Late = past the timer + grace.
    now = datetime.now(timezone.utc)
    started = attempt.started_at if attempt.started_at.tzinfo else attempt.started_at.replace(tzinfo=timezone.utc)
    elapsed_s = (now - started).total_seconds()
    allowed_s = quiz.duration_min * 60 + settings.exam_grace_period_s
    is_late = elapsed_s > allowed_s

    answers_map: dict[str, AnswerInput] = {a.question_id: a for a in payload.answers}
    graded_map: dict[str, dict] = {}
    score = 0
    needs_manual = False
    grading_model = ""

    for q in quiz.questions:
        ans = answers_map.get(q.id)
        selected = list(ans.selected) if ans else []
        text = (ans.text if ans else "") or ""
        result = grade_answer(q, selected, text)

        # Rubric-driven LLM grading for essays (when a real provider is configured
        # and the teacher supplied model answers). Success → auto grade with a
        # justification; any failure → fall through to the manual-review queue.
        if q.type == QuestionType.ESSAY.value and text.strip():
            model_answers = [r for r in (q.correct or []) if isinstance(r, str) and r.strip()]
            if model_answers:
                llm_grade = await grade_written_answer(
                    question=q.body,
                    student_answer=text,
                    model_answers=model_answers,
                    max_points=int(q.points),
                    user_id=current.id,
                )
                if llm_grade is not None:
                    grading_model = llm_grade.model_used
                    graded_map[q.id] = {
                        "correct": llm_grade.points >= int(q.points),
                        "points": llm_grade.points,
                        "max_points": llm_grade.max_points,
                        "feedback": llm_grade.justification or "AI-graded",
                        "criteria": [c.model_dump() for c in llm_grade.criteria],
                        "auto": True,
                        # Teacher can still confirm AI grades before release.
                        "reviewed": False,
                        "explanation": q.explanation or "",
                    }
                    score += llm_grade.points
                    needs_manual = True  # surfaced for teacher confirmation
                    continue

        if not result.auto:
            needs_manual = True
        score += result.points
        graded_map[q.id] = {
            "correct": result.correct,
            "points": result.points,
            "max_points": result.max_points,
            "feedback": result.feedback,
            "auto": result.auto,
            # Auto entries are reviewed by definition. Manual entries start as
            # un-reviewed so the teacher's queue picks them up.
            "reviewed": bool(result.auto),
            "explanation": result.explanation,
        }

    attempt.answers = {qid: a.model_dump() for qid, a in answers_map.items() if qid in by_id}
    attempt.graded = graded_map
    attempt.score = score
    attempt.max_score = sum(q.points for q in quiz.questions)
    attempt.needs_manual_grading = needs_manual
    attempt.submitted_at = now
    attempt.late = is_late
    attempt.idempotency_key = payload.idempotency_key
    attempt.grading_model = grading_model
    attempt.rubric_version = settings.grading_rubric_version if grading_model else ""
    await db.commit()
    await db.refresh(attempt)

    return _result_payload(attempt)


@router.get("/attempts/{attempt_id}", response_model=AttemptResultOut)
async def get_attempt(
    attempt_id: str, current: CurrentUser, db: Database
) -> AttemptResultOut:
    attempt = await db.scalar(
        select(Attempt)
        .where(Attempt.id == attempt_id)
        .options(selectinload(Attempt.attachments))
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    quiz = await _quiz_or_404(db, attempt.quiz_id)
    is_teacher = await _is_teacher(db, quiz.course_id, current)
    if attempt.student_id != current.id and not is_teacher:
        raise HTTPException(status_code=403, detail="Not permitted")
    return _result_payload(attempt, include_unreleased=is_teacher)


def _result_payload(attempt: Attempt, *, include_unreleased: bool = True) -> AttemptResultOut:
    answers = attempt.answers or {}
    attachments_by_q: dict[str, list[AttachmentOut]] = {}
    for att in (attempt.attachments or []):
        attachments_by_q.setdefault(att.question_id, []).append(
            AttachmentOut.model_validate(att)
        )

    graded: list[GradedQuestion] = []
    auto_score = 0
    manual_score = 0
    auto_max = 0
    manual_max = 0
    pending_manual = 0
    for qid, g in (attempt.graded or {}).items():
        ans = answers.get(qid) or {}
        is_auto = bool(g.get("auto", True))
        reviewed = bool(g.get("reviewed", is_auto))
        max_pts = int(g.get("max_points", 0))
        awarded = int(g.get("points", 0))

        if is_auto:
            auto_score += awarded
            auto_max += max_pts
        else:
            manual_max += max_pts
            if reviewed:
                manual_score += awarded
            else:
                pending_manual += 1

        # Suppress un-reviewed manual marks from the student until the teacher
        # releases the attempt. Auto marks are always visible to the student.
        hide_for_student = (
            not include_unreleased
            and not is_auto
            and not attempt.released
        )
        if hide_for_student:
            graded.append(
                GradedQuestion(
                    question_id=qid,
                    correct=False,
                    points=0,
                    max_points=max_pts,
                    feedback="Pending teacher review",
                    auto=False,
                    reviewed=False,
                    explanation="",
                    student_text=ans.get("text") or "",
                    student_selected=ans.get("selected") or [],
                    attachments=attachments_by_q.get(qid, []),
                )
            )
            continue
        graded.append(
            GradedQuestion(
                question_id=qid,
                correct=bool(g.get("correct", False)),
                points=awarded,
                max_points=max_pts,
                feedback=str(g.get("feedback", "")),
                auto=is_auto,
                reviewed=reviewed,
                explanation=str(g.get("explanation", "")),
                student_text=ans.get("text") or "",
                student_selected=ans.get("selected") or [],
                attachments=attachments_by_q.get(qid, []),
            )
        )
    raw_violations = getattr(attempt, "violations", None) or []
    violations: list[ViolationEvent] = []
    for v in raw_violations:
        if not isinstance(v, dict):
            continue
        try:
            at_raw = v.get("at")
            at_dt = (
                at_raw if isinstance(at_raw, datetime)
                else datetime.fromisoformat(str(at_raw).replace("Z", "+00:00"))
            )
            violations.append(
                ViolationEvent(
                    type=str(v.get("type", "unknown"))[:64],
                    at=at_dt,
                    extra=v.get("extra") if isinstance(v.get("extra"), dict) else {},
                )
            )
        except Exception:  # noqa: BLE001
            continue

    return AttemptResultOut(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        score=attempt.score,
        max_score=attempt.max_score,
        auto_score=auto_score,
        manual_score=manual_score,
        auto_max=auto_max,
        manual_max=manual_max,
        pending_manual=pending_manual,
        needs_manual_grading=attempt.needs_manual_grading,
        released=bool(getattr(attempt, "released", False)),
        teacher_feedback=getattr(attempt, "teacher_feedback", "") or "",
        violations=violations,
        graded=graded,
    )


# ─────────────────────────────────────────────────────
# Leaderboard
# ─────────────────────────────────────────────────────

@router.get(
    "/courses/{course_id}/leaderboard", response_model=list[LeaderboardEntryOut]
)
async def leaderboard(
    course_id: str, current: CurrentUser, db: Database
) -> list[LeaderboardEntryOut]:
    await assert_enrolled(db, current, course_id)

    # Aggregate: total points + #quizzes per student in this course.
    stmt = (
        select(
            Attempt.student_id.label("user_id"),
            func.sum(Attempt.score).label("points"),
            func.count(Attempt.id).label("quizzes_taken"),
        )
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .where(Quiz.course_id == course_id, Attempt.submitted_at.is_not(None))
        .group_by(Attempt.student_id)
    )
    rows = (await db.execute(stmt)).all()

    # Hydrate user names
    user_ids = [r.user_id for r in rows]
    users: dict[str, User] = {}
    if user_ids:
        u_rows = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users = {u.id: u for u in u_rows}

    # Make sure enrolled students with 0 attempts also appear.
    enrolled_ids = (
        await db.execute(
            select(Enrollment.user_id).where(Enrollment.course_id == course_id)
        )
    ).scalars().all()
    course = await db.get(Course, course_id)
    extra_ids = [uid for uid in enrolled_ids if uid not in {r.user_id for r in rows}]
    if course and course.teacher_id not in {r.user_id for r in rows}:
        # Don't include teacher in leaderboard
        pass
    if extra_ids:
        u_rows = (
            await db.execute(select(User).where(User.id.in_(extra_ids)))
        ).scalars().all()
        for u in u_rows:
            users[u.id] = u

    combined: list[tuple[str, int, int]] = [
        (r.user_id, int(r.points or 0), int(r.quizzes_taken or 0)) for r in rows
    ]
    for uid in extra_ids:
        combined.append((uid, 0, 0))

    combined.sort(key=lambda t: (-t[1], -t[2], users.get(t[0]).name if users.get(t[0]) else ""))

    out: list[LeaderboardEntryOut] = []
    for rank, (uid, pts, qt) in enumerate(combined, start=1):
        u = users.get(uid)
        if not u or (course and u.id == course.teacher_id):
            continue
        out.append(
            LeaderboardEntryOut(
                rank=rank,
                user_id=u.id,
                name=u.name,
                avatar_url=u.avatar_url,
                points=pts,
                quizzes_taken=qt,
            )
        )
    return out


# ─────────────────────────────────────────────────────
# Exam-mode: join by code
# ─────────────────────────────────────────────────────

@router.post("/exam/join", response_model=JoinByCodeOut)
async def join_by_code(
    payload: JoinByCodeInput, current: CurrentUser, db: Database
) -> JoinByCodeOut:
    """Resolve an exam code to its quiz. Auto-enrolls the student in the
    course so they can take the exam without a separate join-class step."""
    code = payload.code.strip().upper()
    quiz = await db.scalar(select(Quiz).where(Quiz.exam_code == code))
    if not quiz:
        raise HTTPException(status_code=404, detail="Invalid exam code")

    eff = _effective_status(quiz)
    if eff == QuizStatus.CLOSED.value:
        raise HTTPException(status_code=409, detail="This exam has closed")
    if eff == QuizStatus.DRAFT.value:
        raise HTTPException(status_code=409, detail="This exam is not yet published")

    # Auto-enrol students who join via code, so the standard quiz endpoints work.
    if current.role != Role.ADMIN.value:
        course = await db.get(Course, quiz.course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if course.teacher_id != current.id:
            existing = await db.scalar(
                select(Enrollment).where(
                    Enrollment.user_id == current.id,
                    Enrollment.course_id == quiz.course_id,
                )
            )
            if not existing:
                db.add(Enrollment(user_id=current.id, course_id=quiz.course_id))
                await db.commit()

    return JoinByCodeOut(
        quiz_id=quiz.id,
        course_id=quiz.course_id,
        title=quiz.title,
        duration_min=quiz.duration_min,
        starts_at=quiz.start_at,
        ends_at=quiz.end_at,
        status=eff,  # type: ignore[arg-type]
        exam_mode=bool(quiz.exam_mode),
    )


@router.post("/quizzes/{quiz_id}/regenerate-code", response_model=QuizOut)
async def regenerate_exam_code(
    quiz_id: str, current: CurrentUser, db: Database
) -> QuizOut:
    quiz = await _quiz_or_404(db, quiz_id, with_questions=True)
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can rotate codes")
    from ..models.quiz import _exam_code as _new
    # Retry up to 5x in the unlikely event of a collision.
    for _ in range(5):
        candidate = _new()
        clash = await db.scalar(select(Quiz).where(Quiz.exam_code == candidate, Quiz.id != quiz.id))
        if not clash:
            quiz.exam_code = candidate
            break
    await db.commit()
    await db.refresh(quiz)
    return await _serialize_quiz(db, quiz, current.id)


# ─────────────────────────────────────────────────────
# Attachments — student uploads paper photos for written answers
# ─────────────────────────────────────────────────────

_ALLOWED_ATTACHMENT_MIMES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
}
_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB


def _attempt_upload_folder(attempt_id: str) -> str:
    return f"exam_submissions/{attempt_id}"


@router.post(
    "/attempts/{attempt_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    attempt_id: str,
    current: CurrentUser,
    db: Database,
    question_id: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
) -> AttachmentOut:
    attempt = await db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.student_id != current.id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    if attempt.submitted_at is not None:
        raise HTTPException(status_code=409, detail="Attempt already submitted")

    question = await db.get(Question, question_id)
    if not question or question.quiz_id != attempt.quiz_id:
        raise HTTPException(status_code=404, detail="Question not in this attempt")
    if not question.accepts_attachment:
        raise HTTPException(status_code=400, detail="This question doesn't accept attachments")

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if mime not in _ALLOWED_ATTACHMENT_MIMES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {mime}")

    payload = await file.read()
    if len(payload) > _MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    safe_name = (file.filename or "upload").replace("/", "_").replace("\\", "_")
    fid = str(uuid.uuid4())
    folder = _attempt_upload_folder(attempt_id)

    async def _iter():
        yield payload
        await file.close()

    try:
        stored = await get_storage().save(
            stream=_iter(),
            filename=safe_name,
            mime=mime,
            folder=folder,
            key_hint=fid,
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e)) from None
    except Exception as e:
        log.exception("Attempt attachment upload failed")
        raise HTTPException(status_code=502, detail=f"Upload storage failed: {e}") from None

    att = AttemptAttachment(
        id=fid,
        attempt_id=attempt_id,
        question_id=question_id,
        filename=safe_name,
        path=stored.url,
        mime=mime,
        size=stored.size,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)
    return AttachmentOut.model_validate(att)


@router.delete(
    "/attempts/{attempt_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_attachment(
    attempt_id: str,
    attachment_id: str,
    current: CurrentUser,
    db: Database,
) -> None:
    att = await db.get(AttemptAttachment, attachment_id)
    if not att or att.attempt_id != attempt_id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    attempt = await db.get(Attempt, attempt_id)
    if not attempt or attempt.student_id != current.id:
        raise HTTPException(status_code=403, detail="Not your attachment")
    if attempt.submitted_at is not None:
        raise HTTPException(status_code=409, detail="Attempt already submitted")
    try:
        Path(att.path).unlink(missing_ok=True)
    except OSError:
        pass
    await db.delete(att)
    await db.commit()


@router.get(
    "/attempts/{attempt_id}/attachments",
    response_model=list[AttachmentOut],
)
async def list_attempt_attachments(
    attempt_id: str, current: CurrentUser, db: Database
) -> list[AttachmentOut]:
    attempt = await db.scalar(
        select(Attempt)
        .where(Attempt.id == attempt_id)
        .options(selectinload(Attempt.attachments))
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    quiz = await db.get(Quiz, attempt.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    is_teacher = await _is_teacher(db, quiz.course_id, current)
    if attempt.student_id != current.id and not is_teacher:
        raise HTTPException(status_code=403, detail="Not permitted")
    return [AttachmentOut.model_validate(a) for a in (attempt.attachments or [])]


# ─────────────────────────────────────────────────────
# Question images — teacher uploads diagrams / visual prompts
# ─────────────────────────────────────────────────────

_QUESTION_IMAGE_MIMES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
}
_MAX_QUESTION_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB


def _question_image_folder(question_id: str) -> str:
    return f"question_images/{question_id}"


@router.post(
    "/questions/{question_id}/image",
    response_model=QuestionOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_question_image(
    question_id: str,
    current: CurrentUser,
    db: Database,
    file: Annotated[UploadFile, File(...)],
) -> QuestionOut:
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    quiz = await db.get(Quiz, question.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can attach images")

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/png"
    if mime not in _QUESTION_IMAGE_MIMES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {mime}")
    payload = await file.read()
    if len(payload) > _MAX_QUESTION_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 8 MB)")

    # Replace any prior image so each question only ever has one stored file.
    prior = getattr(question, "image_path", None)
    if prior:
        await get_storage().delete(prior)

    safe_name = (file.filename or "image").replace("/", "_").replace("\\", "_")
    folder = _question_image_folder(question_id)

    async def _iter():
        yield payload
        await file.close()

    try:
        stored = await get_storage().save(
            stream=_iter(),
            filename=safe_name,
            mime=mime,
            folder=folder,
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e)) from None
    except Exception as e:
        log.exception("Question image upload failed")
        raise HTTPException(status_code=502, detail=f"Upload storage failed: {e}") from None

    question.image_path = stored.url
    question.image_mime = mime
    await db.commit()
    await db.refresh(question)
    return _question_out(question)


@router.delete(
    "/questions/{question_id}/image",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_question_image(
    question_id: str, current: CurrentUser, db: Database
) -> None:
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    quiz = await db.get(Quiz, question.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can remove images")

    prior = getattr(question, "image_path", None)
    if prior:
        try:
            Path(prior).unlink(missing_ok=True)
        except OSError:
            pass
    question.image_path = None
    question.image_mime = None
    await db.commit()


@router.get("/questions/{question_id}/image")
async def fetch_question_image(
    question_id: str, current: CurrentUser, db: Database
) -> FileResponse:
    question = await db.get(Question, question_id)
    if not question or not getattr(question, "image_path", None):
        raise HTTPException(status_code=404, detail="No image attached")
    quiz = await db.get(Quiz, question.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    # Anyone enrolled in the course (or the teacher) may fetch the image —
    # students need it to answer the question.
    await assert_enrolled(db, current, quiz.course_id)
    p = Path(question.image_path)
    if not p.exists():
        raise HTTPException(status_code=410, detail="Image no longer available")
    return FileResponse(p, media_type=question.image_mime or "image/png", filename=p.name)


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str, current: CurrentUser, db: Database
) -> FileResponse:
    att = await db.get(AttemptAttachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    attempt = await db.get(Attempt, att.attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    quiz = await db.get(Quiz, attempt.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    is_teacher = await _is_teacher(db, quiz.course_id, current)
    if attempt.student_id != current.id and not is_teacher:
        raise HTTPException(status_code=403, detail="Not permitted")
    p = Path(att.path)
    if not p.exists():
        raise HTTPException(status_code=410, detail="File no longer available")
    return FileResponse(p, media_type=att.mime, filename=att.filename)


# ─────────────────────────────────────────────────────
# Exam folder — teacher review queue
# ─────────────────────────────────────────────────────

@router.get(
    "/quizzes/{quiz_id}/submissions",
    response_model=list[AttemptSummaryOut],
)
async def list_submissions(
    quiz_id: str, current: CurrentUser, db: Database
) -> list[AttemptSummaryOut]:
    quiz = await _quiz_or_404(db, quiz_id)
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can view submissions")
    rows = (
        await db.execute(
            select(Attempt)
            .where(Attempt.quiz_id == quiz_id)
            .options(selectinload(Attempt.attachments), selectinload(Attempt.student))
            .order_by(Attempt.started_at.desc())
        )
    ).scalars().all()

    return [
        AttemptSummaryOut(
            id=a.id,
            quiz_id=a.quiz_id,
            student_id=a.student_id,
            student_name=a.student.name if a.student else "(unknown)",
            started_at=a.started_at,
            submitted_at=a.submitted_at,
            score=a.score,
            max_score=a.max_score,
            needs_manual_grading=a.needs_manual_grading,
            released=bool(getattr(a, "released", False)),
            attachment_count=len(a.attachments or []),
        )
        for a in rows
    ]


@router.post(
    "/attempts/{attempt_id}/grade", response_model=AttemptResultOut
)
async def grade_question(
    attempt_id: str,
    payload: ManualGradeInput,
    current: CurrentUser,
    db: Database,
) -> AttemptResultOut:
    attempt = await db.scalar(
        select(Attempt)
        .where(Attempt.id == attempt_id)
        .options(selectinload(Attempt.attachments))
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    quiz = await _quiz_or_404(db, attempt.quiz_id, with_questions=True)
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can grade")

    by_id = {q.id: q for q in quiz.questions}
    if payload.question_id not in by_id:
        raise HTTPException(status_code=404, detail="Question not in this quiz")
    q = by_id[payload.question_id]
    awarded = max(0, min(int(payload.points), int(q.points)))

    graded = dict(attempt.graded or {})
    prev = graded.get(payload.question_id, {})
    graded[payload.question_id] = {
        **prev,
        "correct": bool(payload.correct) if payload.correct is not None else (awarded >= q.points),
        "points": awarded,
        "max_points": int(q.points),
        "feedback": payload.feedback or prev.get("feedback", ""),
        "auto": False,
        # Once a teacher saves a manual mark we treat the answer as reviewed,
        # even if 0 points were awarded. The teacher made an explicit call.
        "reviewed": True,
        "explanation": prev.get("explanation", q.explanation or ""),
    }
    attempt.graded = graded
    # Final score is the merge of every auto-marked + manually-marked answer.
    attempt.score = sum(int(g.get("points", 0)) for g in graded.values())
    # Manual review is still pending while any non-auto entry is un-reviewed
    # (essay, short_answer, code, or low-confidence NLP — anything the teacher
    # is meant to look at).
    attempt.needs_manual_grading = any(
        not g.get("auto", True) and not g.get("reviewed", False)
        for g in graded.values()
    )
    await db.commit()
    await db.refresh(attempt)
    return _result_payload(attempt, include_unreleased=True)


@router.post(
    "/attempts/{attempt_id}/violations",
    response_model=AttemptResultOut,
)
async def record_violation(
    attempt_id: str,
    payload: ViolationInput,
    current: CurrentUser,
    db: Database,
) -> AttemptResultOut:
    """Append a proctoring violation to the attempt log.

    Called by the lockdown client (tab-blur, fullscreen-exit, copy attempt,
    blocked-shortcut, devtools-open). The server is the source of truth — we
    cap the log at 200 events and stamp the server clock so a misbehaving
    client can't backdate or spam.
    """
    attempt = await db.scalar(
        select(Attempt)
        .where(Attempt.id == attempt_id)
        .options(selectinload(Attempt.attachments))
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.student_id != current.id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    if attempt.submitted_at is not None:
        # We still 200 here so the client doesn't keep retrying after submit;
        # the violation is just dropped.
        return _result_payload(attempt, include_unreleased=True)

    log = list(getattr(attempt, "violations", None) or [])
    if len(log) >= 200:
        # Don't grow forever — drop the oldest.
        log = log[-199:]
    log.append(
        {
            "type": payload.type[:64],
            "at": datetime.now(timezone.utc).isoformat(),
            "extra": payload.extra or {},
        }
    )
    attempt.violations = log
    await db.commit()
    await db.refresh(attempt)
    return _result_payload(attempt, include_unreleased=True)


@router.post(
    "/attempts/{attempt_id}/release", response_model=AttemptResultOut
)
async def release_attempt(
    attempt_id: str,
    payload: ReleaseInput,
    current: CurrentUser,
    db: Database,
) -> AttemptResultOut:
    attempt = await db.scalar(
        select(Attempt)
        .where(Attempt.id == attempt_id)
        .options(selectinload(Attempt.attachments))
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    quiz = await _quiz_or_404(db, attempt.quiz_id)
    if not await _is_teacher(db, quiz.course_id, current):
        raise HTTPException(status_code=403, detail="Only the course teacher can release results")
    attempt.released = True
    attempt.teacher_feedback = payload.teacher_feedback or ""
    await db.commit()
    await db.refresh(attempt)
    return _result_payload(attempt, include_unreleased=True)
