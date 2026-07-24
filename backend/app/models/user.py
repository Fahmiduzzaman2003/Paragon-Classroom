from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .course import Course
    from .enrollment import Enrollment
    from .material import Material


class Role(StrEnum):
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(16), default=Role.STUDENT.value, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    institution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Google's stable subject id. We key OAuth users on this (not email — emails
    # can change or be reassigned). Nullable for password-only accounts.
    google_sub: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True, nullable=True
    )
    # Firebase Authentication uid — the canonical link when Firebase auth is on.
    firebase_uid: Mapped[str | None] = mapped_column(
        String(128), unique=True, index=True, nullable=True
    )
    # Email verification (added in security hardening pass)
    email_verified: Mapped[bool] = mapped_column(default=False, nullable=False, server_default="0")
    # Password reset token hash + expiry (avoid storing plaintext tokens at rest)
    password_reset_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    courses_taught: Mapped[list["Course"]] = relationship(
        back_populates="teacher",
        foreign_keys="Course.teacher_id",
    )
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="user")
    uploads: Mapped[list["Material"]] = relationship(back_populates="uploader")
