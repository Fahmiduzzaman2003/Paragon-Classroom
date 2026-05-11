from __future__ import annotations

import re
from dataclasses import dataclass

from ..models.quiz import Question, QuestionType
from .nlp_grading import score_written

# Auto-grade threshold for written answers. Above this, we award full marks
# automatically. Between LOW and HIGH we award proportional credit but still
# flag the answer for teacher confirmation. Below LOW we send to manual review.
_NLP_HIGH = 0.78
_NLP_LOW = 0.40


@dataclass(slots=True)
class GradedAnswer:
    correct: bool
    points: int
    max_points: int
    feedback: str
    auto: bool
    explanation: str


def grade_answer(
    question: Question,
    selected: list[int],
    text: str,
) -> GradedAnswer:
    """Auto-grade a single answer. Essay questions return auto=False (manual)."""
    qtype = question.type
    correct: list = list(question.correct or [])
    max_points = int(question.points)
    explanation = question.explanation or ""

    def res(is_correct: bool, awarded: int | None = None, feedback: str = "") -> GradedAnswer:
        pts = max_points if is_correct else 0
        if awarded is not None:
            pts = awarded
        return GradedAnswer(
            correct=is_correct,
            points=pts,
            max_points=max_points,
            feedback=feedback,
            auto=True,
            explanation=explanation,
        )

    if qtype == QuestionType.ESSAY.value:
        # Essays without model answers stay manual. With model answers we still
        # send the result to the teacher's queue but provide an NLP suggested
        # score they can override in one click.
        ref = [r for r in correct if isinstance(r, str)]
        if ref and text.strip():
            nlp = score_written(text, ref)
            suggested = round(max_points * nlp.similarity)
            return GradedAnswer(
                correct=False,
                points=0,
                max_points=max_points,
                feedback=f"Pending teacher review · suggested {suggested}/{max_points} (NLP {nlp.similarity:.2f})",
                auto=False,
                explanation=explanation,
            )
        return GradedAnswer(
            correct=False,
            points=0,
            max_points=max_points,
            feedback="Pending teacher review",
            auto=False,
            explanation=explanation,
        )

    if qtype == QuestionType.MCQ_SINGLE.value or qtype == QuestionType.TRUE_FALSE.value:
        chosen = selected[0] if selected else -1
        target = correct[0] if correct else -1
        return res(chosen == target)

    if qtype == QuestionType.MCQ_MULTI.value:
        chosen = set(selected or [])
        target = set(correct or [])
        if not target:
            return res(False, feedback="No correct option configured")
        # Partial credit: (|chosen ∩ target| − |chosen − target|) / |target|, clamped at 0..1.
        right = len(chosen & target)
        wrong = len(chosen - target)
        ratio = max(0.0, (right - wrong) / max(1, len(target)))
        awarded = round(max_points * ratio)
        is_correct = chosen == target
        return res(is_correct, awarded=awarded, feedback="Partial credit applied" if awarded and not is_correct else "")

    if qtype == QuestionType.SHORT_ANSWER.value:
        if not text.strip():
            return res(False, feedback="No answer provided")
        ans_lower = text.strip().lower()
        # Fast path: exact substring still wins outright.
        for accepted in correct:
            if not isinstance(accepted, str):
                continue
            if accepted.strip() and accepted.strip().lower() in ans_lower:
                return res(True, feedback="Matched expected answer")
        # NLP path: similarity scoring for paraphrased / partially-correct.
        ref = [r for r in correct if isinstance(r, str) and r.strip()]
        if ref:
            nlp = score_written(text, ref)
            sim = nlp.similarity
            if sim >= _NLP_HIGH:
                return res(True, feedback=f"NLP match (similarity {sim:.2f})")
            if sim >= _NLP_LOW:
                awarded = round(max_points * sim)
                # Confident enough to auto-grade with partial credit.
                return GradedAnswer(
                    correct=False,
                    points=awarded,
                    max_points=max_points,
                    feedback=f"Partial credit by NLP (similarity {sim:.2f})"
                    + (f" · keywords: {', '.join(nlp.matched_keywords[:5])}" if nlp.matched_keywords else ""),
                    auto=nlp.confidence >= 0.6,
                    explanation=explanation,
                )
        return res(False, feedback="No matching answer detected")

    if qtype == QuestionType.CODE.value:
        if not text.strip():
            return res(False, feedback="No answer provided")
        for pattern in correct:
            if not isinstance(pattern, str):
                continue
            try:
                if re.search(pattern, text, re.MULTILINE):
                    return res(True)
            except re.error:
                # Fallback to substring check if pattern is invalid
                if pattern in text:
                    return res(True)
        return res(False)

    # Unknown type — treat as manual.
    return GradedAnswer(
        correct=False,
        points=0,
        max_points=max_points,
        feedback="Unsupported question type",
        auto=False,
        explanation=explanation,
    )
