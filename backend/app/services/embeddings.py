from __future__ import annotations

import logging
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
    """Wraps ChromaDB's bundled all-MiniLM-L6-v2 (via ONNX) — no network required."""

    name = "chroma_minilm_l6_v2"
    dim = 384

    def __init__(self) -> None:
        from chromadb.utils import embedding_functions

        self._fn = embedding_functions.DefaultEmbeddingFunction()

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._fn(texts)
        # chromadb returns numpy arrays or lists depending on version.
        return [list(map(float, v)) for v in vectors]


class _OpenAIEmbeddings:
    name = "openai"

    def __init__(self, model: str, api_key: str, base_url: str = "") -> None:
        from openai import OpenAI

        self._model = model or "text-embedding-3-small"
        self._client = OpenAI(api_key=api_key, base_url=base_url or None)
        # dim for text-embedding-3-small = 1536, -3-large = 3072
        self.dim = 1536 if "small" in self._model or "ada" in self._model else 3072

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = self._client.embeddings.create(model=self._model, input=texts)
        return [d.embedding for d in resp.data]


@lru_cache(maxsize=1)
def get_embedding_provider() -> EmbeddingProvider:
    if settings.embedding_provider == "openai":
        if not settings.openai_api_key:
            log.warning("OPENAI_API_KEY missing; falling back to local embeddings")
        else:
            try:
                return _OpenAIEmbeddings(
                    settings.embedding_model,
                    settings.openai_api_key,
                    settings.openai_base_url,
                )
            except Exception as e:
                log.warning("OpenAI embeddings unavailable (%s); falling back to local", e)
    return _ChromaDefaultEmbeddings()
