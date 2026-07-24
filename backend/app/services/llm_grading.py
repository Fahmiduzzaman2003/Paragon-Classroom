"""Rubric-driven LLM grading for written/essay answers.

Uses the provider-agnostic orchestrator's JSON mode (schema-validated, with one
repair attempt) so a grade is a structured, auditable object — not free text.
Falls back to ``None`` when no real provider is configured or every provider in
the chain fails, so the caller can route the answer to the manual-review queue.
"""

from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from ..config import settings
from .llm import Message, complete_json, has_real_provider
from .llm.errors import LLMQuotaError, LLMUnavailableError

log = logging.getLogger(__name__)


class CriterionScore(BaseModel):
    name: str = ""
    score: float = 0.0
    max: float = 0.0
    comment: str = ""


class EssayGrade(BaseModel):
    score: float = Field(default=0.0)
    criteria: list[CriterionScore] = Field(default_factory=list)
    justification: str = ""


class LLMGradeResult(BaseModel):
    points: int
    max_points: int
    criteria: list[CriterionScore]
    justification: str
    model_used: str
    rubric_version: str


async def grade_written_answer(
    *,
    question: str,
    student_answer: str,
    model_answers: list[str],
    max_points: int,
    user_id: str | None = None,
) -> LLMGradeResult | None:
    """Grade one written answer against a rubric. Returns ``None`` to signal
    "route to manual review" (no real provider, or grading failed/validation)."""
    if not has_real_provider() or not student_answer.strip():
        return None

    reference = "\n".join(f"- {m}" for m in model_answers if m.strip()) or "(none provided)"
    system = Message(
        role="system",
        content=(
            "You are a strict, fair exam grader. Grade the student's answer against the "
            "reference/rubric. Award partial credit for partially-correct answers. "
            f"The maximum score is {max_points} points.\n"
            "Return JSON with: score (number 0..max), criteria (list of {name, score, max, "
            "comment}), justification (short string). Do not exceed the maximum score."
        ),
    )
    user = Message(
        role="user",
        content=(
            f"QUESTION:\n{question}\n\n"
            f"REFERENCE / MODEL ANSWER(S):\n{reference}\n\n"
            f"STUDENT ANSWER:\n{student_answer}\n\n"
            f"Grade out of {max_points}."
        ),
    )

    try:
        grade, res = await complete_json(
            [system, user], schema=EssayGrade, user_id=user_id, max_tokens=700, temperature=0.0
        )
    except (LLMUnavailableError, LLMQuotaError) as e:
        log.info("LLM grading unavailable (%s) — deferring to manual review", type(e).__name__)
        return None
    except Exception as e:  # noqa: BLE001 — never fail the submission over grading
        log.warning("LLM grading error (%s) — deferring to manual review", e)
        return None

    # Clamp defensively — never trust a model to stay in range.
    points = int(round(max(0.0, min(float(max_points), float(grade.score)))))
    return LLMGradeResult(
        points=points,
        max_points=max_points,
        criteria=grade.criteria,
        justification=grade.justification.strip()[:2000],
        model_used=res.provider + ":" + res.model_used,
        rubric_version=settings.grading_rubric_version,
    )
