from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class AnalyticsOverview(BaseModel):
    students_enrolled: int
    active_7d: int
    stale_7_14d: int
    inactive_14d_plus: int
    submission_rate_pct: float
    avg_class_pct: float
    median_class_pct: float
    stddev_class_pct: float
    min_class_pct: float
    max_class_pct: float
    total_quizzes: int
    total_attempts: int
    pending_manual_review: int
    total_assignments: int
    assignment_submissions: int
    assignments_to_grade: int
    chat_messages_total: int
    avg_chat_per_student: float


class HistogramBucket(BaseModel):
    bucket: str
    count: int


class ScoreDistribution(BaseModel):
    histogram: list[HistogramBucket]
    mean: float
    median: float
    stddev: float
    samples: int


class StudentRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    name: str
    email: str
    avatar_url: str | None = None
    enrolled_at: datetime | None = None
    attempts_count: int
    avg_pct: float
    submissions_count: int
    late_count: int
    chat_messages: int
    last_activity_at: datetime | None = None
    days_since_active: int | None = None
    quiz_coverage_pct: float
    assignment_coverage_pct: float
    risk_score: int
    risk_label: Literal["low", "medium", "high"]


class QuestionRow(BaseModel):
    question_id: str
    quiz_id: str
    quiz_title: str
    type: str
    body: str
    points: int
    n_responses: int
    difficulty: float
    discrimination: float
    flag: Literal["good", "ok", "review", "too easy"]


class QuizTrendPoint(BaseModel):
    quiz_id: str
    title: str
    created_at: datetime
    n: int
    mean: float
    median: float
    min: float
    max: float
    p25: float
    p75: float


class DailyCount(BaseModel):
    date: str
    count: int


class TrendsOut(BaseModel):
    quiz_points: list[QuizTrendPoint]
    submissions_by_day: list[DailyCount]


class AssignmentRow(BaseModel):
    assignment_id: str
    title: str
    deadline: datetime
    max_points: int
    submission_count: int
    submission_rate_pct: float
    graded_count: int
    grading_progress_pct: float
    avg_grade: float
    median_grade: float
    late_count: int
    late_rate_pct: float


class AnalyticsBundle(BaseModel):
    """Single response that powers the whole dashboard in one call."""
    overview: AnalyticsOverview
    score_distribution: ScoreDistribution
    students: list[StudentRow]
    questions: list[QuestionRow]
    trends: TrendsOut
    assignments: list[AssignmentRow]


class AnalyticsInsights(BaseModel):
    summary: str
