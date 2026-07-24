"""Pluggable vector store.

Two backends behind one interface, selected by ``VECTOR_BACKEND``:

* ``chroma``   — on-disk ChromaDB. Dev only; wiped on Render redeploy.
* ``pgvector`` — pgvector on the Postgres in ``DATABASE_URL`` (Neon). Persistent
  across redeploys, no extra service. Production default.

The module-level functions (``upsert_chunks``, ``query``, ``delete_by_material``,
``all_documents``, ``collection_size``) keep a stable **synchronous** signature so
callers never change. Embeddings are computed here via the configured provider
and passed explicitly to the backend, so the same embedding model is used for
both storage and query regardless of backend.

Swapping to a managed vector DB later = add one backend class + a config branch.
"""

from __future__ import annotations

import json
import logging
import threading
from functools import lru_cache
from typing import Any, Iterable, Protocol
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from ..config import settings
from .embeddings import get_embedding_provider

log = logging.getLogger(__name__)

_lock = threading.Lock()


# ─────────────────────────────────────────────────────────────
# Backend protocol
# ─────────────────────────────────────────────────────────────
class VectorBackend(Protocol):
    def upsert(
        self,
        collection: str,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict[str, Any]],
        embeddings: list[list[float]],
    ) -> None: ...

    def query_vec(
        self, collection: str, embedding: list[float], top_k: int, where: dict[str, Any] | None
    ) -> list[dict[str, Any]]: ...

    def delete_by_material(self, collection: str, material_id: str) -> None: ...

    def all_documents(self, collection: str, limit: int) -> list[dict[str, Any]]: ...

    def collection_size(self, collection: str) -> int: ...


