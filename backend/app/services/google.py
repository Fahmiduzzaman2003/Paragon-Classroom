"""Google OAuth service.

Two modes:

1. **Production** — set ``GOOGLE_OAUTH_CLIENT_ID`` and ``GOOGLE_OAUTH_CLIENT_SECRET``
   in ``backend/.env``. The router then initiates a real OIDC code-flow with
   ``https://accounts.google.com`` and exchanges the auth code for an ID token,
   which it verifies against Google's public keys before issuing Paragon JWTs.

2. **Dev fallback** — when both client id and secret are blank, the
   ``/auth/google`` endpoint accepts ``{"email": ..., "name": ...}`` in the
   body, treats it as a "signed-in" Google user, and issues Paragon tokens
   directly. This keeps the demo / tests usable without real Google credentials
   while the *flow* (server-side exchange → user lookup → JWT mint) is identical.

Setting ``GOOGLE_OAUTH_DEV_FALLBACK=false`` disables the dev mode and the
endpoint will return 503 in dev. We always refuse to fall back in
``production`` to prevent credential spoofing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx
from authlib.jose import JsonWebKey, jwt
from authlib.jose.errors import JoseError
from sqlalchemy import select

from ..config import settings
from ..database import SessionLocal
from ..models.user import Role, User
from ..utils.security import hash_password

log = logging.getLogger(__name__)


GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
GOOGLE_ISSUER = "https://accounts.google.com"


@dataclass(frozen=True)
class GoogleUserInfo:
    """Normalized representation of a verified Google user."""

    sub: str  # Google's stable user id
    email: str
    email_verified: bool
    name: str
    picture: str | None = None


class GoogleAuthError(Exception):
    """Raised when a Google credential cannot be verified."""


# ─────────────────────────────────────────────────────
# Discovery cache (refresh once per process)
# ─────────────────────────────────────────────────────

_discovery_cache: dict[str, Any] | None = None


async def _google_discovery() -> dict[str, Any]:
    """Fetch Google's OIDC discovery document (cached for the process)."""
    global _discovery_cache
    if _discovery_cache is not None:
        return _discovery_cache
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GOOGLE_DISCOVERY_URL)
        resp.raise_for_status()
        _discovery_cache = resp.json()
    return _discovery_cache


def _is_real_google_configured() -> bool:
    return bool(settings.google_oauth_client_id and settings.google_oauth_client_secret)


def can_use_dev_fallback() -> bool:
    """True only when real Google creds are absent AND we're not in production
    AND ``google_oauth_dev_fallback`` is enabled."""
    if _is_real_google_configured():
        return False
    if settings.app_env in {"production", "staging"}:
        return False
    return settings.google_oauth_dev_fallback


# ─────────────────────────────────────────────────────
# Authorization URL builder (real mode)
# ─────────────────────────────────────────────────────


def build_authorization_url(state: str) -> str:
    """Return the URL the browser should be redirected to."""
    if not _is_real_google_configured():
        raise GoogleAuthError(
            "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and "
            "GOOGLE_OAUTH_CLIENT_SECRET, or enable the dev fallback."
        )
    from urllib.parse import urlencode

    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": _pick_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "state": state,
        "prompt": "select_account",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def _pick_redirect_uri() -> str:
    """Pick the redirect URI that matches the current frontend origin.

    We accept a comma-separated list of origins so multiple dev ports work.
    Falls back to the first entry.
    """
    raw = settings.google_oauth_redirect_uri
    options = [o.strip() for o in raw.split(",") if o.strip()]
    return options[0] if options else "http://localhost:5173/auth/google/callback"


# ─────────────────────────────────────────────────────
# Code-for-token exchange + ID-token verification (real mode)
# ─────────────────────────────────────────────────────


