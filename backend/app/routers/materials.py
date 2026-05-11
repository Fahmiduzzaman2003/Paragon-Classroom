from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..config import settings
from ..dependencies import CurrentUser, Database, assert_enrolled
from ..models.course import Course
from ..models.material import Material, MaterialSection, MaterialStatus
from ..models.user import Role, User
from ..schemas.material import MaterialOut
from ..services.ingestion import delete_material_chunks, ingest_material
from ..utils.file_parsers import MAX_UPLOAD_BYTES, detect_mime, is_supported
from ..utils.web_parsers import infer_source_filename, is_web_url

log = logging.getLogger(__name__)
router = APIRouter()


async def _serialize(material: Material, uploader: User | None) -> MaterialOut:
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
        source_url=material.path if is_web_url(material.path) else None,
        source_kind="link" if is_web_url(material.path) else "file",
        status=material.status,  # type: ignore[arg-type]
        status_detail=material.status_detail,
        chunk_count=material.chunk_count,
        page_count=material.page_count,
        created_at=material.created_at,
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
async def upload_material(
    course_id: str,
    current: CurrentUser,
    db: Database,
    background: BackgroundTasks,
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
        course_dir = settings.uploads_dir / course_id
        course_dir.mkdir(parents=True, exist_ok=True)
        stored_file = course_dir / f"{material_id}__{safe_name}"
        stored_path = str(stored_file)

        try:
            with stored_file.open("wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)  # 1 MB
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        f.close()
                        stored_file.unlink(missing_ok=True)
                        raise HTTPException(status_code=413, detail="File exceeds 40 MB limit")
                    f.write(chunk)
        finally:
            await file.close()
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

    # Kick ingestion off in the background. This yields a quick HTTP response and
    # the status flips to "ready" once embeddings are written to Chroma.
    background.add_task(ingest_material, material.id)

    uploader = await db.get(User, current.id)
    return await _serialize(material, uploader)


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
    return await _serialize(material, material.uploader)


@router.post("/materials/{material_id}/reingest", response_model=MaterialOut)
async def reingest_material(
    material_id: str, current: CurrentUser, db: Database, background: BackgroundTasks
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
    background.add_task(ingest_material, material.id)
    return await _serialize(material, material.uploader)


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

    # Remove embeddings + file, then the DB row
    try:
        await delete_material_chunks(course, material.id)
    except Exception as e:
        log.warning("Chunk deletion failed for %s: %s", material_id, e)
    try:
        if not is_web_url(material.path):
            Path(material.path).unlink(missing_ok=True)
    except Exception as e:
        log.warning("File deletion failed for %s: %s", material.path, e)

    await db.delete(material)
    await db.commit()
