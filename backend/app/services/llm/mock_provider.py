from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator

from .base import LLMProvider, Message


class MockLLMProvider(LLMProvider):
    """Deterministic mock provider: streams a grounded answer synthesised from the
    system prompt's retrieved context. Lets the full RAG pipeline demo without any
    external API keys.
    """

    name = "mock"

    def __init__(self, model: str = "paragon-mock-1") -> None:
        self.model = model

    async def stream_completion(
        self,
        messages: list[Message],
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        system = next((m.content for m in messages if m.role == "system"), "")
        user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        answer = _compose_answer(user, system, max_tokens)
        for tok in _tokenize(answer):
            await asyncio.sleep(0.01)
            yield tok


def _tokenize(text: str) -> list[str]:
    return re.findall(r"(\s+|[`*_>#\-/\[\]()]+|[A-Za-z0-9]+|[^\w\s])", text) or [text]


def _extract_sources(system: str) -> list[tuple[int, str]]:
    """Find numbered [1] [2] citation blocks that rag_service placed in the prompt."""
    pattern = re.compile(r"\[(\d+)\][^\n]*\n((?:(?!\n\[\d+\]).+\n?)*)")
    out: list[tuple[int, str]] = []
    for m in pattern.finditer(system):
        num = int(m.group(1))
        body = m.group(2).strip()
        out.append((num, body))
    return out


def _compose_answer(user: str, system: str, max_tokens: int) -> str:
    sources = _extract_sources(system)
    user_clean = user.strip() or "the course material"

    if not sources:
        return (
            "I don't have relevant course materials indexed yet. Ask your teacher to "
            "upload lectures or notes, and I'll be able to answer with citations.\n\n"
            f"Your question was: *{user_clean[:200]}*"
        )

    # Pull a concise "snippet" from each source
    top = sources[: min(3, len(sources))]
    opening = (
        f"Here is what the course materials say about your question — *{user_clean[:180]}*:\n\n"
    )
    body_parts: list[str] = []
    for num, text in top:
        snippet = _first_meaningful_sentence(text)
        body_parts.append(f"- Source [{num}] — {snippet} [{num}]")

    body = "\n".join(body_parts)
    tail = (
        "\n\nSee the citations below to verify each claim; each chip links to the exact page "
        "the chunk came from."
    )
    answer = opening + body + tail
    # Respect max_tokens loosely
    if len(answer) > max_tokens * 4:
        answer = answer[: max_tokens * 4]
    return answer


def _first_meaningful_sentence(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    # Split to 1–2 sentences, drop bare citation markers
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = " ".join(parts[: 2 if len(parts) > 1 else 1]).strip()
    # Trim trailing "[n]" markers that are already present in source bodies
    out = re.sub(r"\s*\[\d+\]\s*$", "", out)
    if len(out) > 220:
        out = out[:217] + "…"
    return out or text[:200]
