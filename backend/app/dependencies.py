from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models.user import Role, User
from .utils.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    try:
        payload = decode_token(token, expected_type="access")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
Database = Annotated[AsyncSession, Depends(get_db)]


def require_role(*allowed: Role):
    async def guard(user: CurrentUser) -> User:
        if user.role not in {r.value for r in allowed}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role in: {', '.join(r.value for r in allowed)}",
            )
        return user

    return guard


async def require_teacher(user: CurrentUser) -> User:
    if user.role not in {Role.TEACHER.value, Role.ADMIN.value}:
        raise HTTPException(status_code=403, detail="Teacher role required")
    return user


async def assert_enrolled(db: AsyncSession, user: User, course_id: str) -> bool:
    """Return True if the user is the teacher of the course or enrolled in it."""
    from .models.course import Course
    from .models.enrollment import Enrollment

    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id == user.id or user.role == Role.ADMIN.value:
        return True
    enrollment = await db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.course_id == course_id
        )
    )
    if not enrollment:
        raise HTTPException(status_code=403, detail="Not enrolled in this course")
    return True
