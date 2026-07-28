"""Course deletion tests.

DELETE /courses/{id} is irreversible and fans out across a dozen tables, so the
things worth pinning down are: only the teacher of record can fire it, and when
it fires nothing is left behind pointing at a course that no longer exists.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from tests.conftest import auth_headers, login_as


async def _seed_full_course(teacher_id: str, student_id: str) -> str:
    """A course with one row in every table that hangs off it."""
    from app import database as _db
    from app.models.assignment import Assignment, Submission
    from app.models.conversation import Conversation, Message
    from app.models.course import Course
    from app.models.enrollment import Enrollment
    from app.models.event import Announcement, CalendarEvent
    from app.models.flashcard import Flashcard
    from app.models.forum import ForumReply, ForumThread
    from app.models.job import IngestionJob
    from app.models.material import Material
    from app.models.notification import Notification
    from app.models.quiz import Attempt, AttemptAttachment, Question, Quiz

    from datetime import datetime, timedelta, timezone

    async with _db.SessionLocal() as db:
        course = Course(name="Doomed Course", code="PRG-DEL1", teacher_id=teacher_id)
        db.add(course)
        await db.commit()
        await db.refresh(course)
        cid = course.id

        db.add(Enrollment(user_id=student_id, course_id=cid))

        quiz = Quiz(course_id=cid, title="Final", duration_min=30)
        db.add(quiz)
        await db.flush()
        question = Question(quiz_id=quiz.id, type="essay", body="Explain.", points=10)
        db.add(question)
        attempt = Attempt(quiz_id=quiz.id, student_id=student_id, score=8, max_score=10)
        db.add(attempt)
        await db.flush()
        db.add(
            AttemptAttachment(
                attempt_id=attempt.id,
                question_id=question.id,
                filename="answer.png",
                path="/uploads/answer.png",
            )
        )

        assignment = Assignment(
            course_id=cid,
            title="Homework 1",
            deadline=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(assignment)
        await db.flush()
        db.add(
            Submission(
                assignment_id=assignment.id,
                student_id=student_id,
                files=[{"filename": "hw.pdf", "path": "/uploads/hw.pdf", "size": 10}],
            )
        )

        thread = ForumThread(course_id=cid, author_id=student_id, title="Q?", body="body")
        db.add(thread)
        await db.flush()
        db.add(ForumReply(thread_id=thread.id, author_id=teacher_id, body="answer"))

        convo = Conversation(user_id=student_id, course_id=cid, title="Chat")
        db.add(convo)
        await db.flush()
        db.add(Message(conversation_id=convo.id, role="user", content="hi"))

        material = Material(
            course_id=cid,
            uploader_id=teacher_id,
            filename="notes.pdf",
            path="/uploads/notes.pdf",
            mime="application/pdf",
        )
        db.add(material)
        await db.flush()
        db.add(IngestionJob(user_id=teacher_id, material_id=material.id, course_id=cid))

        db.add(Flashcard(course_id=cid, user_id=student_id, front="q", back="a"))
        now = datetime.now(timezone.utc)
        db.add(
            CalendarEvent(
                course_id=cid,
                title="Lecture",
                type="lecture",
                start_at=now,
                end_at=now + timedelta(hours=1),
            )
        )
        db.add(Announcement(course_id=cid, author_id=teacher_id, title="Hi", body="all"))
        db.add(
            Notification(
                user_id=student_id, type="announcement", title="Hi", course_id=cid
            )
        )
        await db.commit()
        return cid


@pytest.mark.asyncio
async def test_student_cannot_delete_course(client: AsyncClient, make_user):
    teacher = await make_user(email="t.del@paragon.edu", role="teacher")
    student = await make_user(email="s.del@paragon.edu", role="student")
    course_id = await _seed_full_course(teacher.id, student.id)

    token = await login_as(client, "s.del@paragon.edu")
    resp = await client.delete(f"/courses/{course_id}", headers=await auth_headers(token))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_other_teacher_cannot_delete_course(client: AsyncClient, make_user):
    teacher = await make_user(email="t.del2@paragon.edu", role="teacher")
    student = await make_user(email="s.del2@paragon.edu", role="student")
    await make_user(email="rival@paragon.edu", role="teacher")
    course_id = await _seed_full_course(teacher.id, student.id)

    token = await login_as(client, "rival@paragon.edu")
    resp = await client.delete(f"/courses/{course_id}", headers=await auth_headers(token))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_delete_unknown_course_is_404(client: AsyncClient, make_user):
    await make_user(email="t.del3@paragon.edu", role="teacher")
    token = await login_as(client, "t.del3@paragon.edu")
    resp = await client.delete(
        "/courses/does-not-exist", headers=await auth_headers(token)
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_teacher_delete_purges_every_child_row(client: AsyncClient, make_user):
    teacher = await make_user(email="t.del4@paragon.edu", role="teacher")
    student = await make_user(email="s.del4@paragon.edu", role="student")
    course_id = await _seed_full_course(teacher.id, student.id)

    token = await login_as(client, "t.del4@paragon.edu")
    resp = await client.delete(f"/courses/{course_id}", headers=await auth_headers(token))
    assert resp.status_code == 204, resp.text

    from app import database as _db
    from app.models.assignment import Assignment, Submission
    from app.models.conversation import Conversation, Message
    from app.models.course import Course
    from app.models.enrollment import Enrollment
    from app.models.event import Announcement, CalendarEvent
    from app.models.flashcard import Flashcard
    from app.models.forum import ForumReply, ForumThread
    from app.models.job import IngestionJob
    from app.models.material import Material
    from app.models.notification import Notification
    from app.models.quiz import Attempt, AttemptAttachment, Question, Quiz

    async with _db.SessionLocal() as db:
        assert await db.get(Course, course_id) is None
        # Every table that referenced the course — directly or through one of
        # its children — must be empty, or a Postgres FK would have blocked us.
        for model in (
            Enrollment, Material, IngestionJob, Flashcard, CalendarEvent,
            Announcement, Notification, Quiz, Question, Attempt,
            AttemptAttachment, Assignment, Submission, ForumThread, ForumReply,
            Conversation, Message,
        ):
            count = await db.scalar(select(func.count()).select_from(model))
            assert count == 0, f"{model.__name__} still has {count} row(s)"

    # The course is gone from the teacher's listing too.
    listing = await client.get("/courses", headers=await auth_headers(token))
    assert listing.status_code == 200
    assert all(c["id"] != course_id for c in listing.json())
