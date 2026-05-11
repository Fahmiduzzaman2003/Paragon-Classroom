from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class MaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    uploader_id: str
    uploader_name: str = ""
    section: Literal["class", "additional"]
    filename: str
    mime: str
    size: int
    folder: str
    tags: list[str]
    source_url: str | None = None
    source_kind: Literal["file", "link"] = "file"
    status: Literal["processing", "ready", "failed"]
    status_detail: str = ""
    chunk_count: int
    page_count: int
    created_at: datetime
