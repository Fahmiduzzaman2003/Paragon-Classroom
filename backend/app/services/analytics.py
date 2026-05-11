"""Class-analytics aggregation service.

All numeric work is done in pure Python over rows already loaded by the router.
We avoid pulling pandas/numpy into the dep tree — the cohorts are class-sized
(< a few thousand attempts) and a couple of list comprehensions are plenty
fast. Functions return plain dicts shaped to match the Pydantic schemas.
"""
from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.assignment import Assignment, Submission
from ..models.conversation import Conversation, Message as ChatMessage
from ..models.enrollment import Enrollment
from ..models.quiz import Attempt, Question, Quiz
from ..models.user import User


# ─────────────────────────────────────────────────────
# Activity / engagement window
# ─────────────────────────────────────────────────────

ACTIVE_WINDOW = timedelta(days=7)
STALE_WINDOW = timedelta(days=14)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_pct(num: float, den: float) -> float:
    return round(100.0 * num / den, 1) if den else 0.0


def _stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    return statistics.pstdev(values)


def _mean(values: list[float]) -> float:
    return statistics.fmean(values) if values else 0.0


# ─────────────────────────────────────────────────────
# Top-level: build everything for the page in one pass
# ─────────────────────────────────────────────────────

async def gather_course_rows(db: AsyncSession, course_id: str) -> dict[str, Any]:
    """Pull every row we'll need. Returns a dict of lists keyed by entity."""
    enrollments = (
        (await db.execute(
            select(Enrollment, User)
            .join(User, User.id == Enrollment.user_id)
            .where(Enrollment.course_id == course_id)
        )).all()
    )

    quizzes = (
        (await db.execute(
            select(Quiz).where(Quiz.course_id == course_id).order_by(Quiz.created_at.asc())
        )).scalars().all()
    )
    quiz_ids = [q.id for q in quizzes]

    questions = (
        (await db.execute(
            select(Question).where(Question.quiz_id.in_(quiz_ids))
        )).scalars().all()
        if quiz_ids
        else []
    )

    attempts = (
        (await db.execute(
            select(Attempt).where(
                Attempt.quiz_id.in_(quiz_ids),
                Attempt.submitted_at.is_not(None),
            )
        )).scalars().all()
        if quiz_ids
        else []
    )

    assignments = (
        (await db.execute(
            select(Assignment).where(Assignment.course_id == course_id)
            .order_by(Assignment.deadline.asc())
        )).scalars().all()
    )
    assignment_ids = [a.id for a in assignments]

    submissions = (
        (await db.execute(
            select(Submission).where(Submission.assignment_id.in_(assignment_ids))
        )).scalars().all()
        if assignment_ids
        else []
    )

    # Chat activity (engagement signal). One row per message authored by a
    # student inside any of this course's conversations.
    chat_msg_counts = (
        await db.execute(
            select(Conversation.user_id, func.count(ChatMessage.id))
            .join(ChatMessage, ChatMessage.conversation_id == Conversation.id)
            .where(Conversation.course_id == course_id, ChatMessage.role == "user")
            .group_by(Conversation.user_id)
        )
    ).all()
    chat_msg_by_user: dict[str, int] = {row[0]: int(row[1]) for row in chat_msg_counts}

    last_chat = (
        await db.execute(
            select(Conversation.user_id, func.max(ChatMessage.created_at))
            .join(ChatMessage, ChatMessage.conversation_id == Conversation.id)
            .where(Conversation.course_id == course_id, ChatMessage.role == "user")
            .group_by(Conversation.user_id)
        )
    ).all()
    last_chat_by_user: dict[str, datetime] = {row[0]: row[1] for row in last_chat if row[1]}

    return {
        "enrollments": enrollments,  # list[(Enrollment, User)]
        "quizzes": quizzes,
        "questions": questions,
        "attempts": attempts,
        "assignments": assignments,
        "submissions": submissions,
        "chat_msg_by_user": chat_msg_by_user,
        "last_chat_by_user": last_chat_by_user,
    }


# ─────────────────────────────────────────────────────
# Section 1: Overview KPIs
# ─────────────────────────────────────────────────────

