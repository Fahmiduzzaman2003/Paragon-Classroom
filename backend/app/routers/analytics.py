from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException

from ..dependencies import CurrentUser, Database
from ..models.course import Course
from ..models.user import Role
from ..schemas.analytics import (
    AnalyticsBundle,
    AnalyticsInsights,
    AnalyticsOverview,
    AssignmentRow,
    QuestionRow,
    ScoreDistribution,
    StudentRow,
    TrendsOut,
)
from ..services.analytics import (
    build_ai_insights,
    build_assignment_rows,
    build_overview,
    build_question_rows,
    build_score_distribution,
    build_student_rows,
    build_trends,
    gather_course_rows,
)

log = logging.getLogger(__name__)
router = APIRouter()

# Brief in-process cache for the dashboard bundle. A teacher reloading the page
# (or several tabs) shouldn't re-scan the DB every few seconds on a cold free
# tier. TTL is short so numbers stay near-live. (Documented single-instance
# limitation; a multi-instance deploy would move this to Redis.)
_BUNDLE_TTL_S = 30
_bundle_cache: dict[str, tuple[float, object]] = {}


async def _ensure_teacher(db, course_id: str, user) -> Course:
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != user.id and user.role != Role.ADMIN.value:
        raise HTTPException(status_code=403, detail="Only the course teacher can view analytics")
    return course


@router.get("/courses/{course_id}/analytics", response_model=AnalyticsBundle)
async def get_analytics_bundle(
    course_id: str, current: CurrentUser, db: Database
) -> AnalyticsBundle:
    """One-shot bundle that powers the entire teacher dashboard."""
    await _ensure_teacher(db, course_id, current)

    cached = _bundle_cache.get(course_id)
    if cached and cached[0] > time.monotonic():
        return cached[1]  # type: ignore[return-value]

    data = await gather_course_rows(db, course_id)

    overview = build_overview(data)
    distribution = build_score_distribution(data)
    students = build_student_rows(data)
    questions = build_question_rows(data)
    trends = build_trends(data)
    assignments = build_assignment_rows(data)

    bundle = AnalyticsBundle(
        overview=AnalyticsOverview(**overview),
        score_distribution=ScoreDistribution(**distribution),
        students=[StudentRow.model_validate(r) for r in students],
        questions=[QuestionRow.model_validate(r) for r in questions],
        trends=TrendsOut.model_validate(trends),
        assignments=[AssignmentRow.model_validate(r) for r in assignments],
    )
    _bundle_cache[course_id] = (time.monotonic() + _BUNDLE_TTL_S, bundle)
    return bundle


@router.get("/courses/{course_id}/analytics/insights", response_model=AnalyticsInsights)
async def get_analytics_insights(
    course_id: str, current: CurrentUser, db: Database
) -> AnalyticsInsights:
    """LLM-generated narrative summary. Cheaper to keep separate so the bundle
    endpoint stays fast and the teacher can opt into the AI summary on demand."""
    course = await _ensure_teacher(db, course_id, current)
    data = await gather_course_rows(db, course_id)
    overview = build_overview(data)
    students = build_student_rows(data)
    questions = build_question_rows(data)
    trends = build_trends(data)
    summary = await build_ai_insights(course.name, overview, students, questions, trends)
    return AnalyticsInsights(summary=summary)
