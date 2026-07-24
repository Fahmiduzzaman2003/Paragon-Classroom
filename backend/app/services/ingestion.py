from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path

import httpx

from ..config import settings
from ..database import SessionLocal
from ..models.course import Course
from ..models.job import IngestionJob, JobStage
from ..models.material import Material, MaterialStatus
from ..utils.chunking import chunk_pages
from ..utils.file_parsers import MAX_UPLOAD_BYTES, extract_pages
from ..utils.web_parsers import extract_web_pages, is_web_url
from . import vector_store
from .jobs import PermanentError, RetryableError

log = logging.getLogger(__name__)


async def _download_to_temp(url: str, suffix: str) -> Path:
    """Stream a remote blob (e.g. a Cloudinary file URL) to a temp file, bounded
    by MAX_UPLOAD_BYTES. On the ephemeral disk this is fine — it's deleted right
    after parsing and never persisted."""
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    size = 0
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status()
                with open(tmp, "wb") as f:
                    async for chunk in resp.aiter_bytes(1024 * 256):
                        size += len(chunk)
                        if size > MAX_UPLOAD_BYTES:
                            raise RetryableError("Remote file exceeds size limit")
                        f.write(chunk)
        return Path(tmp)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise


async def _extract_any(source_path: str, mime: str, filename: str) -> list[tuple[int, str]]:
    """Resolve a material's stored location to text pages, regardless of whether
    it lives on local disk, at a remote object-storage URL, or is a web link."""
    remote = is_web_url(source_path)
    is_html_link = remote and (mime == "text/html" or not mime)
    if is_html_link:
        return await asyncio.to_thread(extract_web_pages, source_path)
    if remote:
        # A file we stored remotely (Cloudinary): download then parse by type.
        suffix = Path(filename).suffix or ".bin"
        tmp = await _download_to_temp(source_path, suffix)
        try:
            return await asyncio.to_thread(extract_pages, tmp)
        finally:
            tmp.unlink(missing_ok=True)
    # Local disk file. LocalStorage stores the PUBLIC url ("/uploads/<rel>"); map
    # it back to the real path under uploads_dir before opening.
    if source_path.startswith("/uploads/"):
        disk_path = settings.uploads_dir / source_path[len("/uploads/"):]
    else:
        disk_path = Path(source_path)
    return await asyncio.to_thread(extract_pages, disk_path)


async def _set_stage(job_id: str, stage: str, progress: int) -> None:
    async with SessionLocal() as db:
        job = await db.get(IngestionJob, job_id)
        if job:
            job.stage = stage
            job.progress = progress
            await db.commit()


async def run_ingestion_job(job_id: str) -> None:
    """Execute one ingestion job: extract → chunk → embed → upsert.

    Updates ``stage``/``progress`` as it goes. Raises :class:`PermanentError` for
    deterministic failures (bad file, no text — never retry) and
    :class:`RetryableError` for transient ones (vector/embedding backend — the
    job runner retries with backoff). Idempotent: replaces the material's chunks
    on every run, so a redeploy-triggered retry can't duplicate vectors.
    """
    async with SessionLocal() as db:
        job = await db.get(IngestionJob, job_id)
        if not job:
            log.warning("Job %s vanished; nothing to ingest", job_id)
            return
        material = await db.get(Material, job.material_id)
        if not material:
            raise PermanentError("Material no longer exists")
        course = await db.get(Course, material.course_id)
        if not course:
            raise PermanentError("Parent course missing")

        material.status = MaterialStatus.PROCESSING.value
        await db.commit()

        source_path = material.path
        collection = course.collection_name
        material_id = material.id
        section = material.section
        filename = material.filename
        mime = material.mime
        course_id = course.id

    # ── extract ────────────────────────────────────────────────
    await _set_stage(job_id, JobStage.EXTRACT.value, 10)
    try:
        pages = await _extract_any(source_path, mime, filename)
    except RetryableError:
        raise
    except Exception as e:  # parsing is deterministic → permanent
        raise PermanentError(f"parse error: {e}") from e

    if not pages:
        raise PermanentError("No extractable text (empty, scanned, or unsupported content)")

    # Cap pages on the free tier to bound memory/time; surface it honestly.
    truncated = False
    if settings.max_ingest_pages and len(pages) > settings.max_ingest_pages:
        pages = pages[: settings.max_ingest_pages]
        truncated = True
        log.info("Job %s: capped to %d pages (free-tier limit)", job_id, settings.max_ingest_pages)

    # ── chunk ──────────────────────────────────────────────────
    await _set_stage(job_id, JobStage.CHUNK.value, 35)
    chunks = await asyncio.to_thread(
        chunk_pages, pages, settings.rag_chunk_size, settings.rag_chunk_overlap
    )
    if not chunks:
        raise PermanentError("Chunker produced no output")

    ids = [f"{material_id}:{c.chunk_index}" for c in chunks]
    docs = [c.text for c in chunks]
    metas = [
        {
            "material_id": material_id,
            "course_id": course_id,
            "section": section,
            "filename": filename,
            "source_url": source_path if is_web_url(source_path) else "",
            "source_kind": "link" if is_web_url(source_path) else "file",
            "page": c.page,
            "chunk_index": c.chunk_index,
        }
        for c in chunks
    ]

    # ── embed + upsert (idempotent) ────────────────────────────
    await _set_stage(job_id, JobStage.EMBED.value, 60)
    try:
        # Clear existing chunks first so a re-run replaces rather than duplicates.
        await asyncio.to_thread(vector_store.delete_by_material, collection, material_id)
        await _set_stage(job_id, JobStage.UPSERT.value, 80)
        await asyncio.to_thread(vector_store.upsert_chunks, collection, ids, docs, metas)
    except Exception as e:  # embedding/vector backend → transient
        raise RetryableError(f"vector store error: {e}") from e

    # ── finalize ───────────────────────────────────────────────
    async with SessionLocal() as db:
        material = await db.get(Material, material_id)
        if material:
            material.status = MaterialStatus.READY.value
            material.status_detail = (
                f"Indexed first {settings.max_ingest_pages} pages (free-tier cap)"
                if truncated
                else ""
            )
            material.chunk_count = len(chunks)
            material.page_count = len(pages)
            await db.commit()
    log.info("Ingestion done: job=%s material=%s chunks=%d pages=%d", job_id, material_id, len(chunks), len(pages))


async def delete_material_chunks(course: Course, material_id: str) -> None:
    await asyncio.to_thread(vector_store.delete_by_material, course.collection_name, material_id)
