"""Study Buddy AI service.

Reuses the existing `get_llm()` provider + `hybrid_retrieve` RAG layer from the
chat pipeline to power three learner-centric features:

  1. Flashcard generation from course materials.
  2. "Why is this wrong?" explanations on missed quiz items.
  3. Practice-mode infinite question generation.

All three return JSON or stream plain text — no separate model wiring needed.
"""
from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from ..models.course import Course
from ..models.quiz import Question
from .llm import Message, get_llm
from .rag_service import hybrid_retrieve
from .vector_store import all_documents

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────
# Flashcards
# ─────────────────────────────────────────────────────

_FLASHCARD_SYSTEM = (
    "You generate flashcards for university students from course materials. The user "
    "will provide numbered sources. Output a STRICT JSON array with no surrounding "
    "prose. Each element is an object with these fields:\n"
    "  front: short prompt or term (≤ 120 chars). Plain text, no leading 'Q:'.\n"
    "  back:  concise definition / answer (≤ 320 chars). Plain text, no leading 'A:'.\n"
    "  source: integer index of the source you drew from (1-based).\n\n"
    "Constraints:\n"
    "- Exactly the requested number of flashcards.\n"
    "- Cover distinct concepts; do not repeat.\n"
    "- Prefer atomic facts, definitions, formulas, mechanisms — not trivia.\n"
    "- Output JSON only. Do not wrap in fences."
)


async def generate_flashcards(
    course: Course,
    count: int,
    instructions: str = "",
) -> list[dict[str, Any]]:
    """Returns a list of {front, back, source_filename, source_page} entries."""
    docs = list(all_documents(course.collection_name, limit=14))
    if not docs:
        return []

    sources_block = "\n\n".join(
        f"[{i + 1}] {(d['metadata'] or {}).get('filename', 'unknown')} "
        f"(page {(d['metadata'] or {}).get('page', 0)})\n{d['document']}"
        for i, d in enumerate(docs)
    )

    user_prompt = (
        f"Course: {course.name}\n"
        f"Number of flashcards: {count}\n"
        f"Extra instructions: {instructions or '(none)'}\n\n"
        f"## Sources\n{sources_block}"
    )

    llm = get_llm()
    parts: list[str] = []
    async for delta in llm.stream_completion(
        [Message(role="system", content=_FLASHCARD_SYSTEM), Message(role="user", content=user_prompt)],
        temperature=0.4,
        max_tokens=2200,
    ):
        parts.append(delta)
    raw = "".join(parts).strip()

    cards = _safe_parse_flashcards(raw)
    if not cards:
        log.warning("LLM did not return valid flashcard JSON; falling back to deterministic stub")
        cards = _fallback_flashcards(docs, count)

    # Stamp each card with a real filename + page from the cited source.
    out: list[dict[str, Any]] = []
    for c in cards[:count]:
        src_idx = max(1, min(int(c.get("source", 1) or 1), len(docs))) - 1
        meta = docs[src_idx].get("metadata") or {}
        out.append(
            {
                "front": str(c.get("front", "")).strip(),
                "back": str(c.get("back", "")).strip(),
                "source_filename": str(meta.get("filename", "")),
                "source_page": int(meta.get("page", 0) or 0),
            }
        )
    return [c for c in out if c["front"] and c["back"]]


def _safe_parse_flashcards(raw: str) -> list[dict[str, Any]]:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[[\s\S]*\]", raw)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    return [d for d in data if isinstance(d, dict)]


