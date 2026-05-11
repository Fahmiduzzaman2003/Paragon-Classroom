from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..models.course import Course
from .llm import Message, get_llm
from .vector_store import all_documents

log = logging.getLogger(__name__)


SYSTEM = (
    "You generate practice quizzes for university courses. The user will provide course "
    "context as numbered sources. Produce a STRICT JSON array with no surrounding prose. "
    "Each element is an object with the following fields:\n"
    "  type: one of 'mcq_single' | 'mcq_multi' | 'true_false' | 'short_answer'\n"
    "  body: question text (markdown allowed)\n"
    "  options: array of 4 strings (for mcq_*); 'True/False' uses ['True','False']; "
    "    use [] for short_answer\n"
    "  correct: for mcq_*: array of 0-based indices into options.\n"
    "           for true_false: [0] for True, [1] for False.\n"
    "           for short_answer: array of 1-3 short accepted-answer strings.\n"
    "  points: integer 5..15\n"
    "  explanation: 1-2 sentence rationale citing sources by [n] markers\n\n"
    "Constraints:\n"
    "- Ground every question in the supplied sources.\n"
    "- No more than ONE essay-style question per quiz.\n"
    "- Vary difficulty.\n"
    "- Output JSON only. Do not wrap in ```json fences."
)


async def generate_quiz_questions(
    course: Course,
    num_questions: int,
    types: list[str],
    instructions: str,
) -> list[dict[str, Any]]:
    # Pull a sample of the course's chunks as context. We grab the first 12 by upload
    # order — reasonable for a class-sized collection; could be replaced with a
    # diversity-based sampler later.
    docs = list(all_documents(course.collection_name, limit=12))
    if not docs:
        return []

    sources_block = "\n\n".join(
        f"[{i+1}] {(d['metadata'] or {}).get('filename', 'unknown')} "
        f"(page {(d['metadata'] or {}).get('page', 0)})\n{d['document']}"
        for i, d in enumerate(docs)
    )

    user_prompt = (
        f"Course: {course.name}\n"
        f"Allowed types: {', '.join(types) or 'mcq_single, true_false, short_answer'}\n"
        f"Number of questions: {num_questions}\n"
        f"Extra instructions: {instructions or '(none)'}\n\n"
        f"## Sources\n{sources_block}"
    )

    llm = get_llm()
    parts: list[str] = []
    async for delta in llm.stream_completion(
        [Message(role="system", content=SYSTEM), Message(role="user", content=user_prompt)],
        temperature=0.3,
        max_tokens=2000,
    ):
        parts.append(delta)
    raw = "".join(parts).strip()

    questions = _safe_parse_questions(raw)
    if not questions:
        # Fall back to a deterministic mock from the first sources so the demo never breaks.
        log.warning("LLM did not return valid quiz JSON; falling back to deterministic stub")
        questions = _fallback_questions(docs, num_questions)
    return questions[:num_questions]


def _safe_parse_questions(raw: str) -> list[dict[str, Any]]:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Try extracting the first JSON array we can find
        m = re.search(r"\[[\s\S]*\]", raw)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []

    if not isinstance(data, list):
        return []

    out: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        qtype = str(item.get("type", "")).strip()
        if qtype not in {"mcq_single", "mcq_multi", "true_false", "short_answer", "code", "essay"}:
            continue
        body = str(item.get("body", "")).strip()
        if not body:
            continue
        options = item.get("options", [])
        if not isinstance(options, list):
            options = []
        correct = item.get("correct", [])
        if not isinstance(correct, list):
            correct = []
        out.append(
            {
                "type": qtype,
                "body": body,
                "options": [str(o) for o in options],
                "correct": correct,
                "points": int(item.get("points", 10) or 10),
                "explanation": str(item.get("explanation", ""))[:1500],
            }
        )
    return out


def _fallback_questions(
    docs: list[dict[str, Any]], num_questions: int
) -> list[dict[str, Any]]:
    """Deterministic stub if the LLM is unavailable. Crafts simple yes/no questions
    from the first sentence of each chunk, citing the source page."""
    out: list[dict[str, Any]] = []
    for d in docs[:num_questions]:
        meta = d.get("metadata") or {}
        first_sentence = re.split(r"(?<=[.!?])\s+", d["document"])[0]
        first_sentence = first_sentence[:240]
        out.append(
            {
                "type": "true_false",
                "body": f"True or false: {first_sentence}",
                "options": ["True", "False"],
                "correct": [0],
                "points": 10,
                "explanation": f"Stated in {meta.get('filename', 'the materials')} (page {meta.get('page', 1)}).",
            }
        )
    return out
