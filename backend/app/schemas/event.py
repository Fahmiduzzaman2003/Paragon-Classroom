from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


EventType = Literal["quiz", "assignment", "lecture", "office_hours", "custom"]


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    start_at: datetime
    end_at: datetime
    type: EventType = "custom"


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    start_at: datetime | None = None
    end_at: datetime | None = None
    type: EventType | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    description: str
    start_at: datetime
    end_at: datetime
    type: EventType
    source_ref: str | None = None


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=8000)
    pinned: bool = False


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    author_id: str
    author_name: str = ""
    title: str
    body: str
    pinned: bool
    created_at: datetime
