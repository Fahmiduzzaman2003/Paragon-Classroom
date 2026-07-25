from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from rank_bm25 import BM25Okapi

from ..config import settings
from ..models.course import Course
from .llm import Message
from .vector_store import all_documents, query as vector_query

log = logging.getLogger(__name__)


# Named presets → a grounding level (0–100). The UI slider is continuous; these
# are just the three snap points.
_MODE_GROUNDING: dict[str, int] = {"strict": 95, "balanced": 50, "open": 20}


def resolve_grounding(
    grounding: int | None, rag_mode: str | None, course_mode: str | None
) -> int:
    """Resolve the effective grounding level (0–100). An explicit numeric
    `grounding` (the UI slider) wins; otherwise fall back to the named mode, then
    the course default, then balanced."""
    if grounding is not None:
        return max(0, min(100, int(grounding)))
    mode = (rag_mode or course_mode or "balanced").lower()
    return _MODE_GROUNDING.get(mode, 50)


def _grounding_instruction(level: int) -> str:
    """Turn a 0–100 grounding level into a retrieval-policy instruction. Higher =
    stay closer to the course sources; lower = lean on general knowledge.

    Note the deliberate anti-false-refusal wording in strict mode: the earlier
    version primed "I could not find this" so strongly that the model refused
    even when the answer WAS in the sources (e.g. matching "naeem" to the full
    name "Golam Mostofa Naeem"). Strict now insists on a careful read first and
    reserves the refusal for genuine absence."""
    lvl = max(0, min(100, int(level)))
    src, gen = lvl, 100 - lvl
    if lvl >= 75:
        return (
            "Answer strictly from the provided course sources. Read ALL of the excerpts carefully "
            "before deciding anything — the answer is very often present even when the question uses "
            "different, partial, or informal wording (for example a first name where a source gives "
            "the full name), or when it is spread across several excerpts. If the sources support an "
            "answer, give it directly and cite the relevant ones with [n]. Reserve the exact sentence "
            '"I could not find this in the course materials." for the case where, after a genuine '
            "careful read, the sources truly contain nothing relevant. Do not add facts that are not "
            "in the sources."
        )
    if lvl <= 25:
        return (
            "Answer primarily from your broad general knowledge, giving a complete and genuinely "
            "helpful explanation. Use the provided course sources as supporting context wherever they "
            "are relevant and cite them with [n] — but do not limit yourself to them, and never refuse "
            "just because the sources are thin."
        )
    return (
        f"Use BOTH the provided course sources and your general knowledge, weighted roughly {src}% "
        f"toward the sources and {gen}% toward general knowledge. Read the sources carefully and prefer "
        f"them for anything they cover — matching partial or informal phrasing in the question to what "
        f"they actually say — and cite them with [n]. Use general knowledge to add context or fill "
        f'gaps, marking those claims "(general knowledge)". Do not refuse when the sources are thin; '
        f"answer from general knowledge instead."
    )


@dataclass(slots=True)
class RetrievedChunk:
    material_id: str
    filename: str
    page: int
    chunk_index: int
    document: str
    score: float
    source_url: str = ""


