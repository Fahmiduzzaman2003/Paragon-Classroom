from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


NotificationType = Literal[
    "announcement",
    "graded",
    "quiz_reminder",
    "mention",
    "forum_reply",
    "material_ready",
    "assignment_due",
]


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: NotificationType
    title: str
    body: str
    course_id: str | None = None
    course_name: str | None = None
    payload: dict = {}
    read: bool
    created_at: datetime
