from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


RagMode = Literal["strict", "balanced", "open"]


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    semester: str = Field(default="", max_length=40)
    gradient: str = Field(default="#815AFF,#FF46BE,#00C8FF", max_length=40)
    accent_hue: int = Field(default=268, ge=0, le=360)
    ai_name: str = Field(default="Course AI", max_length=80)
    ai_personality: str = Field(default="", max_length=2000)
    rag_mode: RagMode = "balanced"

    @field_validator("gradient")
    @classmethod
    def _validate_gradient(cls, v: str) -> str:
        parts = [p.strip() for p in v.split(",") if p.strip()]
        if len(parts) != 3 or not all(p.startswith("#") and len(p) in (4, 7) for p in parts):
            raise ValueError("gradient must be three #RRGGBB colors separated by commas")
        return ",".join(parts)


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    semester: str | None = Field(default=None, max_length=40)
    gradient: str | None = None
    accent_hue: int | None = Field(default=None, ge=0, le=360)
    ai_name: str | None = Field(default=None, max_length=80)
    ai_personality: str | None = Field(default=None, max_length=2000)
    rag_mode: RagMode | None = None


class CourseJoin(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    description: str
    semester: str
    gradient: str
    accent_hue: int
    ai_name: str
    ai_personality: str
    rag_mode: RagMode
    teacher_id: str
    teacher_name: str = ""
    student_count: int = 0
    material_count: int = 0
    enrolled: bool = False
    created_at: datetime
