from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
from jose import JWTError, jwt

from ..config import settings


# ─────────────────────────────────────────────────────
# Password hashing
# ─────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ─────────────────────────────────────────────────────
# JWT
# ─────────────────────────────────────────────────────

TokenType = Literal["access", "refresh"]


def _create_token(sub: str, token_type: TokenType, extra: dict[str, Any] | None = None) -> tuple[str, int]:
    now = datetime.now(tz=timezone.utc)
    if token_type == "access":
        expires = now + timedelta(minutes=settings.jwt_access_ttl_min)
    else:
        expires = now + timedelta(days=settings.jwt_refresh_ttl_days)
    payload: dict[str, Any] = {
        "sub": sub,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "typ": token_type,
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, int((expires - now).total_seconds())


def create_access_token(sub: str, extra: dict[str, Any] | None = None) -> tuple[str, int]:
    return _create_token(sub, "access", extra)


def create_refresh_token(sub: str) -> str:
    tok, _ = _create_token(sub, "refresh")
    return tok


def decode_token(token: str, expected_type: TokenType = "access") -> dict[str, Any]:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("typ") != expected_type:
        raise JWTError("token type mismatch")
    return payload


# ─────────────────────────────────────────────────────
# Course join code
# ─────────────────────────────────────────────────────

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I for readability


def generate_course_code(length: int = 6) -> str:
    return "PRG-" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))
