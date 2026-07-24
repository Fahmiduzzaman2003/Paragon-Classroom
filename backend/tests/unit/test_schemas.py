"""Unit tests for request/response schemas — validation rules live here."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.auth import (
    ForgotPasswordRequest,
    GoogleDevSignInRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)


class TestRegisterRequest:
    def test_valid_payload(self):
        r = RegisterRequest(email="x@y.edu", password="longenough1", name="Alice", role="student")
        assert r.role == "student"
        assert r.email == "x@y.edu"

    def test_short_password_rejected(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="x@y.edu", password="short", name="Alice")

    def test_bad_email_rejected(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="not-an-email", password="longenough1", name="Alice")

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="x@y.edu", password="longenough1", name="")

    def test_default_role_is_student(self):
        r = RegisterRequest(email="x@y.edu", password="longenough1", name="Alice")
        assert r.role == "student"

    def test_admin_role_rejected_by_schema(self):
        with pytest.raises(ValidationError):
            RegisterRequest(
                email="x@y.edu",
                password="longenough1",
                name="Alice",
                role="admin",  # type: ignore[arg-type]
            )


class TestLoginRequest:
    def test_basic(self):
        r = LoginRequest(email="a@b.edu", password="hunter2")
        assert r.email == "a@b.edu"

    def test_bad_email_rejected(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="bad", password="hunter2")


class TestTokenRequests:
    def test_verify_email_token_min_length(self):
        with pytest.raises(ValidationError):
            VerifyEmailRequest(token="short")

    def test_reset_password_validates_new_password(self):
        with pytest.raises(ValidationError):
            ResetPasswordRequest(token="long-enough-token", new_password="short")


class TestForgotRequest:
    def test_basic(self):
        r = ForgotPasswordRequest(email="a@b.edu")
        assert r.email == "a@b.edu"


class TestGoogleDevSignInRequest:
    def test_minimum_payload(self):
        r = GoogleDevSignInRequest(email="a@b.edu")
        assert r.role == "student"

    def test_email_required(self):
        with pytest.raises(ValidationError):
            GoogleDevSignInRequest(email="not-an-email")
