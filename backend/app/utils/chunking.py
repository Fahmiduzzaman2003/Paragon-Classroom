from __future__ import annotations

import re
from dataclasses import dataclass

# Characters, in order of preference, at which to try to split a block of text.
# Recursive character splitter — same idea as LangChain's RecursiveCharacterTextSplitter.
_SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "]


@dataclass(slots=True)
class Chunk:
    text: str
    page: int
    chunk_index: int


def _approx_token_len(text: str) -> int:
    """Cheap token estimate: ~4 chars/token for English. Avoids tiktoken cost."""
    return max(1, len(text) // 4)


def _split_at_separator(text: str, separators: list[str]) -> list[str]:
    if not separators:
        return [text]
    sep = separators[0]
    parts = text.split(sep)
    if len(parts) == 1:
        return _split_at_separator(text, separators[1:])
    # Re-attach separator where useful
    result = []
    for i, p in enumerate(parts):
        if i < len(parts) - 1:
            result.append(p + sep)
        else:
            result.append(p)
    return [r for r in result if r]


def recursive_split(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Split `text` into chunks no larger than `chunk_size` tokens (approx).

    Produces overlapping chunks by sliding a window. Preserves semantic boundaries
    where possible.
    """
    text = text.strip()
    if not text:
        return []

    if _approx_token_len(text) <= chunk_size:
        return [text]

    # First pass: split on increasingly fine separators until atomic pieces fit.
    pieces: list[str] = []
    queue = [text]
    sep_idx = 0
    while queue and sep_idx < len(_SEPARATORS):
        sep = _SEPARATORS[sep_idx]
        next_queue: list[str] = []
        for q in queue:
            if _approx_token_len(q) <= chunk_size:
                pieces.append(q)
                continue
            parts = q.split(sep)
            if len(parts) == 1:
                next_queue.append(q)
                continue
            # Re-attach the separator so reassembly yields readable text
            rebuilt = []
            for i, p in enumerate(parts):
                rebuilt.append(p + (sep if i < len(parts) - 1 else ""))
            next_queue.extend(rebuilt)
        queue = next_queue
        sep_idx += 1
    pieces.extend(queue)  # whatever is left (atomic)

    # Second pass: greedily assemble into chunks with overlap.
    chunks: list[str] = []
    current = ""
    for piece in pieces:
        candidate = current + piece
        if _approx_token_len(candidate) > chunk_size and current:
            chunks.append(current.strip())
            # Build overlap prefix from tail of the last chunk
            tail = current[-chunk_overlap * 4 :] if chunk_overlap > 0 else ""
            current = tail + piece
        else:
            current = candidate
    if current.strip():
        chunks.append(current.strip())

    # Final guard: force-split pieces larger than chunk_size via hard slice.
    final: list[str] = []
    approx_chars = chunk_size * 4
    for c in chunks:
        if _approx_token_len(c) <= chunk_size:
            final.append(c)
        else:
            for i in range(0, len(c), approx_chars):
                final.append(c[i : i + approx_chars])
    return [c for c in final if c.strip()]


def chunk_pages(pages: list[tuple[int, str]], chunk_size: int, chunk_overlap: int) -> list[Chunk]:
    """Chunk per-page, preserving the source page number for each chunk."""
    out: list[Chunk] = []
    idx = 0
    for page_no, page_text in pages:
        page_text = _clean(page_text)
        if not page_text:
            continue
        for piece in recursive_split(page_text, chunk_size, chunk_overlap):
            out.append(Chunk(text=piece, page=page_no, chunk_index=idx))
            idx += 1
    return out


def _clean(text: str) -> str:
    # Collapse excessive whitespace, keep paragraph breaks.
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
