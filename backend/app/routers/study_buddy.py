"""Study Buddy AI router.

Three feature surfaces, all reusing the existing LLM provider + RAG layer:

  * /courses/{id}/flashcards/...         — spaced-repetition flashcards
  * /attempts/{id}/explain/{question_id} — "why is this wrong?" stream
  * /courses/{id}/practice/next          — one-off practice question
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..dependencies import CurrentUser, Database, assert_enrolled
from ..models.course import Course
from ..models.flashcard import Flashcard
from ..models.quiz import Attempt, Question
from ..schemas.study_buddy import (
    FlashcardCreateInput,
    FlashcardGenerateInput,
    FlashcardOut,
    FlashcardReviewInput,
    PracticeQuestion,
    PracticeRequest,
)
from ..services.study_buddy import (
    explain_wrong_answer,
    generate_flashcards,
    generate_practice_question,
    sm2_update,
)

log = logging.getLogger(__name__)
router = APIRouter()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ─────────────────────────────────────────────────────
# Flashcards
# ─────────────────────────────────────────────────────

@router.get("/courses/{course_id}/flashcards", response_model=list[FlashcardOut])
async def list_flashcards(
    course_id: str, current: CurrentUser, db: Database
) -> list[FlashcardOut]:
    await assert_enrolled(db, current, course_id)
    rows = (await db.execute(
        select(Flashcard)
        .where(Flashcard.course_id == course_id, Flashcard.user_id == current.id)
        .order_by(Flashcard.due_at.asc())
    )).scalars().all()
    return [FlashcardOut.model_validate(c) for c in rows]


@router.get("/courses/{course_id}/flashcards/due", response_model=list[FlashcardOut])
async def list_due_flashcards(
    course_id: str, current: CurrentUser, db: Database
) -> list[FlashcardOut]:
    """Cards whose due_at has elapsed — these are what the review session shows."""
    await assert_enrolled(db, current, course_id)
    now = datetime.now(timezone.utc)
    rows = (await db.execute(
        select(Flashcard)
        .where(
            Flashcard.course_id == course_id,
            Flashcard.user_id == current.id,
            Flashcard.due_at <= now,
        )
        .order_by(Flashcard.due_at.asc())
    )).scalars().all()
    return [FlashcardOut.model_validate(c) for c in rows]


@router.post(
    "/courses/{course_id}/flashcards/generate",
    response_model=list[FlashcardOut],
)
async def generate_course_flashcards(
    course_id: str,
    payload: FlashcardGenerateInput,
    current: CurrentUser,
    db: Database,
) -> list[FlashcardOut]:
    """Generate N new flashcards from the course materials and persist them for
    the current user. Idempotent on text — duplicates are skipped."""
    await assert_enrolled(db, current, course_id)
    course = await db.scalar(select(Course).where(Course.id == course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    cards = await generate_flashcards(course, payload.count, payload.instructions)
    if not cards:
        raise HTTPException(
            status_code=409,
            detail="No course materials are indexed yet — upload at least one file first.",
        )

    # Skip cards we already have for this user (cheap dedupe by `front`).
    existing_fronts = set(
        (await db.execute(
            select(Flashcard.front).where(
                Flashcard.course_id == course_id, Flashcard.user_id == current.id
            )
        )).scalars().all()
    )

    saved: list[Flashcard] = []
    for c in cards:
        if c["front"] in existing_fronts:
            continue
        existing_fronts.add(c["front"])
        row = Flashcard(
            course_id=course_id,
            user_id=current.id,
            front=c["front"],
            back=c["back"],
            source_filename=c.get("source_filename", "") or "",
            source_page=int(c.get("source_page", 0) or 0),
        )
        db.add(row)
        saved.append(row)
    await db.commit()
    for r in saved:
        await db.refresh(r)
    return [FlashcardOut.model_validate(r) for r in saved]


@router.post(
    "/courses/{course_id}/flashcards",
    response_model=FlashcardOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_flashcard(
    course_id: str,
    payload: FlashcardCreateInput,
    current: CurrentUser,
    db: Database,
) -> FlashcardOut:
    """Manual create — students can add their own cards too."""
    await assert_enrolled(db, current, course_id)
    row = Flashcard(
        course_id=course_id,
        user_id=current.id,
        front=payload.front,
        back=payload.back,
        source_filename=payload.source_filename,
        source_page=payload.source_page,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return FlashcardOut.model_validate(row)


@router.post("/flashcards/{card_id}/review", response_model=FlashcardOut)
async def review_flashcard(
    card_id: str,
    payload: FlashcardReviewInput,
    current: CurrentUser,
    db: Database,
) -> FlashcardOut:
    card = await db.get(Flashcard, card_id)
    if not card or card.user_id != current.id:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    sm2_update(card, payload.quality)
    await db.commit()
    await db.refresh(card)
    return FlashcardOut.model_validate(card)


@router.delete(
    "/flashcards/{card_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_flashcard(
    card_id: str, current: CurrentUser, db: Database
) -> None:
    card = await db.get(Flashcard, card_id)
    if not card or card.user_id != current.id:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    await db.delete(card)
    await db.commit()


# ─────────────────────────────────────────────────────
# "Why is this wrong?" — streamed explanation
# ─────────────────────────────────────────────────────

@router.post("/attempts/{attempt_id}/explain/{question_id}")
async def explain_question(
    attempt_id: str,
    question_id: str,
    current: CurrentUser,
    db: Database,
):
    from ..models.quiz import Quiz

    attempt = await db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    question = await db.get(Question, question_id)
    if not question or question.quiz_id != attempt.quiz_id:
        raise HTTPException(status_code=404, detail="Question not in this attempt")
    quiz = await db.get(Quiz, question.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    course = await db.scalar(
        select(Course)
        .where(Course.id == quiz.course_id)
        .options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Either the student themselves, the course teacher, or an admin may ask.
    is_owner = attempt.student_id == current.id
    is_teacher = course.teacher_id == current.id or current.role == "admin"
    if not (is_owner or is_teacher):
        raise HTTPException(status_code=403, detail="Not permitted")

    # Pull the student's recorded answer from the attempt's JSON state.
    answers = attempt.answers or {}
    ans_for_q = answers.get(question_id) or {}
    student_text = str(ans_for_q.get("text") or "")
    student_selected = list(ans_for_q.get("selected") or [])

    async def event_stream():
        yield _sse("start", {"question_id": question_id, "attempt_id": attempt_id})
        try:
            async for delta in explain_wrong_answer(
                course=course,
                question=question,
                student_text=student_text,
                student_selected=student_selected,
            ):
                yield _sse("delta", {"text": delta})
                await asyncio.sleep(0)
            yield _sse("done", {})
        except asyncio.CancelledError:
            log.info("Client cancelled explain stream attempt=%s", attempt_id)
            raise
        except Exception as e:  # noqa: BLE001
            log.exception("explain_wrong_answer failure: %s", e)
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────────────────
# Practice mode — single-question generator
# ─────────────────────────────────────────────────────

@router.post("/courses/{course_id}/practice/next", response_model=PracticeQuestion)
async def practice_next(
    course_id: str,
    payload: PracticeRequest,
    current: CurrentUser,
    db: Database,
) -> PracticeQuestion:
    await assert_enrolled(db, current, course_id)
    course = await db.scalar(select(Course).where(Course.id == course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    q = await generate_practice_question(course, payload.instructions)
    if not q:
        raise HTTPException(
            status_code=409,
            detail="No course materials are indexed yet — upload at least one file first.",
        )
    return PracticeQuestion(**q)
