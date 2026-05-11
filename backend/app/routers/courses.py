from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..dependencies import CurrentUser, Database, assert_enrolled, require_teacher
from ..models.course import Course
from ..models.enrollment import Enrollment
from ..models.material import Material
from ..models.user import Role, User
from ..schemas.course import CourseCreate, CourseJoin, CourseOut, CourseUpdate
from ..utils.security import generate_course_code

router = APIRouter()


async def _serialize(db, course: Course, viewer_id: str) -> CourseOut:
    student_count = await db.scalar(
        select(func.count(Enrollment.user_id)).where(Enrollment.course_id == course.id)
    ) or 0
    material_count = await db.scalar(
        select(func.count(Material.id)).where(Material.course_id == course.id)
    ) or 0
    enrolled = False
    if course.teacher_id == viewer_id:
        enrolled = True
    else:
        hit = await db.scalar(
            select(Enrollment.user_id).where(
                Enrollment.course_id == course.id, Enrollment.user_id == viewer_id
            )
        )
        enrolled = hit is not None
    teacher = course.teacher
    return CourseOut(
        id=course.id,
        name=course.name,
        code=course.code,
        description=course.description,
        semester=course.semester,
        gradient=course.gradient,
        accent_hue=course.accent_hue,
        ai_name=course.ai_name,
        ai_personality=course.ai_personality,
        rag_mode=course.rag_mode,  # type: ignore[arg-type]
        teacher_id=course.teacher_id,
        teacher_name=teacher.name if teacher else "",
        student_count=int(student_count),
        material_count=int(material_count),
        enrolled=enrolled,
        created_at=course.created_at,
    )


@router.get("", response_model=list[CourseOut])
async def list_courses(current: CurrentUser, db: Database) -> list[CourseOut]:
    """List courses the current user teaches or is enrolled in."""
    if current.role == Role.ADMIN.value:
        result = await db.execute(select(Course).options(selectinload(Course.teacher)))
        courses = list(result.scalars().all())
    else:
        taught = await db.execute(
            select(Course)
            .where(Course.teacher_id == current.id)
            .options(selectinload(Course.teacher))
        )
        enrolled = await db.execute(
            select(Course)
            .join(Enrollment, Enrollment.course_id == Course.id)
            .where(Enrollment.user_id == current.id)
            .options(selectinload(Course.teacher))
        )
        seen: dict[str, Course] = {}
        for c in list(taught.scalars().all()) + list(enrolled.scalars().all()):
            seen[c.id] = c
        courses = list(seen.values())

    courses.sort(key=lambda c: c.created_at, reverse=True)
    return [await _serialize(db, c, current.id) for c in courses]


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: CourseCreate,
    db: Database,
    teacher: Annotated[User, Depends(require_teacher)],
) -> CourseOut:
    # Generate a unique course code
    for _ in range(10):
        code = generate_course_code()
        exists = await db.scalar(select(Course.id).where(Course.code == code))
        if not exists:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique course code")

    course = Course(
        teacher_id=teacher.id,
        code=code,
        **payload.model_dump(),
    )
    db.add(course)
    await db.commit()
    await db.refresh(course, attribute_names=["teacher"])
    return await _serialize(db, course, teacher.id)


@router.get("/{course_id}", response_model=CourseOut)
async def get_course(course_id: str, current: CurrentUser, db: Database) -> CourseOut:
    course = await db.scalar(
        select(Course).where(Course.id == course_id).options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await assert_enrolled(db, current, course_id)
    return await _serialize(db, course, current.id)


@router.patch("/{course_id}", response_model=CourseOut)
async def update_course(
    course_id: str,
    payload: CourseUpdate,
    current: CurrentUser,
    db: Database,
) -> CourseOut:
    course = await db.scalar(
        select(Course).where(Course.id == course_id).options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current.id and current.role != Role.ADMIN.value:
        raise HTTPException(status_code=403, detail="Only the course teacher can edit this course")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    await db.commit()
    await db.refresh(course, attribute_names=["teacher"])
    return await _serialize(db, course, current.id)


@router.post("/join", response_model=CourseOut)
async def join_course(payload: CourseJoin, current: CurrentUser, db: Database) -> CourseOut:
    course = await db.scalar(
        select(Course).where(Course.code == payload.code.upper()).options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="No course matches that code")
    if course.teacher_id == current.id:
        raise HTTPException(status_code=400, detail="You're the teacher of this course")
    existing = await db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == course.id, Enrollment.user_id == current.id
        )
    )
    if not existing:
        db.add(Enrollment(user_id=current.id, course_id=course.id))
        await db.commit()
    return await _serialize(db, course, current.id)