def build_overview(data: dict[str, Any]) -> dict[str, Any]:
    enrollments = data["enrollments"]
    attempts = data["attempts"]
    submissions = data["submissions"]
    chat_msgs = data["chat_msg_by_user"]
    last_chat = data["last_chat_by_user"]

    student_ids = [e.user_id for e, _ in enrollments]
    n_students = len(student_ids)

    # Per-student avg attempt percentage
    pct_by_student = _per_student_avg_pct(attempts)
    avg_class_pct = _mean(list(pct_by_student.values()))
    median_class_pct = statistics.median(pct_by_student.values()) if pct_by_student else 0.0
    sd = _stddev(list(pct_by_student.values()))

    # Active / stale segmentation
    now = _utcnow()
    last_attempt_by_student: dict[str, datetime] = {}
    for a in attempts:
        prev = last_attempt_by_student.get(a.student_id)
        ts = a.submitted_at or a.started_at
        if not prev or (ts and ts > prev):
            last_attempt_by_student[a.student_id] = ts  # type: ignore[assignment]

    def _last_seen(uid: str) -> datetime | None:
        a = last_attempt_by_student.get(uid)
        c = last_chat.get(uid)
        candidates = [x for x in (a, c) if x]
        return max(candidates) if candidates else None

    active = 0
    stale = 0
    inactive = 0
    for sid in student_ids:
        seen = _last_seen(sid)
        if not seen:
            inactive += 1
            continue
        seen_aware = seen if seen.tzinfo else seen.replace(tzinfo=timezone.utc)
        delta = now - seen_aware
        if delta <= ACTIVE_WINDOW:
            active += 1
        elif delta <= STALE_WINDOW:
            stale += 1
        else:
            inactive += 1

    # Submission rate (students who attempted any quiz / enrolled).
    submitting_students = {a.student_id for a in attempts}
    submission_rate = _safe_pct(len(submitting_students & set(student_ids)), n_students)

    # Pending teacher review across all submitted attempts
    pending_review = sum(
        1 for a in attempts if a.needs_manual_grading and not a.released
    )

    # Assignment grading queue
    assignments_to_grade = sum(1 for s in submissions if s.grade is None)
    assignments_total_subs = len(submissions)

    # Engagement
    chat_msg_total = sum(chat_msgs.values())
    avg_chat_per_student = round(chat_msg_total / n_students, 1) if n_students else 0.0

    return {
        "students_enrolled": n_students,
        "active_7d": active,
        "stale_7_14d": stale,
        "inactive_14d_plus": inactive,
        "submission_rate_pct": submission_rate,
        "avg_class_pct": round(avg_class_pct, 1),
        "median_class_pct": round(median_class_pct, 1),
        "stddev_class_pct": round(sd, 1),
        "min_class_pct": round(min(pct_by_student.values()), 1) if pct_by_student else 0.0,
        "max_class_pct": round(max(pct_by_student.values()), 1) if pct_by_student else 0.0,
        "total_quizzes": len(data["quizzes"]),
        "total_attempts": len(attempts),
        "pending_manual_review": pending_review,
        "total_assignments": len(data["assignments"]),
        "assignment_submissions": assignments_total_subs,
        "assignments_to_grade": assignments_to_grade,
        "chat_messages_total": chat_msg_total,
        "avg_chat_per_student": avg_chat_per_student,
    }


def _per_student_avg_pct(attempts: list[Attempt]) -> dict[str, float]:
    """Per-student average percent score across their submitted attempts."""
    by: dict[str, list[float]] = defaultdict(list)
    for a in attempts:
        if not a.max_score:
            continue
        by[a.student_id].append(100.0 * a.score / a.max_score)
    return {sid: _mean(scores) for sid, scores in by.items()}


# ─────────────────────────────────────────────────────
# Section 2: Score distribution histogram
# ─────────────────────────────────────────────────────

