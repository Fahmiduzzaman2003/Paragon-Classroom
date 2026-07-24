from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select

from ..config import settings
from ..dependencies import CurrentUser, Database
from ..models.email_token import EmailToken, EmailTokenPurpose
from ..models.user import Role, User
from ..schemas import (
    ForgotPasswordRequest,
    GoogleDevSignInRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResendVerificationRequest,
    TokenPair,
    UserOut,
    UserUpdate,
    VerifyEmailRequest,
)
from ..services import google as google_svc
from ..services.email import EmailMessageData, generate_token, hash_token, send_email
from ..services.limiter import limiter
from ..utils.security import (
    create_access_token,
    create_refresh_token,
    create_state_token,
    decode_state_token,
    decode_token,
    hash_password,
    verify_password,
)

log = logging.getLogger(__name__)

router = APIRouter()


def _issue_tokens(user: User) -> TokenPair:
    access, ttl = create_access_token(user.id, extra={"role": user.role})
    refresh = create_refresh_token(user.id)
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=ttl)


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.register_rate_limit)
async def register(request: Request, payload: RegisterRequest, db: Database) -> TokenPair:
    existing = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    if payload.role not in {Role.TEACHER.value, Role.STUDENT.value}:
        raise HTTPException(status_code=400, detail="Cannot self-register as admin")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name.strip(),
        role=payload.role,
        institution=payload.institution,
        # If verification isn't enforced (flag off, or no SMTP to send with),
        # mark verified immediately so the account is usable without the click.
        email_verified=not settings.email_verification_enforced,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Best-effort: send the verification email when enforced.
    if settings.email_verification_enforced:
        await _send_verification_email(db, user)

    return _issue_tokens(user)


