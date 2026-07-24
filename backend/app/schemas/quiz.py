from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QuestionType = Literal[
    "mcq_single", "mcq_multi", "true_false", "short_answer", "code", "essay"
]
QuizStatus = Literal["draft", "scheduled", "live", "closed"]


class QuestionBase(BaseModel):
    type: QuestionType
    body: str = Field(min_length=1, max_length=4000)
    options: list[str] = []
    correct: list = []
    points: int = Field(default=10, ge=1, le=1000)
    explanation: str = Field(default="", max_length=4000)
    accepts_attachment: bool = False


class QuestionCreate(QuestionBase):
    position: int | None = None


class QuestionOut(QuestionBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    quiz_id: str
    position: int
    has_image: bool = False


# A "safe" question shape for active attempts: hides `correct` and `explanation`.
class QuestionSafeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    quiz_id: str
    position: int
    type: QuestionType
    body: str
    options: list[str]
    points: int
    accepts_attachment: bool = False
    has_image: bool = False


class QuizCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    duration_min: int = Field(default=30, ge=1, le=600)
    start_at: datetime | None = None
    end_at: datetime | None = None
    shuffle_questions: bool = True
    show_results: bool = True
    allow_retake: bool = False
    one_question_at_a_time: bool = False
    exam_mode: bool = False
    proctoring_enabled: bool = False
    status: QuizStatus = "draft"
    questions: list[QuestionCreate] = []


class QuizUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    duration_min: int | None = Field(default=None, ge=1, le=600)
    start_at: datetime | None = None
    end_at: datetime | None = None
    shuffle_questions: bool | None = None
    show_results: bool | None = None
    allow_retake: bool | None = None
    one_question_at_a_time: bool | None = None
    exam_mode: bool | None = None
    proctoring_enabled: bool | None = None
    status: QuizStatus | None = None


class QuizOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    course_id: str
    title: str
    description: str
    duration_min: int
    start_at: datetime | None
    end_at: datetime | None
    shuffle_questions: bool
    show_results: bool
    allow_retake: bool
    one_question_at_a_time: bool
    exam_mode: bool = False
    exam_code: str | None = None
    proctoring_enabled: bool = False
    status: QuizStatus
    question_count: int = 0
    total_points: int = 0
    submission_count: int = 0
    my_attempt_id: str | None = None
    my_score: int | None = None
    created_at: datetime


class QuizDetailOut(QuizOut):
    questions: list[QuestionOut] = []


class AnswerInput(BaseModel):
    question_id: str
    selected: list[int] = []
    text: str = ""


class AttemptStartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    quiz_id: str
    started_at: datetime
    questions: list[QuestionSafeOut]
    duration_min: int


class AttemptSubmitInput(BaseModel):
    answers: list[AnswerInput] = []
    # Optional client-generated key for idempotent submission (retry-safe).
    idempotency_key: str | None = None


class GradedQuestion(BaseModel):
    question_id: str
    correct: bool
    points: int
    max_points: int
    feedback: str = ""
    auto: bool = True
    # True once a teacher has manually marked this answer (only relevant for
    # non-auto items). Auto-graded entries are always considered "reviewed".
    reviewed: bool = True
    explanation: str = ""
    student_text: str = ""
    student_selected: list[int] = []
    attachments: list["AttachmentOut"] = []


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    filename: str
    mime: str
    size: int
    uploaded_at: datetime


class ViolationEvent(BaseModel):
    type: str = Field(min_length=1, max_length=64)
    at: datetime
    extra: dict = {}


class AttemptResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    quiz_id: str
    started_at: datetime
    submitted_at: datetime | None
    score: int
    max_score: int
    # Sub-totals so the UI can show the auto vs manual split that makes up
    # the final score.
    auto_score: int = 0
    manual_score: int = 0
    auto_max: int = 0
    manual_max: int = 0
    pending_manual: int = 0
    needs_manual_grading: bool
    released: bool = False
    teacher_feedback: str = ""
    violations: list[ViolationEvent] = []
    graded: list[GradedQuestion] = []


class ViolationInput(BaseModel):
    type: str = Field(min_length=1, max_length=64)
    extra: dict = {}


class QuizStatusOut(BaseModel):
    quiz_id: str
    status: QuizStatus
    server_now: datetime
    start_at: datetime | None = None
    end_at: datetime | None = None
    starts_in_seconds: int | None = None
    ends_in_seconds: int | None = None
    can_start: bool
    duration_min: int
    proctoring_enabled: bool = False


class AttemptSummaryOut(BaseModel):
    """Lightweight row in the teacher's exam folder for a quiz."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    quiz_id: str
    student_id: str
    student_name: str
    started_at: datetime
    submitted_at: datetime | None
    score: int
    max_score: int
    needs_manual_grading: bool
    released: bool
    attachment_count: int = 0


class JoinByCodeInput(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class JoinByCodeOut(BaseModel):
    quiz_id: str
    course_id: str
    title: str
    duration_min: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: QuizStatus
    exam_mode: bool


class ManualGradeInput(BaseModel):
    question_id: str
    points: int = Field(ge=0)
    feedback: str = Field(default="", max_length=2000)
    correct: bool | None = None


class ReleaseInput(BaseModel):
    teacher_feedback: str = Field(default="", max_length=2000)


# Resolve forward refs introduced by GradedQuestion → AttachmentOut
GradedQuestion.model_rebuild()


class LeaderboardEntryOut(BaseModel):
    rank: int
    user_id: str
    name: str
    avatar_url: str | None = None
    points: int
    quizzes_taken: int
    streak: int = 0


class GenerateQuizRequest(BaseModel):
    """LLM-assisted draft of a quiz from the course materials."""
    title: str = Field(default="AI-generated practice quiz", max_length=200)
    num_questions: int = Field(default=6, ge=1, le=20)
    types: list[QuestionType] = ["mcq_single", "true_false", "short_answer"]
    instructions: str = Field(default="", max_length=2000)
