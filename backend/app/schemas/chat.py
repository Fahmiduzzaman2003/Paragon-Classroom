from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    rag_mode: Literal["strict", "balanced", "open"] | None = None
    # Continuous grounding control (0–100): how much the answer should rely on the
    # course materials vs. the model's general knowledge. Takes precedence over
    # rag_mode when set. 95≈strict, 50≈balanced, 20≈open.
    grounding: int | None = Field(default=None, ge=0, le=100)
    scoped_material_id: str | None = None  # "Ask AI on this file"
    debug: bool = False


class CitationOut(BaseModel):
    id: str
    material_id: str
    filename: str
    page: int
    chunk_index: int
    score: float
    source_url: str | None = None
    snippet: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: Literal["user", "assistant", "system"]
    content: str
    citations: list[dict] = []
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class RagDebugChunk(BaseModel):
    material_id: str
    filename: str
    page: int
    chunk_index: int
    score: float
    snippet: str
