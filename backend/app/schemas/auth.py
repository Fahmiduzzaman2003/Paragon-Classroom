from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


Role = Literal["admin", "teacher", "student"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=1, max_length=120)
    role: Role = "student"
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
