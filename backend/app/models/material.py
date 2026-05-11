from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .course import Course
    from .user import User


class MaterialSection(StrEnum):
    CLASS = "class"
    ADDITIONAL = "additional"


class MaterialStatus(StrEnum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


def _uuid() -> str:
    return str(uuid.uuid4())


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id"), index=True, nullable=False
    )
    uploader_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    section: Mapped[str] = mapped_column(String(16), default=MaterialSection.CLASS.value, nullable=False)

    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    path: Mapped[str] = mapped_column(String(600), nullable=False)
    mime: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    folder: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    status: Mapped[str] = mapped_column(String(20), default=MaterialStatus.PROCESSING.value, nullable=False)
    status_detail: Mapped[str] = mapped_column(Text, default="", nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    course: Mapped["Course"] = relationship(back_populates="materials")
    uploader: Mapped["User"] = relationship(back_populates="uploads")