# ─────────────────────────────────────────────────────────────
# ChromaDB backend (dev)
# ─────────────────────────────────────────────────────────────
class ChromaBackend:
    @lru_cache(maxsize=1)
    def _client(self):  # type: ignore[no-untyped-def]
        import chromadb

        log.info("ChromaDB persistent client at %s", settings.chroma_path)
        return chromadb.PersistentClient(path=str(settings.chroma_path))

    def _collection(self, name: str):  # type: ignore[no-untyped-def]
        # No embedding_function: we always pass vectors explicitly, so Chroma
        # never invokes a local model on its own.
        return self._client().get_or_create_collection(
            name=name, metadata={"hnsw:space": "cosine"}
        )

    def upsert(self, collection, ids, documents, metadatas, embeddings) -> None:
        coll = self._collection(collection)
        coll.upsert(ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings)

    def query_vec(self, collection, embedding, top_k, where) -> list[dict[str, Any]]:
        coll = self._collection(collection)
        try:
            res = coll.query(
                query_embeddings=[embedding],
                n_results=top_k,
                where=where,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as e:
            log.warning("Chroma query failed: %s", e)
            return []
        ids = (res.get("ids") or [[]])[0]
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        hits: list[dict[str, Any]] = []
        for i, doc in enumerate(docs):
            dist = dists[i] if i < len(dists) else 0.0
            hits.append({
                "id": ids[i] if i < len(ids) else f"hit-{i}",
                "document": doc,
                "metadata": metas[i] if i < len(metas) else {},
                "score": max(0.0, min(1.0, 1.0 - float(dist))),
            })
        return hits

    def delete_by_material(self, collection, material_id) -> None:
        try:
            self._collection(collection).delete(where={"material_id": material_id})
        except Exception as e:
            log.warning("Chroma delete failed for %s: %s", material_id, e)

    def all_documents(self, collection, limit) -> list[dict[str, Any]]:
        try:
            res = self._collection(collection).get(limit=limit, include=["documents", "metadatas"])
        except Exception as e:
            log.warning("Chroma all_documents failed: %s", e)
            return []
        ids = res.get("ids") or []
        docs = res.get("documents") or []
        metas = res.get("metadatas") or []
        return [
            {"id": ids[i] if i < len(ids) else f"doc-{i}", "document": d,
             "metadata": metas[i] if i < len(metas) else {}}
            for i, d in enumerate(docs)
        ]

    def collection_size(self, collection) -> int:
        try:
            return self._collection(collection).count()
        except Exception:
            return 0


# ─────────────────────────────────────────────────────────────
# pgvector backend (prod)
# ─────────────────────────────────────────────────────────────
def _sync_pg_url(url: str) -> str:
    """Derive a synchronous psycopg URL from the app's async DATABASE_URL and
    ensure SSL for a hosted (non-local) Postgres like Neon."""
    u = url.replace("+asyncpg", "+psycopg")
    if u.startswith("postgresql://"):
        u = u.replace("postgresql://", "postgresql+psycopg://", 1)
    parts = urlparse(u)
    host = (parts.hostname or "").lower()
    is_local = host in {"localhost", "127.0.0.1", ""}
    q = dict(parse_qsl(parts.query))
    q.pop("ssl", None)  # asyncpg-style param psycopg doesn't understand
    if not is_local and "sslmode" not in q:
        q["sslmode"] = "require"
    return urlunparse(parts._replace(query=urlencode(q)))


class PgVectorBackend:
    def __init__(self) -> None:
        from sqlalchemy import create_engine

        self._dim = get_embedding_provider().dim
        self._engine = create_engine(
            _sync_pg_url(settings.database_url),
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=1,
            pool_recycle=settings.db_pool_recycle_s,
        )
        self._ensured = False
        self._ensure_lock = threading.Lock()

    def _ensure_schema(self) -> None:
        if self._ensured:
            return
        from sqlalchemy import text

        with self._ensure_lock:
            if self._ensured:
                return
            with self._engine.begin() as c:
                c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                c.execute(text(
                    f"""
                    CREATE TABLE IF NOT EXISTS rag_chunks (
                        id TEXT PRIMARY KEY,
                        collection TEXT NOT NULL,
                        material_id TEXT NOT NULL,
                        course_id TEXT,
                        page INTEGER,
                        chunk_index INTEGER,
                        document TEXT,
                        metadata JSONB,
                        embedding vector({self._dim})
                    )
                    """
                ))
                c.execute(text("CREATE INDEX IF NOT EXISTS idx_rag_collection ON rag_chunks (collection)"))
                c.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_rag_collection_material "
                    "ON rag_chunks (collection, material_id)"
                ))
                try:
                    c.execute(text(
                        "CREATE INDEX IF NOT EXISTS idx_rag_embedding ON rag_chunks "
                        "USING hnsw (embedding vector_cosine_ops)"
                    ))
                except Exception as e:  # older pgvector without HNSW → seq scan
                    log.warning("HNSW index unavailable (%s); querying without ANN index", e)
            self._ensured = True
            log.info("pgvector schema ready (dim=%d)", self._dim)

    @staticmethod
    def _vec_literal(v: list[float]) -> str:
        return "[" + ",".join(repr(float(x)) for x in v) + "]"

    def upsert(self, collection, ids, documents, metadatas, embeddings) -> None:
        from sqlalchemy import text

        self._ensure_schema()
        rows = [
            {
                "id": ids[i],
                "collection": collection,
                "material_id": str(metadatas[i].get("material_id", "")),
                "course_id": str(metadatas[i].get("course_id", "")),
                "page": int(metadatas[i].get("page", 0) or 0),
                "chunk_index": int(metadatas[i].get("chunk_index", 0) or 0),
                "document": documents[i],
                "metadata": json.dumps(metadatas[i]),
                "embedding": self._vec_literal(embeddings[i]),
            }
            for i in range(len(ids))
        ]
        sql = text(
            """
            INSERT INTO rag_chunks
              (id, collection, material_id, course_id, page, chunk_index, document, metadata, embedding)
            VALUES
              (:id, :collection, :material_id, :course_id, :page, :chunk_index, :document,
               CAST(:metadata AS JSONB), CAST(:embedding AS vector))
            ON CONFLICT (id) DO UPDATE SET
              document = EXCLUDED.document, metadata = EXCLUDED.metadata,
              embedding = EXCLUDED.embedding, page = EXCLUDED.page,
              chunk_index = EXCLUDED.chunk_index, material_id = EXCLUDED.material_id,
              course_id = EXCLUDED.course_id
            """
        )
        with self._engine.begin() as c:
            c.execute(sql, rows)

    def query_vec(self, collection, embedding, top_k, where) -> list[dict[str, Any]]:
        from sqlalchemy import text

        self._ensure_schema()
        params: dict[str, Any] = {"collection": collection, "qv": self._vec_literal(embedding), "k": top_k}
        filt = ""
        if where and where.get("material_id"):
            filt = " AND material_id = :mid"
            params["mid"] = str(where["material_id"])
        sql = text(
            f"""
            SELECT id, document, metadata, 1 - (embedding <=> CAST(:qv AS vector)) AS score
            FROM rag_chunks
            WHERE collection = :collection{filt}
            ORDER BY embedding <=> CAST(:qv AS vector)
            LIMIT :k
            """
        )
        with self._engine.connect() as c:
            res = c.execute(sql, params).mappings().all()
        return [
            {
                "id": r["id"],
                "document": r["document"],
                "metadata": _as_dict(r["metadata"]),
                "score": max(0.0, min(1.0, float(r["score"]))),
            }
            for r in res
        ]

    def delete_by_material(self, collection, material_id) -> None:
        from sqlalchemy import text

        self._ensure_schema()
        with self._engine.begin() as c:
            c.execute(
                text("DELETE FROM rag_chunks WHERE collection = :c AND material_id = :m"),
                {"c": collection, "m": material_id},
            )

    def all_documents(self, collection, limit) -> list[dict[str, Any]]:
        from sqlalchemy import text

        self._ensure_schema()
        with self._engine.connect() as c:
            res = c.execute(
                text("SELECT id, document, metadata FROM rag_chunks WHERE collection = :c LIMIT :n"),
                {"c": collection, "n": limit},
            ).mappings().all()
        return [{"id": r["id"], "document": r["document"], "metadata": _as_dict(r["metadata"])} for r in res]

    def collection_size(self, collection) -> int:
        from sqlalchemy import text

        self._ensure_schema()
        with self._engine.connect() as c:
            return int(c.execute(
                text("SELECT count(*) FROM rag_chunks WHERE collection = :c"), {"c": collection}
            ).scalar() or 0)

    # ── Semantic answer cache ──────────────────────────────────
    def _ensure_cache_schema(self) -> None:
        if getattr(self, "_cache_ensured", False):
            return
        from sqlalchemy import text

        with self._ensure_lock:
            if getattr(self, "_cache_ensured", False):
                return
            with self._engine.begin() as c:
                c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                c.execute(text(
                    f"""
                    CREATE TABLE IF NOT EXISTS qa_cache (
                        id TEXT PRIMARY KEY,
                        course_id TEXT NOT NULL,
                        question TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        citations JSONB,
                        embedding vector({self._dim}),
                        created_at TIMESTAMPTZ DEFAULT now()
                    )
                    """
                ))
                c.execute(text("CREATE INDEX IF NOT EXISTS idx_qa_cache_course ON qa_cache (course_id)"))
            self._cache_ensured = True

    def cache_lookup(self, course_id: str, embedding: list[float], ttl_days: int) -> dict | None:
        from sqlalchemy import text

        self._ensure_cache_schema()
        sql = text(
            f"""
            SELECT answer, citations, 1 - (embedding <=> CAST(:qv AS vector)) AS score
            FROM qa_cache
            WHERE course_id = :cid
              AND created_at > now() - make_interval(days => :ttl)
            ORDER BY embedding <=> CAST(:qv AS vector)
            LIMIT 1
            """
        )
        with self._engine.connect() as c:
            row = c.execute(
                sql, {"cid": course_id, "qv": self._vec_literal(embedding), "ttl": int(ttl_days)}
            ).mappings().first()
        if not row:
            return None
        return {"answer": row["answer"], "citations": _as_dict_list(row["citations"]), "score": float(row["score"])}

    def cache_store(
        self, cache_id: str, course_id: str, question: str, answer: str,
        citations: list, embedding: list[float],
    ) -> None:
        import json

        from sqlalchemy import text

        self._ensure_cache_schema()
        with self._engine.begin() as c:
            c.execute(
                text(
                    """
                    INSERT INTO qa_cache (id, course_id, question, answer, citations, embedding)
                    VALUES (:id, :cid, :q, :a, CAST(:cit AS JSONB), CAST(:emb AS vector))
                    ON CONFLICT (id) DO NOTHING
                    """
                ),
                {
                    "id": cache_id, "cid": course_id, "q": question[:4000], "a": answer,
                    "cit": json.dumps(citations), "emb": self._vec_literal(embedding),
                },
            )

    def cache_invalidate(self, course_id: str) -> int:
        from sqlalchemy import text

        self._ensure_cache_schema()
        with self._engine.begin() as c:
            res = c.execute(text("DELETE FROM qa_cache WHERE course_id = :cid"), {"cid": course_id})
        return int(res.rowcount or 0)


