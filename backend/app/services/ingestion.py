from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from sqlalchemy import select

from ..config import settings
from ..database import SessionLocal
from ..models.course import Course
from ..models.material import Material, MaterialStatus
from ..utils.chunking import chunk_pages
from ..utils.file_parsers import extract_pages
from ..utils.web_parsers import extract_web_pages, is_web_url
from . import vector_store

log = logging.getLogger(__name__)


async def ingest_material(material_id: str) -> None:
    """Run text-extract → chunk → embed → upsert into the per-course collection.

    Safe to call from a FastAPI BackgroundTasks handler. Idempotent: re-ingesting
    replaces existing chunks for that material via delete_by_material.
    """
    log.info("Ingestion start for material=%s", material_id)
    async with SessionLocal() as db:
        material = await db.get(Material, material_id)
        if not material:
            log.warning("Material %s missing; abort ingestion", material_id)
            return
        course = await db.get(Course, material.course_id)
        if not course:
            log.warning("Course for material %s missing; abort ingestion", material_id)
            material.status = MaterialStatus.FAILED.value
            material.status_detail = "Parent course missing"
            await db.commit()
            return

        path = Path(material.path)
        collection = course.collection_name

        try:
            if is_web_url(material.path):
                pages = await asyncio.to_thread(extract_web_pages, material.path)
            else:
                pages = await asyncio.to_thread(extract_pages, path)
        except Exception as e:
            log.exception("Text extraction failed for %s: %s", path, e)
            material.status = MaterialStatus.FAILED.value
            material.status_detail = f"parse error: {e}"
            await db.commit()
            return

        if not pages:
            material.status = MaterialStatus.FAILED.value
            material.status_detail = "No extractable text"
            await db.commit()
            return

        chunks = await asyncio.to_thread(
            chunk_pages,
            pages,
            settings.rag_chunk_size,
            settings.rag_chunk_overlap,
        )
        if not chunks:
            material.status = MaterialStatus.FAILED.value
            material.status_detail = "Chunker produced no output"
            await db.commit()
            return

        # Clear any existing chunks first so re-ingestion is safe
        await asyncio.to_thread(vector_store.delete_by_material, collection, material_id)

        # Build ids / docs / metadata
        ids = [f"{material_id}:{c.chunk_index}" for c in chunks]
        docs = [c.text for c in chunks]
        metas = [
            {
                "material_id": material_id,
                "course_id": course.id,
                "section": material.section,
                "filename": material.filename,
                "source_url": material.path if is_web_url(material.path) else "",
                "source_kind": "link" if is_web_url(material.path) else "file",
                "page": c.page,
                "chunk_index": c.chunk_index,
            }
            for c in chunks
        ]

        try:
            await asyncio.to_thread(vector_store.upsert_chunks, collection, ids, docs, metas)
        except Exception as e:
            log.exception("Vector upsert failed: %s", e)
            material.status = MaterialStatus.FAILED.value
            material.status_detail = f"vector store error: {e}"
            await db.commit()
            return

        material.status = MaterialStatus.READY.value
        material.status_detail = ""
        material.chunk_count = len(chunks)
        material.page_count = len(pages)
        await db.commit()
        log.info(
            "Ingestion done: material=%s chunks=%d pages=%d",
            material_id,
            len(chunks),
            len(pages),
        )


async def delete_material_chunks(course: Course, material_id: str) -> None:
    await asyncio.to_thread(vector_store.delete_by_material, course.collection_name, material_id)
