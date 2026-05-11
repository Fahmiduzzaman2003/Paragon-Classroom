from __future__ import annotations

import logging
import threading
from functools import lru_cache
from typing import Any, Iterable

from ..config import settings
from .embeddings import get_embedding_provider

log = logging.getLogger(__name__)

_lock = threading.Lock()


@lru_cache(maxsize=1)
def _get_client():
    import chromadb

    client = chromadb.PersistentClient(path=str(settings.chroma_path))
    log.info("ChromaDB persistent client at %s", settings.chroma_path)
    return client


class _EmbeddingAdapter:
    """Adapts our EmbeddingProvider to Chroma's embedding-function protocols.

    Chroma 0.4.x called ``__call__(input)``; 0.5.x added ``embed_query`` and
    ``embed_documents``. We implement all three so the same adapter works
    against either version, and any future protocol that picks one of them.
    """

    def __init__(self, provider) -> None:
        self._provider = provider

    def __call__(self, input: list[str]) -> list[list[float]]:  # noqa: A002
        return self._provider.embed(input)

    # New-style protocol (Chroma >= 0.5)
    def embed_documents(self, input: list[str]) -> list[list[float]]:  # noqa: A002
        return self._provider.embed(input)

    def embed_query(self, query: str) -> list[float]:
        result = self._provider.embed([query])
        return result[0] if result else []

    def name(self) -> str:
        return getattr(self._provider, "name", "custom")


def _get_collection(collection_name: str):
    client = _get_client()
    provider = get_embedding_provider()
    return client.get_or_create_collection(
        name=collection_name,
        embedding_function=_EmbeddingAdapter(provider),
        metadata={"hnsw:space": "cosine"},
    )


def upsert_chunks(
    collection_name: str,
    ids: list[str],
    documents: list[str],
    metadatas: list[dict[str, Any]],
) -> None:
    if not ids:
        return
    with _lock:
        coll = _get_collection(collection_name)
        coll.upsert(ids=ids, documents=documents, metadatas=metadatas)


def delete_by_material(collection_name: str, material_id: str) -> None:
    with _lock:
        try:
            coll = _get_collection(collection_name)
            coll.delete(where={"material_id": material_id})
        except Exception as e:
            log.warning("Failed to delete chunks for material %s: %s", material_id, e)


def query(
    collection_name: str,
    query_text: str,
    top_k: int,
    where: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    with _lock:
        coll = _get_collection(collection_name)
        try:
            res = coll.query(
                query_texts=[query_text],
                n_results=top_k,
                where=where,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as e:
            log.warning("Vector query failed: %s", e)
            return []

    ids = (res.get("ids") or [[]])[0]
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]

    hits: list[dict[str, Any]] = []
    for i, doc in enumerate(docs):
        dist = dists[i] if i < len(dists) else 0.0
        score = max(0.0, min(1.0, 1.0 - float(dist)))  # cosine distance → [0, 1]
        hits.append({
            "id": ids[i] if i < len(ids) else f"hit-{i}",
            "document": doc,
            "metadata": metas[i] if i < len(metas) else {},
            "score": score,
        })
    return hits


def all_documents(collection_name: str, limit: int = 2000) -> Iterable[dict[str, Any]]:
    """Fetch all (id, document, metadata) triples — used for BM25 index building."""
    with _lock:
        coll = _get_collection(collection_name)
        try:
            res = coll.get(limit=limit, include=["documents", "metadatas"])
        except Exception as e:
            log.warning("all_documents failed: %s", e)
            return []
    ids = res.get("ids") or []
    docs = res.get("documents") or []
    metas = res.get("metadatas") or []
    for i, doc in enumerate(docs):
        yield {
            "id": ids[i] if i < len(ids) else f"doc-{i}",
            "document": doc,
            "metadata": metas[i] if i < len(metas) else {},
        }


def collection_size(collection_name: str) -> int:
    with _lock:
        try:
            return _get_collection(collection_name).count()
        except Exception:
            return 0
