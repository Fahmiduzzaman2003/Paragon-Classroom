from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class JobStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class JobStage(StrEnum):
    QUEUED = "queued"
    EXTRACT = "extract"
    CHUNK = "chunk"
    EMBED = "embed"
    UPSERT = "upsert"
    DONE = "done"


def _uuid() -> str:
    return str(uuid.uuid4())


class IngestionJob(Base):
    """Durable record of one document-ingestion run.

    The row is the source of truth for progress (the frontend polls it) AND the
    recovery anchor: on boot we scan for jobs left ``processing`` by a crash /
    redeploy and requeue them, so a mid-ingest restart is recoverable rather
    than a document stuck forever. Idempotent by ``material_id`` — re-running a
    job replaces that material's chunks.
    """

    __tablename__ = "ingestion_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    material_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("materials.id", ondelete="CASCADE"), index=True, nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    status: Mapped[str] = mapped_column(String(16), default=JobStatus.QUEUED.value, index=True, nullable=False)
    stage: Mapped[str] = mapped_column(String(16), default=JobStage.QUEUED.value, nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0..100
    error: Mapped[str] = mapped_column(Text, default="", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
