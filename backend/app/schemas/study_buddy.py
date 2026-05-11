from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FlashcardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    course_id: str
    user_id: str
    front: str
    back: str
    source_filename: str = ""
    source_page: int = 0
    ease: float
    interval_days: int
    review_count: int
    due_at: datetime
    last_reviewed_at: datetime | None = None
    created_at: datetime


class FlashcardGenerateInput(BaseModel):
    count: int = Field(default=10, ge=1, le=30)
    instructions: str = Field(default="", max_length=1000)


class FlashcardCreateInput(BaseModel):
    front: str = Field(min_length=1, max_length=400)
    back: str = Field(min_length=1, max_length=2000)
    source_filename: str = ""
    source_page: int = 0


class FlashcardReviewInput(BaseModel):
    quality: int = Field(ge=0, le=5)


class PracticeRequest(BaseModel):
    instructions: str = Field(default="", max_length=500)


class PracticeQuestion(BaseModel):
    type: Literal["mcq_single", "true_false"]
    body: str
    options: list[str]
    correct: list[int]
    explanation: str = ""


class ExplainWrongInput(BaseModel):
    # Most explain calls pull state straight from the attempt; this input is
    # reserved for free-form "explain this question" requests later.
    extra: str = Field(default="", max_length=500)