def _tokenize(s: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+", s.lower())


def hybrid_retrieve(
    course: Course,
    question: str,
    top_k: int = None,  # type: ignore[assignment]
    scoped_material_id: str | None = None,
) -> list[RetrievedChunk]:
    """Vector search + BM25 keyword re-rank, merged via reciprocal rank fusion."""
    k = top_k or settings.rag_top_k
    where = {"material_id": scoped_material_id} if scoped_material_id else None

    # 1) Vector search
    v_hits = vector_query(course.collection_name, question, top_k=max(k * 2, 12), where=where)

    # 2) BM25 over the same collection (pulled lazily; cheap for class-sized collections).
    all_docs: list[dict[str, Any]] = list(all_documents(course.collection_name))
    if scoped_material_id:
        all_docs = [d for d in all_docs if d["metadata"].get("material_id") == scoped_material_id]

    bm25_scores: dict[str, float] = {}
    if all_docs:
        tokenized = [_tokenize(d["document"]) for d in all_docs]
        bm25 = BM25Okapi(tokenized)
        q_tokens = _tokenize(question)
        if q_tokens:
            raw = bm25.get_scores(q_tokens)
            if len(raw):
                m = float(max(raw))
                if m > 0:
                    for d, s in zip(all_docs, raw):
                        bm25_scores[d["id"]] = float(s) / m

    # 3) Reciprocal-rank fusion
    v_rank = {h["id"]: i for i, h in enumerate(v_hits)}
    by_id: dict[str, dict[str, Any]] = {h["id"]: h for h in v_hits}
    for d in all_docs:
        by_id.setdefault(d["id"], {
            "id": d["id"],
            "document": d["document"],
            "metadata": d["metadata"],
            "score": 0.0,
        })
    b_rank = {
        did: i
        for i, did in enumerate(sorted(bm25_scores, key=bm25_scores.get, reverse=True))  # type: ignore[arg-type]
    }

    fused: list[tuple[str, float]] = []
    C = 60.0
    for did in by_id:
        rrf = 0.0
        if did in v_rank:
            rrf += 1.0 / (C + v_rank[did])
        if did in b_rank:
            rrf += 1.0 / (C + b_rank[did])
        # Slight boost from normalized absolute scores to break ties
        rrf += 0.05 * by_id[did].get("score", 0.0)
        rrf += 0.05 * bm25_scores.get(did, 0.0)
        fused.append((did, rrf))
    fused.sort(key=lambda t: t[1], reverse=True)

    top_ids = [did for did, _ in fused[:k]]

    floor = settings.rag_similarity_floor
    chunks: list[RetrievedChunk] = []
    for did in top_ids:
        hit = by_id[did]
        meta = hit["metadata"] or {}
        # Prefer vector score (it's bounded [0,1]); fall back to BM25-normalised.
        display_score = by_id[did].get("score", 0.0) or bm25_scores.get(did, 0.0)
        # Similarity floor: drop weak matches so we don't feed noise to the model
        # (and, in strict mode, so it honestly says it couldn't find the answer).
        # A strong keyword (BM25) hit can rescue a low vector score.
        if float(display_score) < floor and bm25_scores.get(did, 0.0) < 0.5:
            continue
        chunks.append(
            RetrievedChunk(
                material_id=meta.get("material_id", ""),
                filename=meta.get("filename", "unknown"),
                page=int(meta.get("page", 0)),
                chunk_index=int(meta.get("chunk_index", 0)),
                document=hit["document"],
                score=float(display_score),
                source_url=str(meta.get("source_url", "") or ""),
            )
        )
    return chunks


def build_rag_prompt(
    course: Course,
    question: str,
    chunks: list[RetrievedChunk],
    recent_messages: list[tuple[str, str]] | None = None,
    rag_mode: str | None = None,
    grounding: int | None = None,
) -> list[Message]:
    """Compose the messages array for the LLM call."""
    level = resolve_grounding(grounding, rag_mode, course.rag_mode)
    instruction = _grounding_instruction(level)

    # Assemble a token-budgeted source block. Chunks arrive most-relevant-first,
    # so we keep taking them until the budget is spent, then stop — a
    # deterministic trim that can never overflow the model window.
    budget = settings.rag_context_budget_tokens
    used = 0
    source_block_parts: list[str] = []
    dropped = 0
    for i, ch in enumerate(chunks, start=1):
        header = f"[{i}] {ch.filename} (page {ch.page})"
        if ch.source_url:
            header = f"{header} - {ch.source_url}"
        body = f"{header}\n{ch.document.strip()}"
        cost = max(1, len(body) // 4)  # ~4 chars/token
        if used + cost > budget and source_block_parts:
            dropped = len(chunks) - (i - 1)
            break
        source_block_parts.append(body)
        used += cost
    if dropped:
        log.info("RAG context trimmed: kept %d chunk(s), dropped %d over budget", len(source_block_parts), dropped)
    source_block = "\n\n".join(source_block_parts) if source_block_parts else "(no sources retrieved)"

    personality = course.ai_personality.strip() or (
        f"You are the dedicated AI assistant for {course.name}. Be concise, accurate, and rigorous."
    )

    system = (
        f"You are **{course.ai_name}**, the dedicated assistant for the course "
        f'"{course.name}". {personality}\n\n'
        "## Retrieval policy\n"
        f"{instruction}\n\n"
        "## Answer style\n"
        "- Read every source excerpt below before answering. Match the user's wording — including "
        "partial names, acronyms, or informal phrasing — to what the sources actually say (e.g. a "
        "first name may appear as a full name).\n"
        "- Use GitHub-flavored Markdown.\n"
        "- Inline-cite sources using their bracket number, e.g. [1], [2].\n"
        "- Prefer short, direct answers over long preambles. Use bullet lists and code "
        "fences when helpful. Use LaTeX (dollar signs) for math.\n"
        "- Never fabricate citations. Only cite sources that actually appear in the sources list.\n\n"
        "## Sources\n"
        f"{source_block}"
    )

    messages: list[Message] = [Message(role="system", content=system)]
    if recent_messages:
        for role, content in recent_messages[-6:]:  # short context window
            if role in ("user", "assistant") and content.strip():
                messages.append(Message(role=role, content=content))  # type: ignore[arg-type]
    messages.append(Message(role="user", content=question))
    return messages