def _fallback_flashcards(docs: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    """Crude deterministic fallback when the LLM is unavailable: split each chunk
    into the first sentence (term) and the rest (definition)."""
    out: list[dict[str, Any]] = []
    for d in docs[:count]:
        text = d.get("document", "")
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        if len(sentences) < 2:
            continue
        out.append(
            {
                "front": sentences[0][:120],
                "back": " ".join(sentences[1:3])[:320],
                "source": 1,
            }
        )
    return out


# ─────────────────────────────────────────────────────
# "Why is this wrong?" explanations
# ─────────────────────────────────────────────────────

_EXPLAIN_SYSTEM = (
    "You are a patient tutor explaining why a student's answer was incorrect. The "
    "user supplies the question, the student's answer, the correct answer, and "
    "numbered course sources. Respond in 4-7 short sentences using GitHub-flavored "
    "Markdown. Structure your answer as:\n"
    "1. **Why your answer was off** — one sentence on the misconception.\n"
    "2. **The right idea** — clear restatement, citing sources [n].\n"
    "3. **A worked check** — a small example or test the student can run.\n\n"
    "Be encouraging. Never berate. Cite sources only when they exist."
)


async def explain_wrong_answer(
    course: Course,
    question: Question,
    student_text: str,
    student_selected: list[int],
) -> AsyncIterator[str]:
    """Yields plain-text deltas for an explanation, with retrieved sources prepended
    to the system prompt. The router can wrap this in SSE if it wants streaming."""
    # Retrieve relevant chunks for the question body.
    chunks = await _retrieve_async(course, question.body)

    sources_block_parts: list[str] = []
    for i, ch in enumerate(chunks, start=1):
        sources_block_parts.append(
            f"[{i}] {ch.filename} (page {ch.page})\n{ch.document.strip()}"
        )
    sources_block = "\n\n".join(sources_block_parts) if sources_block_parts else "(no sources retrieved)"

    # Render the student's answer in a way the LLM can read for either MCQ or written.
    if student_text.strip():
        student_repr = student_text.strip()
    elif student_selected:
        opt_repr = ", ".join(
            (question.options or [])[i] if 0 <= i < len(question.options or []) else f"#{i}"
            for i in student_selected
        )
        student_repr = f"(selected: {opt_repr})"
    else:
        student_repr = "(no answer)"

    correct_repr = _correct_repr(question)

    user_prompt = (
        f"## Question\n{question.body}\n\n"
        f"## Student's answer\n{student_repr}\n\n"
        f"## Correct answer\n{correct_repr}\n\n"
        f"## Sources\n{sources_block}"
    )

    llm = get_llm()
    async for delta in llm.stream_completion(
        [
            Message(role="system", content=_EXPLAIN_SYSTEM),
            Message(role="user", content=user_prompt),
        ],
        temperature=0.4,
        max_tokens=600,
    ):
        if delta:
            yield delta


def _correct_repr(question: Question) -> str:
    correct = list(question.correct or [])
    qtype = question.type
    if qtype in {"mcq_single", "mcq_multi", "true_false"}:
        opts = question.options or []
        names = [opts[i] for i in correct if isinstance(i, int) and 0 <= i < len(opts)]
        return ", ".join(names) if names else "(unspecified)"
    if qtype in {"short_answer", "essay", "code"}:
        text = [str(c) for c in correct if isinstance(c, str) and c.strip()]
        return " · ".join(text) if text else "(model answer not provided)"
    return "(unspecified)"


async def _retrieve_async(course: Course, query: str):
    import asyncio
    return await asyncio.to_thread(hybrid_retrieve, course, query, None, None)


# ─────────────────────────────────────────────────────
# Practice-mode question generator
# ─────────────────────────────────────────────────────

_PRACTICE_SYSTEM = (
    "You write a SINGLE practice question for a university student to drill on. "
    "The user provides numbered course sources. Output a STRICT JSON object with "
    "these fields:\n"
    "  type: one of 'mcq_single' | 'true_false'\n"
    "  body: question text (markdown allowed)\n"
    "  options: array of 4 option strings (or ['True','False']).\n"
    "  correct: array with the 0-based index of the correct option.\n"
    "  explanation: 1-2 sentences citing [n] sources.\n\n"
    "Constraints: ground in the supplied sources. No JSON wrapping. No extra prose."
)


async def generate_practice_question(
    course: Course,
    instructions: str = "",
) -> dict[str, Any] | None:
    docs = list(all_documents(course.collection_name, limit=8))
    if not docs:
        return None

    sources_block = "\n\n".join(
        f"[{i + 1}] {(d['metadata'] or {}).get('filename', 'unknown')} "
        f"(page {(d['metadata'] or {}).get('page', 0)})\n{d['document']}"
        for i, d in enumerate(docs)
    )

    user_prompt = (
        f"Course: {course.name}\n"
        f"Extra instructions: {instructions or '(any topic from the sources)'}\n\n"
        f"## Sources\n{sources_block}"
    )

    llm = get_llm()
    parts: list[str] = []
    async for delta in llm.stream_completion(
        [
            Message(role="system", content=_PRACTICE_SYSTEM),
            Message(role="user", content=user_prompt),
        ],
        temperature=0.7,
        max_tokens=600,
    ):
        parts.append(delta)
    raw = "".join(parts).strip()

    return _safe_parse_one_question(raw) or _fallback_practice(docs)


def _safe_parse_one_question(raw: str) -> dict[str, Any] | None:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    qtype = str(data.get("type", "")).strip()
    if qtype not in {"mcq_single", "true_false"}:
        return None
    body = str(data.get("body", "")).strip()
    if not body:
        return None
    opts = data.get("options", [])
    if not isinstance(opts, list) or not opts:
        return None
    correct = data.get("correct", [])
    if not isinstance(correct, list) or not correct:
        return None
    return {
        "type": qtype,
        "body": body,
        "options": [str(o) for o in opts],
        "correct": [int(c) for c in correct if isinstance(c, (int, float))],
        "explanation": str(data.get("explanation", ""))[:1000],
    }


def _fallback_practice(docs: list[dict[str, Any]]) -> dict[str, Any]:
    d = docs[0]
    meta = d.get("metadata") or {}
    sentence = re.split(r"(?<=[.!?])\s+", d["document"].strip())[0][:240]
    return {
        "type": "true_false",
        "body": f"True or false: {sentence}",
        "options": ["True", "False"],
        "correct": [0],
        "explanation": f"Stated in {meta.get('filename', 'the materials')} (page {meta.get('page', 1)}).",
    }


# ─────────────────────────────────────────────────────
# SM-2 spaced repetition update (used by the router on review)
# ─────────────────────────────────────────────────────

def sm2_update(card, quality: int) -> None:
    """Mutates the Flashcard in-place per SM-2.

    `quality`: 0 = blackout, 1 = wrong-but-remembered-on-seeing-answer,
    2 = wrong-easy-recall, 3 = correct-with-difficulty, 4 = correct-after-hesitation,
    5 = perfect. We treat 0..2 as "lapse" and reset interval to 1 day.
    """
    from datetime import datetime, timedelta, timezone

    quality = max(0, min(5, int(quality)))
    if quality < 3:
        card.interval_days = 1
        card.review_count = 0
    else:
        if card.review_count == 0:
            card.interval_days = 1
        elif card.review_count == 1:
            card.interval_days = 6
        else:
            card.interval_days = max(1, round(card.interval_days * card.ease))
        card.review_count = int(card.review_count or 0) + 1
        card.ease = max(
            1.3,
            float(card.ease)
            + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
        )
    now = datetime.now(timezone.utc)
    card.last_reviewed_at = now
    card.due_at = now + timedelta(days=card.interval_days)
