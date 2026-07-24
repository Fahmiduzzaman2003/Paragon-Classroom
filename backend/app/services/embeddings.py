from __future__ import annotations

import hashlib
import logging
import time
from collections import OrderedDict
from functools import lru_cache
from typing import Protocol

from ..config import settings

log = logging.getLogger(__name__)


class EmbeddingProvider(Protocol):
    """Pluggable embedding backend. Takes a list of strings, returns row vectors."""

    dim: int
    name: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class _ChromaDefaultEmbeddings:
    """Wraps ChromaDB's bundled all-MiniLM-L6-v2 (via ONNX) — no network required.

    Dev-only: loads a model in-process, so it's forbidden on Render Free (OOM).
    """

    name = "chroma_minilm_l6_v2"
    dim = 384

    def __init__(self) -> None:
        from chromadb.utils import embedding_functions

        self._fn = embedding_functions.DefaultEmbeddingFunction()

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._fn(texts)
        return [list(map(float, v)) for v in vectors]


class _OpenAIEmbeddings:
    name = "openai"

    def __init__(self, model: str, api_key: str, base_url: str = "") -> None:
        from openai import OpenAI

        self._model = model or "text-embedding-3-small"
        self._client = OpenAI(api_key=api_key, base_url=base_url or None)
        self.dim = 1536 if "small" in self._model or "ada" in self._model else 3072

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        out: list[list[float]] = []
        for batch in _batched(texts, 128):
            resp = _with_retry(lambda: self._client.embeddings.create(model=self._model, input=batch))
            out.extend(d.embedding for d in resp.data)
        return out


class _GeminiEmbeddings:
    """Hosted Gemini embeddings (``text-embedding-004``, 768-dim). Free tier, no
    local model — the production default that keeps Render Free under its RAM cap."""

    name = "gemini"
    dim = 768

    def __init__(self, model: str, api_key: str) -> None:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        self._genai = genai
        m = model or "text-embedding-004"
        self._model = m if m.startswith("models/") else f"models/{m}"

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        out: list[list[float]] = []
        # Gemini caps batch size; keep it conservative.
        for batch in _batched(texts, 100):
            resp = _with_retry(
                lambda b=batch: self._genai.embed_content(
                    model=self._model, content=b, task_type="retrieval_document"
                )
            )
            emb = resp["embedding"]
            # A single string returns a flat vector; a list returns a list of vectors.
            if emb and isinstance(emb[0], (int, float)):
                out.append([float(x) for x in emb])
            else:
                out.extend([float(x) for x in v] for v in emb)
        return out


class _CachingEmbeddings:
    """Content-hash cache so re-ingesting unchanged text never re-pays the API.

    In-process (bounded FIFO). Documented limitation: it resets on restart — the
    production upgrade is a shared Redis/DB cache (see docs/PRODUCTION_READINESS)."""

    def __init__(self, inner: EmbeddingProvider, capacity: int = 5000) -> None:
        self._inner = inner
        self.name = inner.name
        self.dim = inner.dim
        self._cache: OrderedDict[str, list[float]] = OrderedDict()
        self._cap = capacity

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        results: list[list[float] | None] = [None] * len(texts)
        misses: list[str] = []
        miss_slots: list[tuple[int, str]] = []
        for i, t in enumerate(texts):
            key = hashlib.sha256(f"{self.name}:{t}".encode("utf-8")).hexdigest()
            hit = self._cache.get(key)
            if hit is not None:
                self._cache.move_to_end(key)
                results[i] = hit
            else:
                misses.append(t)
                miss_slots.append((i, key))
        if misses:
            fresh = self._inner.embed(misses)
            for (i, key), vec in zip(miss_slots, fresh):
                results[i] = vec
                self._cache[key] = vec
                self._cache.move_to_end(key)
            while len(self._cache) > self._cap:
                self._cache.popitem(last=False)
        return [r if r is not None else [] for r in results]


# ─────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────
def _batched(items: list[str], size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _with_retry(fn, attempts: int = 3, base_delay: float = 1.0):
    """Retry a synchronous embedding call with exponential backoff for transient
    errors (rate limits, 5xx, connection resets)."""
    last: Exception | None = None
    for n in range(1, attempts + 1):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            last = e
            if n == attempts:
                break
            time.sleep(base_delay * (2 ** (n - 1)))
    raise last  # type: ignore[misc]


@lru_cache(maxsize=1)
def get_embedding_provider() -> EmbeddingProvider:
    provider = settings.embedding_provider
    if provider == "gemini":
        if settings.gemini_api_key:
            try:
                return _CachingEmbeddings(_GeminiEmbeddings(settings.embedding_model, settings.gemini_api_key))
            except Exception as e:
                log.warning("Gemini embeddings unavailable (%s); falling back to local", e)
        else:
            log.warning("GEMINI_API_KEY missing; falling back to local embeddings")
    elif provider == "openai":
        if settings.openai_api_key:
            try:
                return _CachingEmbeddings(
                    _OpenAIEmbeddings(settings.embedding_model, settings.openai_api_key, settings.openai_base_url)
                )
            except Exception as e:
                log.warning("OpenAI embeddings unavailable (%s); falling back to local", e)
        else:
            log.warning("OPENAI_API_KEY missing; falling back to local embeddings")
    return _ChromaDefaultEmbeddings()