def _as_dict(meta: Any) -> dict[str, Any]:
    if isinstance(meta, dict):
        return meta
    if isinstance(meta, str):
        try:
            return json.loads(meta)
        except Exception:
            return {}
    return {}


def _as_dict_list(v: Any) -> list[dict[str, Any]]:
    if isinstance(v, list):
        return v
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


# ─────────────────────────────────────────────────────────────
# Backend selection + public (sync) API
# ─────────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def _backend() -> VectorBackend:
    if settings.vector_backend == "pgvector":
        log.info("Vector backend: pgvector")
        return PgVectorBackend()
    log.info("Vector backend: chroma")
    return ChromaBackend()


def upsert_chunks(
    collection_name: str,
    ids: list[str],
    documents: list[str],
    metadatas: list[dict[str, Any]],
) -> None:
    if not ids:
        return
    embeddings = get_embedding_provider().embed(documents)
    with _lock:
        _backend().upsert(collection_name, ids, documents, metadatas, embeddings)


def delete_by_material(collection_name: str, material_id: str) -> None:
    with _lock:
        _backend().delete_by_material(collection_name, material_id)


def query(
    collection_name: str,
    query_text: str,
    top_k: int,
    where: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    emb = get_embedding_provider().embed([query_text])
    if not emb:
        return []
    with _lock:
        return _backend().query_vec(collection_name, emb[0], top_k, where)


def all_documents(collection_name: str, limit: int = 2000) -> Iterable[dict[str, Any]]:
    with _lock:
        return _backend().all_documents(collection_name, limit)


def collection_size(collection_name: str) -> int:
    with _lock:
        return _backend().collection_size(collection_name)


# ─────────────────────────────────────────────────────────────
# Semantic answer cache (pgvector-only; no-op on chroma/sqlite)
# ─────────────────────────────────────────────────────────────
def semantic_cache_lookup(
    course_id: str, question: str, threshold: float, ttl_days: int
) -> dict[str, Any] | None:
    """Return {"answer", "citations", "score"} if a past answer for this course
    is within `threshold` cosine similarity of `question`, else None. Reuses the
    in-process-cached query embedding, so no extra API call vs. retrieval."""
    b = _backend()
    if not isinstance(b, PgVectorBackend) or not question.strip():
        return None
    emb = get_embedding_provider().embed([question])
    if not emb:
        return None
    with _lock:
        hit = b.cache_lookup(course_id, emb[0], ttl_days)
    if hit and hit["score"] >= threshold:
        return hit
    return None


def semantic_cache_store(
    course_id: str, question: str, answer: str, citations: list[dict[str, Any]]
) -> None:
    import uuid

    b = _backend()
    if not isinstance(b, PgVectorBackend) or not (question.strip() and answer.strip()):
        return
    emb = get_embedding_provider().embed([question])
    if not emb:
        return
    with _lock:
        b.cache_store(str(uuid.uuid4()), course_id, question, answer, citations or [], emb[0])


def semantic_cache_invalidate(course_id: str) -> int:
    b = _backend()
    if not isinstance(b, PgVectorBackend):
        return 0
    with _lock:
        return b.cache_invalidate(course_id)
