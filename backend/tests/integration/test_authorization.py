"""Authorization / tenant-isolation tests.

A student must never read another student's attempts, or a course's materials /
analytics they're not part of — by ID guessing or otherwise. These guard against
IDOR regressions.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, login_as


async def _seed_course_with_attempt(student_id: str, teacher_id: str):
    """Create a course, quiz, and a submitted attempt owned by ``student_id``."""
    from app import database as _db
    from app.models.course import Course
    from app.models.quiz import Attempt, Quiz

    async with _db.SessionLocal() as db:
        course = Course(name="Secure Bio", code="PRG-SEC1", teacher_id=teacher_id)
        db.add(course)
        await db.commit()
        await db.refresh(course)
        quiz = Quiz(course_id=course.id, title="Exam 1", duration_min=30)
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)
        attempt = Attempt(quiz_id=quiz.id, student_id=student_id, score=90, max_score=100)
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)
        return course.id, quiz.id, attempt.id


@pytest.mark.asyncio
async def test_student_cannot_read_another_students_attempt(
    client: AsyncClient, make_user
):
    teacher = await make_user(email="t.authz@paragon.edu", role="teacher")
    victim = await make_user(email="victim@paragon.edu", role="student")
    attacker = await make_user(email="attacker@paragon.edu", role="student")
    _, _, attempt_id = await _seed_course_with_attempt(victim.id, teacher.id)

    token = await login_as(client, "attacker@paragon.edu")
    resp = await client.get(f"/attempts/{attempt_id}", headers=await auth_headers(token))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_non_enrolled_student_cannot_list_materials(
    client: AsyncClient, make_user
):
    teacher = await make_user(email="t.authz2@paragon.edu", role="teacher")
    outsider = await make_user(email="outsider@paragon.edu", role="student")
    course_id, _, _ = await _seed_course_with_attempt(
        (await make_user(email="enrolled@paragon.edu", role="student")).id, teacher.id
    )

    token = await login_as(client, "outsider@paragon.edu")
    resp = await client.get(f"/courses/{course_id}/materials", headers=await auth_headers(token))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_student_cannot_read_course_analytics(client: AsyncClient, make_user):
    teacher = await make_user(email="t.authz3@paragon.edu", role="teacher")
    student = await make_user(email="s.authz3@paragon.edu", role="student")
    course_id, _, _ = await _seed_course_with_attempt(student.id, teacher.id)

    token = await login_as(client, "s.authz3@paragon.edu")
    resp = await client.get(f"/courses/{course_id}/analytics", headers=await auth_headers(token))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_student_cannot_read_admin_llm_health(client: AsyncClient, make_user):
    await make_user(email="s.admin@paragon.edu", role="student")
    token = await login_as(client, "s.admin@paragon.edu")
    resp = await client.get("/admin/llm/health", headers=await auth_headers(token))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_unauthenticated_requests_are_rejected(client: AsyncClient):
    assert (await client.get("/auth/me")).status_code == 401
    assert (await client.get("/attempts/does-not-exist")).status_code == 401