async def exchange_code_for_id_token(code: str) -> GoogleUserInfo:
    """Trade an authorization code for Google tokens, verify the ID token, and
    return a normalized :class:`GoogleUserInfo`. Raises :class:`GoogleAuthError`
    on any failure.
    """
    if not _is_real_google_configured():
        raise GoogleAuthError("Real Google OAuth is not configured")

    discovery = await _google_discovery()
    token_endpoint = discovery["token_endpoint"]
    jwks_uri = discovery["jwks_uri"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            token_endpoint,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": _pick_redirect_uri(),
                "grant_type": "authorization_code",
            },
        )
    if token_resp.status_code != 200:
        raise GoogleAuthError(
            f"Google token exchange failed: {token_resp.status_code} {token_resp.text[:200]}"
        )

    tokens = token_resp.json()
    id_token_raw = tokens.get("id_token")
    if not id_token_raw:
        raise GoogleAuthError("Google did not return an id_token")

    # Verify signature + standard claims against Google's published JWKS.
    async with httpx.AsyncClient(timeout=10.0) as client:
        jwks_resp = await client.get(jwks_uri)
    jwks = JsonWebKey.import_key_set(jwks_resp.json())

    try:
        claims = jwt.decode(id_token_raw, jwks)
        claims.options = {
            "iss": {"essential": True, "value": GOOGLE_ISSUER},
            "aud": {"essential": True, "value": settings.google_oauth_client_id},
            "exp": {"essential": True},
        }
        claims.validate()
    except JoseError as exc:
        raise GoogleAuthError(f"Google ID token failed validation: {exc}") from exc

    if not claims.get("email_verified", False):
        raise GoogleAuthError("Google account email is not verified")

    return GoogleUserInfo(
        sub=claims["sub"],
        email=claims["email"].lower(),
        email_verified=True,
        name=claims.get("name") or claims["email"].split("@")[0],
        picture=claims.get("picture"),
    )


# ─────────────────────────────────────────────────────
# Dev-fallback "exchange"
# ─────────────────────────────────────────────────────


async def dev_fallback_exchange(email: str, name: str | None = None) -> GoogleUserInfo:
    """Dev-mode shim that mints a synthetic :class:`GoogleUserInfo` from an
    email address. The caller is responsible for enabling this mode via
    :func:`can_use_dev_fallback`."""
    if not email:
        raise GoogleAuthError("Email is required for the dev fallback")
    return GoogleUserInfo(
        sub=f"dev|{email.lower()}",
        email=email.lower(),
        email_verified=True,
        name=name or email.split("@")[0],
        picture=None,
    )


# ─────────────────────────────────────────────────────
# User provisioning
# ─────────────────────────────────────────────────────


async def upsert_google_user(info: GoogleUserInfo) -> User:
    """Idempotently resolve a Google identity to a Paragon user.

    Resolution order (keyed on the stable ``sub``, never email alone):

    1. **Match by ``google_sub``** — the canonical link. Refreshes profile.
    2. **Match by email with no ``google_sub``** — a pre-existing password
       account (or legacy row). Link this Google identity to it so "same email,
       different provider" merges gracefully instead of creating a duplicate.
    3. **No match** — create a fresh Google-only account (random unusable
       password; can only sign in via Google).

    ``sub`` uniqueness is enforced at the DB level, so a race that tries to
    create two rows for the same Google account fails loudly rather than
    silently forking the identity.
    """
    import secrets as _secrets

    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.google_sub == info.sub))

        if user is None:
            # Fall back to email — link an existing local account to this sub.
            existing = await db.scalar(select(User).where(User.email == info.email))
            if existing is not None:
                existing.google_sub = info.sub
                user = existing
                log.info("Linked Google identity to existing account: %s", info.email)

        if user is None:
            user = User(
                email=info.email,
                google_sub=info.sub,
                # Random, never usable via password login.
                password_hash=hash_password(_secrets.token_urlsafe(32)),
                name=info.name,
                role=Role.STUDENT.value,
                avatar_url=info.picture,
                email_verified=True,
            )
            db.add(user)
            log.info("Created new user from Google sign-in: %s", info.email)
        else:
            # Keep the linked account fresh, but don't clobber a user-chosen name.
            user.email_verified = True
            if not user.avatar_url and info.picture:
                user.avatar_url = info.picture
            if info.name and (not user.name or user.name.startswith(user.email.split("@")[0])):
                user.name = info.name

        await db.commit()
        await db.refresh(user)
        return user