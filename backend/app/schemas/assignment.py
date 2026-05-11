from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AssignmentStatus = Literal["open", "closed", "draft"]


class RubricCriterion(BaseModel):
    name: str
    max_points: int = Field(ge=0, le=1000)
    description: str = ""


class AssignmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=8000)
    deadline: datetime
    max_points: int = Field(default=100, ge=1, le=1000)
    rubric: list[RubricCriterion] = []
    status: AssignmentStatus = "open"


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=8000)
    deadline: datetime | None = None
    max_points: int | None = Field(default=None, ge=1, le=1000)
    rubric: list[RubricCriterion] | None = None
    status: AssignmentStatus | None = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    description: str
    deadline: datetime
    max_points: int
    rubric: list[dict] = []
    status: AssignmentStatus
    submission_count: int = 0
    graded_count: int = 0
    my_submission_id: str | None = None
    my_grade: int | None = None
    created_at: datetime


class SubmissionCreate(BaseModel):
    text: str = Field(default="", max_length=20000)
    files: list[dict] = []  # {filename, path, size}


class SubmissionGrade(BaseModel):
    grade: int = Field(ge=0, le=1000)
    feedback: str = Field(default="", max_length=8000)
    rubric_scores: list[dict] = []  # {name, points}


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    assignment_id: str
    student_id: str
    student_name: str = ""
    text: str
    files: list[dict] = []
    submitted_at: datetime
    grade: int | None = None
    feedback: str = ""
    rubric_scores: list[dict] = []
    graded_at: datetime | None = None
    is_late: bool = False
