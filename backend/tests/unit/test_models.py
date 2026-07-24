"""Unit tests for SQLAlchemy model defaults and constraints.

Uses an in-memory SQLite engine to flush each object so server-side + Python
defaults (id, role, email_verified) actually populate, then asserts them.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Force all models to register with this Base before we create tables.
from app.database import Base
from app.models.email_token import EmailToken, EmailTokenPurpose
from app.models.user import Role, User

# Import other models so the schema is complete.
import app.models  # noqa: F401  (import for side-effects)


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    with Session() as s:
        yield s
    engine.dispose()


class TestUserModel:
    def test_role_is_a_strict_enum(self):
        assert Role.ADMIN == "admin"
        assert Role.TEACHER == "teacher"
        assert Role.STUDENT == "student"

    def test_user_default_id_is_uuid_string(self, session):
        u = User(email="x@y.edu", password_hash="x", name="X", role=Role.STUDENT.value)
        session.add(u)
        session.flush()
        assert isinstance(u.id, str)
        uuid.UUID(u.id)  # raises if not a valid uuid

    def test_user_email_verified_default_is_false(self, session):
        """A brand-new user must not be considered verified until they click
        the link or sign in via Google."""
        u = User(email="x@y.edu", password_hash="x", name="X", role=Role.STUDENT.value)
        session.add(u)
        session.flush()
        assert u.email_verified is False

    def test_user_role_default_is_student(self, session):
        u = User(email="x@y.edu", password_hash="x", name="X")
        session.add(u)
        session.flush()
        assert u.role == Role.STUDENT.value

    def test_user_email_is_unique(self, session):
        from sqlalchemy.exc import IntegrityError

        session.add(User(email="dup@y.edu", password_hash="x", name="A", role=Role.STUDENT.value))
        session.flush()
        session.add(User(email="dup@y.edu", password_hash="x", name="B", role=Role.STUDENT.value))
        with pytest.raises(IntegrityError):
            session.flush()


class TestEmailTokenModel:
    def test_purpose_enum_values(self):
        assert EmailTokenPurpose.VERIFY_EMAIL == "verify_email"
        assert EmailTokenPurpose.PASSWORD_RESET == "password_reset"

    def test_token_default_id_is_uuid(self, session):
        from datetime import datetime, timedelta, timezone

        t = EmailToken(
            user_id="some-uuid",
            purpose=EmailTokenPurpose.VERIFY_EMAIL.value,
            token_hash="abc",
            expires_at=datetime.now(tz=timezone.utc) + timedelta(hours=1),
        )
        session.add(t)
        session.flush()
        uuid.UUID(t.id)