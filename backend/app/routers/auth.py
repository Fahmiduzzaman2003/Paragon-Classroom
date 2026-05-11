from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from jose import JWTError
from sqlalchemy import select

from ..dependencies import CurrentUser, Database
from ..models.user import Role, User
from ..schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserOut,
    UserUpdate,
)
from ..utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter()


def _issue_tokens(user: User) -> TokenPair:
    access, ttl = create_access_token(user.id, extra={"role": user.role})
    refresh = create_refresh_token(user.id)
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=ttl)


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: Database) -> TokenPair:
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
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _issue_tokens(user)


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: Database) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
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
