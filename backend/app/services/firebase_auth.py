"""Firebase Authentication — server-side ID token verification.

We verify Firebase ID tokens with the ``google-auth`` library (already a
dependency via google-generativeai), which checks the signature against Google's
public certs and validates ``aud``/``iss``/``exp`` for the configured project.
This needs ONLY the project id — no service-account key to store or leak.

Users are keyed on the Firebase ``uid`` (stable), with a graceful link-by-email
for accounts that pre-date Firebase. Everything else (roles, enrollment) is
unchanged and owned by our own DB.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.user import Role, User
from ..utils.security import hash_password

log = logging.getLogger(__name__)

# Reused across calls; google-auth caches Google's public certs on it.
_GOOGLE_REQUEST = google_requests.Request()


@dataclass(frozen=True)
class FirebaseIdentity:
    uid: str
    email: str
    email_verified: bool
    name: str
    picture: str | None = None


class FirebaseAuthError(Exception):
    """Raised when a Firebase ID token cannot be verified."""


def verify_id_token(token: str) -> FirebaseIdentity:
    """Verify a Firebase ID token and return a normalized identity.

    Raises :class:`FirebaseAuthError` on any failure (bad signature, wrong
    audience, expired, malformed)."""
    if not settings.firebase_enabled:
        raise FirebaseAuthError("Firebase is not configured")
    try:
        claims = google_id_token.verify_firebase_token(
            token, _GOOGLE_REQUEST, audience=settings.firebase_project_id
        )
    except Exception as exc:  # noqa: BLE001 — normalize all verification failures
        raise FirebaseAuthError(f"Invalid Firebase token: {exc}") from exc

    if not claims:
        raise FirebaseAuthError("Empty Firebase token claims")
    uid = claims.get("user_id") or claims.get("sub")
    if not uid:
        raise FirebaseAuthError("Firebase token missing uid")
    email = (claims.get("email") or "").lower()
    return FirebaseIdentity(
        uid=uid,
        email=email,
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name") or (email.split("@")[0] if email else "User"),
        picture=claims.get("picture"),
    )


async def upsert_firebase_user(
    db: AsyncSession, identity: FirebaseIdentity, *, default_role: str = Role.STUDENT.value
) -> User:
    """Resolve a Firebase identity to a Paragon user, creating it if needed.

    Uses the caller's ``db`` session so the returned ``User`` is bound to the
    request. ``default_role`` is applied ONLY when a new row is created, so
    ``/auth/sync`` with the signup role lands a teacher as a teacher, while later
    auto-provisioning (get_current_user) never changes an existing role.
    """
    role = default_role if default_role in {Role.TEACHER.value, Role.STUDENT.value} else Role.STUDENT.value

    user = await db.scalar(select(User).where(User.firebase_uid == identity.uid))

    if user is None and identity.email:
        existing = await db.scalar(select(User).where(User.email == identity.email))
        if existing is not None:
            existing.firebase_uid = identity.uid
            user = existing
            log.info("Linked Firebase uid to existing account: %s", identity.email)

    if user is None:
        user = User(
            email=identity.email or f"{identity.uid}@firebase.local",
            firebase_uid=identity.uid,
            # Random unusable password — sign-in is via Firebase only.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            name=identity.name,
            role=role,
            avatar_url=identity.picture,
            email_verified=identity.email_verified,
        )
        db.add(user)
        log.info("Created user from Firebase sign-in: %s (role=%s)", identity.email, role)
    else:
        # Keep verification status + avatar fresh; never downgrade role/name.
        if identity.email_verified and not user.email_verified:
            user.email_verified = True
        if identity.picture and not user.avatar_url:
            user.avatar_url = identity.picture

    await db.commit()
    await db.refresh(user)
    return user