def build_score_distribution(data: dict[str, Any]) -> dict[str, Any]:
    """Histogram of per-student class average + per-attempt distribution."""
    pct_by_student = _per_student_avg_pct(data["attempts"])
    student_avgs = list(pct_by_student.values())

    # 10-bucket histogram (0-10, 10-20, ..., 90-100). Inclusive on the upper edge.
    bins = [0] * 10
    for v in student_avgs:
        idx = min(9, max(0, int(v // 10)))
        bins[idx] += 1
    histogram = [
        {"bucket": f"{i * 10}-{i * 10 + 10}", "count": bins[i]}
        for i in range(10)
    ]

    return {
        "histogram": histogram,
        "mean": round(_mean(student_avgs), 1),
        "median": round(statistics.median(student_avgs), 1) if student_avgs else 0.0,
        "stddev": round(_stddev(student_avgs), 1),
        "samples": len(student_avgs),
    }


# ─────────────────────────────────────────────────────
# Section 3: Per-student risk table
# ─────────────────────────────────────────────────────

def build_student_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    enrollments = data["enrollments"]
    attempts = data["attempts"]
    submissions = data["submissions"]
    chat_msgs = data["chat_msg_by_user"]
    last_chat = data["last_chat_by_user"]
    quizzes = data["quizzes"]
    assignments = data["assignments"]

    by_student_attempts: dict[str, list[Attempt]] = defaultdict(list)
    for a in attempts:
        by_student_attempts[a.student_id].append(a)
    by_student_subs: dict[str, list[Submission]] = defaultdict(list)
    for s in submissions:
        by_student_subs[s.student_id].append(s)

    now = _utcnow()
    rows: list[dict[str, Any]] = []
    n_quizzes = len(quizzes)
    n_assignments = len(assignments)

    # Build per-assignment deadline map for late-rate calc
    deadline_by_assignment = {a.id: a.deadline for a in assignments}

    for enrollment, user in enrollments:
        sid = user.id
        atts = by_student_attempts.get(sid, [])
        subs = by_student_subs.get(sid, [])

        # Score
        pct_list = [100.0 * a.score / a.max_score for a in atts if a.max_score]
        avg_pct = _mean(pct_list)

        # Late submissions (assignment deadline missed)
        late = 0
        for s in subs:
            d = deadline_by_assignment.get(s.assignment_id)
            if d and s.submitted_at:
                d_aware = d if d.tzinfo else d.replace(tzinfo=timezone.utc)
                sub_aware = s.submitted_at if s.submitted_at.tzinfo else s.submitted_at.replace(tzinfo=timezone.utc)
                if sub_aware > d_aware:
                    late += 1

        # Last activity
        last_att = max((a.submitted_at or a.started_at for a in atts), default=None)
        last_msg = last_chat.get(sid)
        candidates = [x for x in (last_att, last_msg) if x]
        last_seen = max(candidates) if candidates else None
        days_since = None
        if last_seen:
            la = last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
            days_since = max(0, (now - la).days)

        # Risk score (0-100)
        risk = 0
        # Score signal
        if pct_list:
            if avg_pct < 50:
                risk += 40
            elif avg_pct < 65:
                risk += 20
            elif avg_pct < 75:
                risk += 5
        else:
            risk += 25  # never submitted
        # Activity signal
        if days_since is None:
            risk += 30
        elif days_since >= 14:
            risk += 25
        elif days_since >= 7:
            risk += 10
        # Submission coverage
        coverage_quiz = _safe_pct(len({a.quiz_id for a in atts}), n_quizzes) if n_quizzes else 100.0
        if coverage_quiz < 50:
            risk += 15
        coverage_assn = _safe_pct(len(subs), n_assignments) if n_assignments else 100.0
        if coverage_assn < 50:
            risk += 10
        # Lateness
        if subs and (late / len(subs)) > 0.5:
            risk += 10

        risk = min(100, risk)
        risk_label = "high" if risk >= 60 else ("medium" if risk >= 30 else "low")

        rows.append(
            {
                "user_id": user.id,
                "name": user.name,
                "email": user.email,
                "avatar_url": user.avatar_url,
                "enrolled_at": getattr(enrollment, "joined_at", None),
                "attempts_count": len(atts),
                "avg_pct": round(avg_pct, 1),
                "submissions_count": len(subs),
                "late_count": late,
                "chat_messages": chat_msgs.get(sid, 0),
                "last_activity_at": last_seen,
                "days_since_active": days_since,
                "quiz_coverage_pct": round(coverage_quiz, 1),
                "assignment_coverage_pct": round(coverage_assn, 1),
                "risk_score": risk,
                "risk_label": risk_label,
            }
        )

    rows.sort(key=lambda r: (-r["risk_score"], -r["avg_pct"], r["name"].lower()))
    return rows


# ─────────────────────────────────────────────────────
# Section 4: Per-question difficulty + discrimination
# ─────────────────────────────────────────────────────

def build_question_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    """For every question across every attempt, compute difficulty & discrimination.

    `difficulty` = % of attempts that got it right (1.0 = trivial, 0.0 = nobody).
    `discrimination` = point-biserial-style correlation between getting THIS
        question right and the student's overall percent score on that attempt.
        Higher = the question separates strong from weak students.
    """
    questions: list[Question] = data["questions"]
    attempts: list[Attempt] = data["attempts"]
    quizzes: list[Quiz] = data["quizzes"]
    quiz_title = {q.id: q.title for q in quizzes}
    quiz_id_for_question = {q.id: q.quiz_id for q in questions}
    question_meta = {q.id: q for q in questions}

    # gather per-question correctness + per-attempt overall pct
    pairs_by_qid: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for a in attempts:
        if not a.max_score:
            continue
        overall = 100.0 * a.score / a.max_score
        graded = a.graded or {}
        for qid, g in graded.items():
            if qid not in question_meta:
                continue
            is_correct = 1 if g.get("correct") else 0
            pairs_by_qid[qid].append((is_correct, overall))

    rows: list[dict[str, Any]] = []
    for qid, pairs in pairs_by_qid.items():
        if not pairs:
            continue
        n = len(pairs)
        right_n = sum(p[0] for p in pairs)
        difficulty = right_n / n  # higher = easier
        overall_vals = [p[1] for p in pairs]
        right_overall = [p[1] for p in pairs if p[0] == 1]
        wrong_overall = [p[1] for p in pairs if p[0] == 0]

        # Point-biserial: r = (M_right - M_wrong) / sd(overall) * sqrt(p * (1 - p))
        if right_n in (0, n) or _stddev(overall_vals) == 0:
            discrimination = 0.0
        else:
            p = right_n / n
            sd_overall = _stddev(overall_vals)
            discrimination = (
                (_mean(right_overall) - _mean(wrong_overall)) / sd_overall
            ) * math.sqrt(p * (1 - p))

        q = question_meta[qid]
        rows.append(
            {
                "question_id": qid,
                "quiz_id": quiz_id_for_question.get(qid, ""),
                "quiz_title": quiz_title.get(quiz_id_for_question.get(qid, ""), ""),
                "type": q.type,
                "body": q.body[:200],
                "points": q.points,
                "n_responses": n,
                "difficulty": round(difficulty, 3),
                "discrimination": round(discrimination, 3),
                "flag": _question_flag(difficulty, discrimination),
            }
        )

    rows.sort(key=lambda r: (r["discrimination"], -(1 - r["difficulty"])))
    return rows


def _question_flag(difficulty: float, discrimination: float) -> str:
    """Heuristic label so the teacher can scan the table fast.

    - 'review'   : low discrimination AND low difficulty (hard + doesn't separate)
    - 'too easy' : difficulty > 0.92
    - 'good'     : discrimination ≥ 0.3
    - 'ok'       : everything else
    """
    if difficulty > 0.92:
        return "too easy"
    if discrimination < 0.1 and difficulty < 0.5:
        return "review"
    if discrimination >= 0.3:
        return "good"
    return "ok"


# ─────────────────────────────────────────────────────
# Section 5: Trends — quiz scores over time
# ─────────────────────────────────────────────────────

def build_trends(data: dict[str, Any]) -> dict[str, Any]:
    quizzes: list[Quiz] = data["quizzes"]
    attempts: list[Attempt] = data["attempts"]

    by_quiz: dict[str, list[float]] = defaultdict(list)
    for a in attempts:
        if a.max_score:
            by_quiz[a.quiz_id].append(100.0 * a.score / a.max_score)

    quiz_points: list[dict[str, Any]] = []
    for q in quizzes:
        pcts = by_quiz.get(q.id, [])
        if not pcts:
            continue
        quiz_points.append(
            {
                "quiz_id": q.id,
                "title": q.title,
                "created_at": q.created_at,
                "n": len(pcts),
                "mean": round(_mean(pcts), 1),
                "median": round(statistics.median(pcts), 1),
                "min": round(min(pcts), 1),
                "max": round(max(pcts), 1),
                "p25": round(_percentile(pcts, 25), 1),
                "p75": round(_percentile(pcts, 75), 1),
            }
        )

    # Submissions per day (last 30)
    now = _utcnow()
    daily_buckets: dict[str, int] = defaultdict(int)
    for a in attempts:
        if not a.submitted_at:
            continue
        ts = a.submitted_at if a.submitted_at.tzinfo else a.submitted_at.replace(tzinfo=timezone.utc)
        if (now - ts).days <= 30:
            day = ts.date().isoformat()
            daily_buckets[day] += 1
    submissions_by_day = sorted(
        ({"date": d, "count": c} for d, c in daily_buckets.items()),
        key=lambda x: x["date"],
    )

    return {
        "quiz_points": quiz_points,
        "submissions_by_day": submissions_by_day,
    }


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * (pct / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] + (s[c] - s[f]) * (k - f)


# ─────────────────────────────────────────────────────
# Section 6: Per-assignment stats
# ─────────────────────────────────────────────────────

def build_assignment_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    assignments: list[Assignment] = data["assignments"]
    submissions: list[Submission] = data["submissions"]
    n_students = len(data["enrollments"])

    by_assn: dict[str, list[Submission]] = defaultdict(list)
    for s in submissions:
        by_assn[s.assignment_id].append(s)

    rows: list[dict[str, Any]] = []
    for a in assignments:
        subs = by_assn.get(a.id, [])
        graded = [s for s in subs if s.grade is not None]
        grades = [float(s.grade or 0) for s in graded]
        late = 0
        d = a.deadline if a.deadline.tzinfo else a.deadline.replace(tzinfo=timezone.utc)
        for s in subs:
            ts = s.submitted_at if s.submitted_at.tzinfo else s.submitted_at.replace(tzinfo=timezone.utc)
            if ts > d:
                late += 1
        rows.append(
            {
                "assignment_id": a.id,
                "title": a.title,
                "deadline": a.deadline,
                "max_points": a.max_points,
                "submission_count": len(subs),
                "submission_rate_pct": _safe_pct(len(subs), n_students),
                "graded_count": len(graded),
                "grading_progress_pct": _safe_pct(len(graded), len(subs)) if subs else 0.0,
                "avg_grade": round(_mean(grades), 1) if grades else 0.0,
                "median_grade": round(statistics.median(grades), 1) if grades else 0.0,
                "late_count": late,
                "late_rate_pct": _safe_pct(late, len(subs)) if subs else 0.0,
            }
        )
    return rows


# ─────────────────────────────────────────────────────
# Section 7: AI-generated narrative insights
# ─────────────────────────────────────────────────────

_INSIGHTS_SYSTEM = (
    "You are a learning-analytics assistant for a university teacher. The user "
    "will paste a JSON snapshot of class metrics. Produce a TIGHT executive "
    "summary in GitHub-flavored Markdown with these sections, each ≤ 3 short "
    "bullets:\n"
    "  ### What's going well\n"
    "  ### What needs attention\n"
    "  ### Suggested next actions\n\n"
    "Be specific — name numbers and student counts where the data supports it. "
    "Never fabricate names or invent students. If a section has nothing to say, "
    "write 'No signal yet.' Do not output any other prose."
)


async def build_ai_insights(
    course_name: str,
    overview: dict[str, Any],
    student_rows: list[dict[str, Any]],
    question_rows: list[dict[str, Any]],
    trends: dict[str, Any],
) -> str:
    from .llm import Message, get_llm

    # Compact what we send so the LLM context stays small even on large classes.
    high_risk = [r for r in student_rows if r["risk_label"] == "high"]
    confusing_qs = [r for r in question_rows if r["flag"] == "review"][:5]
    snapshot = {
        "course": course_name,
        "overview": overview,
        "high_risk_students_count": len(high_risk),
        "high_risk_examples": [
            {
                "name": r["name"],
                "avg_pct": r["avg_pct"],
                "days_since_active": r["days_since_active"],
                "risk_score": r["risk_score"],
            }
            for r in high_risk[:5]
        ],
        "confusing_questions": [
            {
                "quiz": q["quiz_title"],
                "type": q["type"],
                "difficulty": q["difficulty"],
                "discrimination": q["discrimination"],
                "snippet": q["body"][:140],
            }
            for q in confusing_qs
        ],
        "quiz_score_trend": [
            {"title": p["title"], "mean": p["mean"], "n": p["n"]}
            for p in trends.get("quiz_points", [])[-6:]
        ],
    }

    import json

    user_prompt = f"## Class snapshot\n```json\n{json.dumps(snapshot, default=str)}\n```"

    llm = get_llm()
    parts: list[str] = []
    try:
        async for delta in llm.stream_completion(
            [Message(role="system", content=_INSIGHTS_SYSTEM), Message(role="user", content=user_prompt)],
            temperature=0.35,
            max_tokens=600,
        ):
            parts.append(delta)
    except Exception:  # noqa: BLE001
        return "_AI insights unavailable. Configure an LLM provider in `backend/.env`._"
    return "".join(parts).strip()
