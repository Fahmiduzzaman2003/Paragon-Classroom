from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ThreadCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=8000)
    tags: list[str] = []


class ThreadUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=8000)
    tags: list[str] | None = None
    pinned: bool | None = None
    answered: bool | None = None


class ReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class ReplyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    thread_id: str
    author_id: str
    author_name: str = ""
    body: str
    upvotes: int
    accepted: bool
    created_at: datetime


class ThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    author_id: str
    author_name: str = ""
    title: str
    body: str
    pinned: bool
    answered: bool
    upvotes: int
    tags: list[str]
    reply_count: int = 0
    created_at: datetime
    updated_at: datetime


class ThreadDetailOut(ThreadOut):
    replies: list[ReplyOut] = []
