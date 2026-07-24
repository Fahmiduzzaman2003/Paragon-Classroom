from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..config import settings
from ..dependencies import CurrentUser, Database, assert_enrolled
from ..services.limiter import limiter
from ..models.course import Course
from ..models.job import IngestionJob, JobStatus
from ..models.material import Material, MaterialSection, MaterialStatus
from ..models.user import Role, User
from ..schemas.material import MaterialOut
from ..services.ingestion import delete_material_chunks
from ..services.jobs import enqueue
from ..services.storage import get_storage
from ..utils.file_parsers import MAX_UPLOAD_BYTES, UnsupportedFileError, detect_mime, is_supported, validate_magic
from ..utils.web_parsers import infer_source_filename, is_web_url

log = logging.getLogger(__name__)
router = APIRouter()


async def _latest_job(db, material_id: str) -> IngestionJob | None:
    return await db.scalar(
        select(IngestionJob)
        .where(IngestionJob.material_id == material_id)
        .order_by(IngestionJob.created_at.desc())
        .limit(1)
    )


async def _create_ingestion_job(db, material: Material, user_id: str) -> IngestionJob:
    """Persist a QUEUED job for this material and hand it to the worker pool.

    Committing the row BEFORE enqueue means a crash between the two still leaves
    a recoverable record that boot-recovery will requeue."""
    job = IngestionJob(
        user_id=user_id,
        material_id=material.id,
        course_id=material.course_id,
        status=JobStatus.QUEUED.value,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    enqueue(job.id)
    return job


async def _serialize(material: Material, uploader: User | None, job: IngestionJob | None = None) -> MaterialOut:
    # ``material.path`` holds the storage URL — for local storage it's the
    # relative ``/uploads/...`` path, for Cloudinary it's the absolute
    # ``secure_url``. ``is_web_url`` only matches the absolute-URL case, so we
    # treat local paths as file uploads and Cloudinary URLs as links from the
    # *frontend's* perspective (which just means "stream this URL").
    is_external = is_web_url(material.path)
    return MaterialOut(
        id=material.id,
        course_id=material.course_id,
        uploader_id=material.uploader_id,
        uploader_name=uploader.name if uploader else "",
        section=material.section,  # type: ignore[arg-type]
        filename=material.filename,
        mime=material.mime,
        size=material.size,
        folder=material.folder,
        tags=material.tags or [],
        # Always expose a downloadable URL. For local files we prepend the
        # API base so the frontend can open the absolute address directly.
        source_url=material.path,
        # 'link' covers external URLs and Cloudinary URLs (both are absolute
        # http(s) endpoints); 'file' is reserved for local disk storage.
        source_kind="link" if is_external else "file",
        status=material.status,  # type: ignore[arg-type]
        status_detail=material.status_detail,
        chunk_count=material.chunk_count,
        page_count=material.page_count,
        created_at=material.created_at,
        job_id=job.id if job else None,
        job_status=job.status if job else None,
        job_stage=job.stage if job else None,
        job_progress=job.progress if job else None,
    )


@router.get("/courses/{course_id}/materials", response_model=list[MaterialOut])
async def list_materials(
    course_id: str,
    current: CurrentUser,
    db: Database,
    section: str | None = None,
) -> list[MaterialOut]:
    await assert_enrolled(db, current, course_id)
    stmt = select(Material).where(Material.course_id == course_id)
    if section in {"class", "additional"}:
        stmt = stmt.where(Material.section == section)
    stmt = stmt.order_by(Material.created_at.desc()).options(selectinload(Material.uploader))
    rows = (await db.execute(stmt)).scalars().all()
    return [await _serialize(m, m.uploader) for m in rows]


@router.post(
    "/courses/{course_id}/materials",
    response_model=MaterialOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(settings.upload_rate_limit)
async def upload_material(
    request: Request,
    course_id: str,
    current: CurrentUser,
    db: Database,
    file: UploadFile | None = File(default=None),
    source_url: str | None = Form(default=None),
    section: str = Form(default=MaterialSection.CLASS.value),
    folder: str = Form(default=""),
    tags: str = Form(default="[]"),
) -> MaterialOut:
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Permissions
    is_teacher = course.teacher_id == current.id or current.role == Role.ADMIN.value
    await assert_enrolled(db, current, course_id)  # also confirms teacher or student
    if section == MaterialSection.ADDITIONAL.value and not is_teacher:
        raise HTTPException(
            status_code=403, detail="Only teachers can upload to Additional Materials"
        )
    if section not in {MaterialSection.CLASS.value, MaterialSection.ADDITIONAL.value}:
        raise HTTPException(status_code=400, detail="Invalid section")

    has_file = file is not None and bool(file.filename)
    has_link = bool(source_url and source_url.strip())
    if has_file == has_link:
        raise HTTPException(status_code=400, detail="Provide either a file or an external link")

    safe_name = ""
    stored_path = ""
    size = 0
    mime = ""

    if has_file:
        assert file is not None
        if not is_supported(file.filename or ""):
            raise HTTPException(
                status_code=415, detail="Unsupported file type — PDF, DOCX, PPTX, TXT, MD only"
            )
        safe_name = Path(file.filename).name
        mime = detect_mime(safe_name)
    else:
        assert source_url is not None
        source_url = source_url.strip()
        parsed = urlparse(source_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(status_code=400, detail="source_url must be an http(s) URL")
        safe_name = infer_source_filename(source_url) or parsed.netloc.replace("www.", "") or "external-link"
        mime = "text/html"

    try:
        tag_list = json.loads(tags) if tags else []
        if not isinstance(tag_list, list) or not all(isinstance(t, str) for t in tag_list):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="tags must be a JSON array of strings") from None

    material_id = str(uuid.uuid4())
    if has_file:
        assert file is not None

        # Per-user storage quota: how much room is left?
        usage = int(
            await db.scalar(
                select(func.coalesce(func.sum(Material.size), 0)).where(
                    Material.uploader_id == current.id
                )
            )
            or 0
        )
        quota_bytes = settings.user_storage_quota_mb * 1024 * 1024
        remaining = quota_bytes - usage
        if remaining <= 0:
            raise HTTPException(
                status_code=413,
                detail=f"Storage quota reached ({settings.user_storage_quota_mb} MB). Delete some materials first.",
            )
        cap = min(MAX_UPLOAD_BYTES, remaining)

        # Peek the leading bytes and verify the REAL type by magic bytes (an
        # .exe renamed to .pdf is rejected here, before it touches storage).
        header = await file.read(4096)
        try:
            mime = validate_magic(safe_name, header)
        except UnsupportedFileError as e:
            await file.close()
            raise HTTPException(status_code=415, detail=str(e)) from None

        async def _iter_chunks():
            nonlocal size
            # Emit the already-read header first, then stream the rest, capping
            # at the smaller of the global limit and the user's remaining quota.
            for buf in (header,):
                size += len(buf)
                yield buf
            while True:
                chunk = await file.read(1024 * 1024)  # 1 MB
                if not chunk:
                    break
                size += len(chunk)
                if size > cap:
                    limit_mb = cap // (1024 * 1024)
                    raise ValueError(
                        f"File exceeds the {limit_mb} MB limit (max upload or your remaining quota)"
                    )
                yield chunk
            await file.close()

        try:
            stored = await get_storage().save(
                stream=_iter_chunks(),
                filename=safe_name,
                mime=mime,
                folder=course_id,
                key_hint=material_id,
            )
        except ValueError as e:
            raise HTTPException(status_code=413, detail=str(e)) from None
        except Exception as e:
            log.exception("Storage upload failed")
            raise HTTPException(status_code=502, detail=f"Upload storage failed: {e}") from None
        stored_path = stored.url
        mime = mime or stored.mime
    else:
        assert source_url is not None
        stored_path = source_url.strip()

    material = Material(
        id=material_id,
        course_id=course_id,
        uploader_id=current.id,
        section=section,
        filename=safe_name,
        path=stored_path,
        mime=mime,
        size=size,
        folder=folder,
        tags=tag_list,
        status=MaterialStatus.PROCESSING.value,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)

    # Enqueue durable ingestion (returns immediately; poll GET /jobs/{id} or the
    # material's status). No HTTP request blocks on parsing/embedding.
    job = await _create_ingestion_job(db, material, current.id)

    uploader = await db.get(User, current.id)
    return await _serialize(material, uploader, job)


@router.get("/materials/{material_id}", response_model=MaterialOut)
async def get_material(material_id: str, current: CurrentUser, db: Database) -> MaterialOut:
    material = await db.scalar(
        select(Material)
        .where(Material.id == material_id)
        .options(selectinload(Material.uploader))
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    await assert_enrolled(db, current, material.course_id)
    job = await _latest_job(db, material.id)
    return await _serialize(material, material.uploader, job)


@router.post("/materials/{material_id}/reingest", response_model=MaterialOut)
async def reingest_material(
    material_id: str, current: CurrentUser, db: Database
) -> MaterialOut:
    material = await db.scalar(
        select(Material)
        .where(Material.id == material_id)
        .options(selectinload(Material.uploader))
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    course = await db.get(Course, material.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    is_teacher = course.teacher_id == current.id or current.role == Role.ADMIN.value
    if not is_teacher and material.uploader_id != current.id:
        raise HTTPException(status_code=403, detail="Not permitted")
    material.status = MaterialStatus.PROCESSING.value
    material.status_detail = ""
    await db.commit()
    job = await _create_ingestion_job(db, material, current.id)
    return await _serialize(material, material.uploader, job)


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(material_id: str, current: CurrentUser, db: Database) -> None:
    material = await db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    course = await db.get(Course, material.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    is_teacher = course.teacher_id == current.id or current.role == Role.ADMIN.value
    if not is_teacher and material.uploader_id != current.id:
        raise HTTPException(status_code=403, detail="Not permitted")

    # Remove embeddings + blob (via the storage interface, so it works for both
    # local disk and Cloudinary), then the DB row. Jobs cascade on delete.
    try:
        await delete_material_chunks(course, material.id)
    except Exception as e:
        log.warning("Chunk deletion failed for %s: %s", material_id, e)
    try:
        if not is_web_url(material.path):
            await get_storage().delete(material.path)
    except Exception as e:
        log.warning("Blob deletion failed for %s: %s", material.path, e)

    await db.delete(material)
    await db.commit()
