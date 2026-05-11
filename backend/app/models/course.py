from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .user import User
    from .enrollment import Enrollment
    from .material import Material
    from .conversation import Conversation


def _uuid() -> str:
    return str(uuid.uuid4())


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    semester: Mapped[str] = mapped_column(String(40), default="", nullable=False)

    # Visual identity: three hex colors forming the gradient, stored as "#RRGGBB,#RRGGBB,#RRGGBB".
    gradient: Mapped[str] = mapped_column(
        String(40), default="#815AFF,#FF46BE,#00C8FF", nullable=False
    )
    accent_hue: Mapped[int] = mapped_column(Integer, default=268, nullable=False)

    # Dedicated AI
    ai_name: Mapped[str] = mapped_column(String(80), default="Course AI", nullable=False)
    ai_personality: Mapped[str] = mapped_column(Text, default="", nullable=False)
    rag_mode: Mapped[str] = mapped_column(String(20), default="balanced", nullable=False)

    teacher_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    teacher: Mapped["User"] = relationship(back_populates="courses_taught", foreign_keys=[teacher_id])
    enrollments: Mapped[list["Enrollment"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    materials: Mapped[list["Material"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )

    @property
    def collection_name(self) -> str:
        return f"course_{self.id.replace('-', '')}"