@router.post("/login", response_model=TokenPair)
@limiter.limit(settings.login_rate_limit)
async def login(request: Request, payload: LoginRequest, db: Database) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        # Identical message for "no such email" and "wrong password" to
        # avoid leaking which emails are registered.
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if settings.email_verification_enforced and not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified — check your inbox or call /auth/resend-verification",
        )
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: Database) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None
    user = await db.get(User, claims["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if settings.email_verification_enforced and not user.email_verified:
        raise HTTPException(status_code=403, detail="Email not verified")
    return _issue_tokens(user)


@router.get("/me", response_model=UserOut)
async def me(current: CurrentUser) -> User:
    return current


@router.patch("/me", response_model=UserOut)
async def update_me(payload: UserUpdate, current: CurrentUser, db: Database) -> User:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current, field, value)
    await db.commit()
    await db.refresh(current)
    return current


# ─────────────────────────────────────────────────────
# Email verification + password reset (free Mailtrap-compatible flow)
# ─────────────────────────────────────────────────────

def _frontend_base() -> str:
    # First allowed origin is the canonical frontend base — in production this is
    # your Vercel URL (from CORS_ORIGINS), so emailed links point at the real app,
    # not localhost.
    origins = settings.cors_origins_list
    return origins[0] if origins else "http://localhost:5173"


def _as_utc(dt: datetime) -> datetime:
    """Normalize a stored DateTime to a timezone-aware UTC datetime.

    SQLite drops the tzinfo on round-trip; Postgres preserves it. This helper
    lets the comparison work uniformly across backends.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _send_verification_email(db, user: User) -> tuple[str, datetime]:
    raw, digest = generate_token()
    expires = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.email_token_ttl_min)
    token = EmailToken(
        user_id=user.id,
        purpose=EmailTokenPurpose.VERIFY_EMAIL.value,
        token_hash=digest,
        expires_at=expires,
    )
    db.add(token)
    await db.commit()

    link = f"{_frontend_base()}/verify-email?token={raw}"
    body = (
        f"Hi {user.name},\n\n"
        f"Welcome to Paragon. Click the link below to verify your email:\n\n"
        f"  {link}\n\n"
        f"This link expires in {settings.email_token_ttl_min // 60} hours. "
        "If you didn't create this account, you can ignore this message.\n\n"
        "— Paragon"
    )
    await send_email(
        EmailMessageData(
            to_email=user.email,
            subject="Verify your Paragon email",
            text=body,
        )
    )
    return raw, expires


async def _send_password_reset_email(db, user: User) -> tuple[str, datetime]:
    raw, digest = generate_token()
    expires = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.email_token_ttl_min)
    token = EmailToken(
        user_id=user.id,
        purpose=EmailTokenPurpose.PASSWORD_RESET.value,
        token_hash=digest,
        expires_at=expires,
    )
    db.add(token)
    await db.commit()

    link = f"{_frontend_base()}/reset-password?token={raw}"
    body = (
        f"Hi {user.name},\n\n"
        f"We received a request to reset the password for your Paragon account.\n"
        f"Click the link below to set a new password:\n\n"
        f"  {link}\n\n"
        f"This link expires in {settings.email_token_ttl_min // 60} hours. "
        "If you didn't make this request, you can ignore this message — your "
        "password will stay the same.\n\n"
        "— Paragon"
    )
    await send_email(
        EmailMessageData(
            to_email=user.email,
            subject="Reset your Paragon password",
            text=body,
        )
    )
    return raw, expires


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(payload: VerifyEmailRequest, db: Database) -> MessageResponse:
    """Consume a verification token. Idempotent: expired/used tokens yield 400."""
    digest = hash_token(payload.token)
    token = await db.scalar(
        select(EmailToken)
        .where(
            EmailToken.token_hash == digest,
            EmailToken.purpose == EmailTokenPurpose.VERIFY_EMAIL.value,
            EmailToken.used_at.is_(None),
        )
    )
    if not token:
        raise HTTPException(status_code=400, detail="Invalid or already used verification link")
    now = datetime.now(tz=timezone.utc)
    if _as_utc(token.expires_at) <= now:
        raise HTTPException(status_code=400, detail="Verification link has expired")
    user = await db.get(User, token.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Account no longer exists")
    user.email_verified = True
    token.used_at = datetime.now(tz=timezone.utc)
    await db.commit()
    return MessageResponse(message="Email verified — you can now sign in")


@router.post("/resend-verification", response_model=MessageResponse)
@limiter.limit(settings.forgot_rate_limit)
async def resend_verification(request: Request, payload: ResendVerificationRequest, db: Database) -> MessageResponse:
    # Always return 200 to avoid email enumeration.
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if user and not user.email_verified:
        await _send_verification_email(db, user)
    return MessageResponse(message="If that address is registered and unverified, a new link is on its way")


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(settings.forgot_rate_limit)
async def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Database) -> MessageResponse:
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if user:
        await _send_password_reset_email(db, user)
    return MessageResponse(message="If that address is registered, a reset link is on its way")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: Database) -> MessageResponse:
    digest = hash_token(payload.token)
    token = await db.scalar(
        select(EmailToken)
        .where(
            EmailToken.token_hash == digest,
            EmailToken.purpose == EmailTokenPurpose.PASSWORD_RESET.value,
            EmailToken.used_at.is_(None),
        )
    )
    if not token:
        raise HTTPException(status_code=400, detail="Invalid or already used reset link")
    if _as_utc(token.expires_at) <= datetime.now(tz=timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link has expired")
    user = await db.get(User, token.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Account no longer exists")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user.password_hash = hash_password(payload.new_password)
    token.used_at = datetime.now(tz=timezone.utc)
    await db.commit()
    return MessageResponse(message="Password updated — sign in with your new password")


# ─────────────────────────────────────────────────────
# Google OAuth (real authentication)
# ─────────────────────────────────────────────────────
# State is a short-lived signed JWT (see utils.security.create_state_token), so
# an in-flight login survives a Render cold start / redeploy — no server-side
# session store to lose. The signature is the CSRF guard.


@router.get("/google/login")
@limiter.limit("30/minute")
async def google_login(request: Request, role: str = "student"):
    """Step 1 of the OIDC code-flow.

    Returns the URL the browser should be redirected to (or, in dev-fallback
    mode, a structured response the frontend can use to call ``/auth/google/dev``).
    """
    if role not in {Role.TEACHER.value, Role.STUDENT.value}:
        raise HTTPException(status_code=400, detail="Invalid role")

    if google_svc._is_real_google_configured():
        state = create_state_token({"role": role})
        try:
            url = google_svc.build_authorization_url(state)
        except google_svc.GoogleAuthError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"mode": "redirect", "authorization_url": url}

    if not google_svc.can_use_dev_fallback():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured for this environment.",
        )

    return {
        "mode": "dev",
        "message": "Google OAuth is in dev-fallback mode. POST {email, name} to /auth/google/dev to sign in.",
    }


@router.post("/google/dev", response_model=TokenPair)
@limiter.limit("30/minute")
async def google_dev_signin(request: Request, payload: GoogleDevSignInRequest) -> TokenPair:
    """Dev-only endpoint that mints Paragon tokens for a "signed in" Google user.

    Disabled when ``google_oauth_dev_fallback`` is false or when real Google
    credentials are configured (use the real round-trip in that case).
    """
    if google_svc._is_real_google_configured():
        raise HTTPException(
            status_code=400,
            detail="Real Google credentials are configured — use /auth/google/login instead.",
        )
    if not google_svc.can_use_dev_fallback():
        raise HTTPException(status_code=503, detail="Dev fallback disabled")

    try:
        info = await google_svc.dev_fallback_exchange(payload.email, payload.name)
    except google_svc.GoogleAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = await google_svc.upsert_google_user(info)
    log.info("Google dev sign-in: %s", user.email)
    return _issue_tokens(user)


@router.post("/google/callback", response_model=TokenPair)
@limiter.limit("30/minute")
async def google_callback(request: Request, payload: dict) -> TokenPair:
    """Step 2 of the OIDC code-flow.

    Front-end posts ``{"code": "...", "state": "..."}`` after Google redirects
    back. We verify the state, exchange the code for tokens, verify the ID
    token against Google's JWKS, then issue Paragon tokens.
    """
    if not google_svc._is_real_google_configured():
        raise HTTPException(
            status_code=503,
            detail="Real Google OAuth is not configured for this environment.",
        )

    code = payload.get("code")
    state = payload.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    # Verify the signed state (CSRF guard). A bad signature or expiry → reject.
    try:
        decode_state_token(state)
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired state") from None

    try:
        info = await google_svc.exchange_code_for_id_token(code)
    except google_svc.GoogleAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user = await google_svc.upsert_google_user(info)
    log.info("Google sign-in: %s", user.email)
    return _issue_tokens(user)
