from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


Role = Literal["admin", "teacher", "student"]
# Public registration is restricted to teacher/student; admin is provisioned
# directly in the DB by an operator.
RegisterableRole = Literal["teacher", "student"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=1, max_length=120)
    role: RegisterableRole = "student"
    institution: str | None = Field(default=None, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: Role
    avatar_url: str | None = None
    bio: str | None = None
    institution: str | None = None
    created_at: datetime


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=1000)
    institution: str | None = Field(default=None, max_length=200)
    avatar_url: str | None = Field(default=None, max_length=512)


# ─────────────────────────────────────────────────────
# Email verification + password reset (security hardening)
# ─────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=8, max_length=200)


# ─────────────────────────────────────────────────────
# Google OAuth
# ─────────────────────────────────────────────────────

class GoogleDevSignInRequest(BaseModel):
    """Dev-mode sign-in body for the Google fallback. Never used when real
    Google credentials are configured."""
    email: EmailStr
    name: str | None = Field(default=None, max_length=120)
    role: Role = "student"


class FirebaseSyncRequest(BaseModel):
    """Sent by the frontend right after a Firebase sign-up so the backend creates
    the profile with the chosen role. Role is applied only on account creation."""
    role: RegisterableRole = "student"
    name: str | None = Field(default=None, max_length=120)
    institution: str | None = Field(default=None, max_length=200)
