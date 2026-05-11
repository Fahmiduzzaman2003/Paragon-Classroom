from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .course import Course
    from .user import User


class QuestionType(StrEnum):
    MCQ_SINGLE = "mcq_single"
    MCQ_MULTI = "mcq_multi"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"
    CODE = "code"
    ESSAY = "essay"


class QuizStatus(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    LIVE = "live"
    CLOSED = "closed"


def _uuid() -> str:
    return str(uuid.uuid4())


def _exam_code() -> str:
    # 6-char alphanumeric code, e.g. "X7K2QA"
    import secrets
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no easy-confuse chars
    return "".join(secrets.choice(alphabet) for _ in range(6))


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_results: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_retake: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    one_question_at_a_time: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Exam-mode additions: a unique join code that students enter to enter the exam,
    # and a flag that switches the UI into the strict "exam" environment (proctored
    # timer, no leaving, attachments allowed, manual review for written answers).
    exam_code: Mapped[str | None] = mapped_column(
        String(8), unique=True, index=True, default=_exam_code, nullable=True
    )
    exam_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Lockdown / proctoring: blocks copy-paste, watches for tab-switches and
    # fullscreen exits, and records each violation on the attempt.
    proctoring_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    status: Mapped[str] = mapped_column(String(16), default=QuizStatus.DRAFT.value, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    course: Mapped["Course"] = relationship()
    questions: Mapped[list["Question"]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="Question.position",
    )
    attempts: Mapped[list["Attempt"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    quiz_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quizzes.id"), index=True, nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    type: Mapped[str] = mapped_column(String(20), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # For MCQ: list[str] options. For T/F: ["True","False"]. For short/code: [].
    options: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    # For MCQ_*: list[int] of correct option indices.
    # For T/F:   [0] or [1].
    # For short_answer: list[str] of accepted answers (case-insensitive substring match).
    # For code: list[str] of regex patterns to match against the submission.
    # For essay: [] (manual grading only).
    correct: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Allows students to upload a paper/photo for written answers.
    accepts_attachment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Optional teacher-supplied image shown alongside the question (diagrams,
    # graphs, lab photos, etc.). Stored on disk; served via the API.
    image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)

    quiz: Mapped["Quiz"] = relationship(back_populates="questions")


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    quiz_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("quizzes.id"), index=True, nullable=False
    )
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # answers: dict mapping question_id -> {"selected": list[int], "text": str}
    answers: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # graded: dict mapping question_id -> {"correct": bool, "points": int, "feedback": str, "auto": bool}
    graded: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    needs_manual_grading: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Proctoring violations recorded by the client during a live attempt:
    # [{"type": "tab_blur", "at": "...iso...", "extra": {...}}]
    violations: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    # Teacher releases written-answer marks once review is done. Until released, the
    # student sees a "pending review" placeholder for those questions.
    released: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    teacher_feedback: Mapped[str] = mapped_column(Text, default="", nullable=False)

    quiz: Mapped["Quiz"] = relationship(back_populates="attempts")
    student: Mapped["User"] = relationship()
    attachments: Mapped[list["AttemptAttachment"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )


class AttemptAttachment(Base):
    """File a student uploaded for a written-answer question (e.g. photo of paper)."""
    __tablename__ = "attempt_attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    attempt_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("attempts.id"), index=True, nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("questions.id"), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    mime: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    attempt: Mapped["Attempt"] = relationship(back_populates="attachments")
