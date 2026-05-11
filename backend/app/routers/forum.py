from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..dependencies import CurrentUser, Database, assert_enrolled
from ..models.course import Course
from ..models.forum import ForumReply, ForumThread
from ..models.user import Role, User
from ..schemas.forum import (
    ReplyCreate,
    ReplyOut,
    ThreadCreate,
    ThreadDetailOut,
    ThreadOut,
    ThreadUpdate,
)
from ..services.notifications import notify

log = logging.getLogger(__name__)
router = APIRouter()


async def _is_teacher(db, course_id: str, user: User) -> bool:
    if user.role == Role.ADMIN.value:
        return True
    course = await db.get(Course, course_id)
    return bool(course) and course.teacher_id == user.id


async def _serialize_thread(db, t: ForumThread, *, with_replies: bool = False) -> ThreadOut | ThreadDetailOut:
    reply_count = await db.scalar(
        select(func.count(ForumReply.id)).where(ForumReply.thread_id == t.id)
    ) or 0
    base_kwargs = dict(
        id=t.id,
        course_id=t.course_id,
        author_id=t.author_id,
        author_name=t.author.name if t.author else "",
        title=t.title,
        body=t.body,
        pinned=t.pinned,
        answered=t.answered,
        upvotes=t.upvotes,
        tags=t.tags or [],
        reply_count=int(reply_count),
        created_at=t.created_at,
        updated_at=t.updated_at,
    )
    if with_replies:
        # ensure replies are loaded with authors
        replies = (
            await db.execute(
                select(ForumReply)
                .where(ForumReply.thread_id == t.id)
                .order_by(ForumReply.created_at.asc())
                .options(selectinload(ForumReply.author))
            )
        ).scalars().all()
        return ThreadDetailOut(
            **base_kwargs,
            replies=[
                ReplyOut(
                    id=r.id,
                    thread_id=r.thread_id,
                    author_id=r.author_id,
                    author_name=r.author.name if r.author else "",
                    body=r.body,
                    upvotes=r.upvotes,
                    accepted=r.accepted,
                    created_at=r.created_at,
                )
                for r in replies
            ],
        )
    return ThreadOut(**base_kwargs)


# ─────────────────────────────────────────────────────
# Threads
# ─────────────────────────────────────────────────────

@router.get("/courses/{course_id}/forum", response_model=list[ThreadOut])
async def list_threads(course_id: str, current: CurrentUser, db: Database) -> list[ThreadOut]:
    await assert_enrolled(db, current, course_id)
    rows = (
        await db.execute(
            select(ForumThread)
            .where(ForumThread.course_id == course_id)
            .order_by(ForumThread.pinned.desc(), ForumThread.updated_at.desc())
            .options(selectinload(ForumThread.author))
        )
    ).scalars().all()
    return [await _serialize_thread(db, t) for t in rows]  # type: ignore[misc]


@router.post(
    "/courses/{course_id}/forum",
    response_model=ThreadDetailOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_thread(
    course_id: str,
    payload: ThreadCreate,
    current: CurrentUser,
    db: Database,
) -> ThreadDetailOut:
    await assert_enrolled(db, current, course_id)
    t = ForumThread(
        course_id=course_id,
        author_id=current.id,
        title=payload.title,
        body=payload.body,
        tags=payload.tags,
    )
    db.add(t)
    await db.flush()
    await db.refresh(t, attribute_names=["author"])
    await db.commit()
    return await _serialize_thread(db, t, with_replies=True)  # type: ignore[return-value]


@router.get("/threads/{thread_id}", response_model=ThreadDetailOut)
async def get_thread(thread_id: str, current: CurrentUser, db: Database) -> ThreadDetailOut:
    t = await db.scalar(
        select(ForumThread)
        .where(ForumThread.id == thread_id)
        .options(selectinload(ForumThread.author))
    )
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    await assert_enrolled(db, current, t.course_id)
    return await _serialize_thread(db, t, with_replies=True)  # type: ignore[return-value]


@router.patch("/threads/{thread_id}", response_model=ThreadDetailOut)
async def update_thread(
    thread_id: str,
    payload: ThreadUpdate,
    current: CurrentUser,
    db: Database,
) -> ThreadDetailOut:
    t = await db.scalar(
        select(ForumThread).where(ForumThread.id == thread_id).options(selectinload(ForumThread.author))
    )
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")

    is_author = t.author_id == current.id
    is_teacher = await _is_teacher(db, t.course_id, current)
    data = payload.model_dump(exclude_unset=True)

    # Author can edit body/title/tags; only teacher (or admin) can pin.
    if "pinned" in data and not is_teacher:
        raise HTTPException(status_code=403, detail="Only teachers can pin threads")
    if not is_author and not is_teacher:
        raise HTTPException(status_code=403, detail="Not permitted")

    for field, value in data.items():
        setattr(t, field, value)
    await db.commit()
    await db.refresh(t, attribute_names=["author"])
    return await _serialize_thread(db, t, with_replies=True)  # type: ignore[return-value]


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(thread_id: str, current: CurrentUser, db: Database) -> None:
    t = await db.get(ForumThread, thread_id)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    is_author = t.author_id == current.id
    is_teacher = await _is_teacher(db, t.course_id, current)
    if not (is_author or is_teacher):
        raise HTTPException(status_code=403, detail="Not permitted")
    await db.delete(t)
    await db.commit()


@router.post("/threads/{thread_id}/upvote", response_model=ThreadOut)
async def upvote_thread(thread_id: str, current: CurrentUser, db: Database) -> ThreadOut:
    t = await db.scalar(
        select(ForumThread).where(ForumThread.id == thread_id).options(selectinload(ForumThread.author))
    )
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    await assert_enrolled(db, current, t.course_id)
    t.upvotes = (t.upvotes or 0) + 1
    await db.commit()
    return await _serialize_thread(db, t)  # type: ignore[return-value]


# ─────────────────────────────────────────────────────
# Replies
# ─────────────────────────────────────────────────────

@router.post(
    "/threads/{thread_id}/replies",
    response_model=ReplyOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_reply(
    thread_id: str,
    payload: ReplyCreate,
    current: CurrentUser,
    db: Database,
) -> ReplyOut:
    t = await db.get(ForumThread, thread_id)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    await assert_enrolled(db, current, t.course_id)
    r = ForumReply(thread_id=thread_id, author_id=current.id, body=payload.body)
    db.add(r)
    # Bump thread updated_at by touching it
    t.body = t.body  # noqa: just to mark dirty; or set updated_at directly via func.now() onupdate
    await db.flush()
    await db.refresh(r, attribute_names=["author"])

    # Notify the original thread author (unless self-reply)
    course = await db.get(Course, t.course_id)
    if t.author_id != current.id:
        await notify(
            db,
            user_ids=[t.author_id],
            type="forum_reply",
            title=f"{current.name} replied to your thread",
            body=f'"{t.title[:80]}"',
            course_id=t.course_id,
            course_name=course.name if course else None,
            payload={"thread_id": t.id, "reply_id": r.id},
        )
    await db.commit()
    return ReplyOut(
        id=r.id,
        thread_id=r.thread_id,
        author_id=r.author_id,
        author_name=r.author.name if r.author else current.name,
        body=r.body,
        upvotes=r.upvotes,
        accepted=r.accepted,
        created_at=r.created_at,
    )


@router.post("/replies/{reply_id}/upvote", response_model=ReplyOut)
async def upvote_reply(reply_id: str, current: CurrentUser, db: Database) -> ReplyOut:
    r = await db.scalar(
        select(ForumReply).where(ForumReply.id == reply_id).options(selectinload(ForumReply.author))
    )
    if not r:
        raise HTTPException(status_code=404, detail="Reply not found")
    t = await db.get(ForumThread, r.thread_id)
    if t:
        await assert_enrolled(db, current, t.course_id)
    r.upvotes = (r.upvotes or 0) + 1
    await db.commit()
    return ReplyOut(
        id=r.id,
        thread_id=r.thread_id,
        author_id=r.author_id,
        author_name=r.author.name if r.author else "",
        body=r.body,
        upvotes=r.upvotes,
        accepted=r.accepted,
        created_at=r.created_at,
    )


@router.post("/replies/{reply_id}/accept", response_model=ReplyOut)
async def accept_reply(reply_id: str, current: CurrentUser, db: Database) -> ReplyOut:
    r = await db.scalar(
        select(ForumReply).where(ForumReply.id == reply_id).options(selectinload(ForumReply.author))
    )
    if not r:
        raise HTTPException(status_code=404, detail="Reply not found")
    t = await db.get(ForumThread, r.thread_id)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    is_author = t.author_id == current.id
    is_teacher = await _is_teacher(db, t.course_id, current)
    if not (is_author or is_teacher):
        raise HTTPException(status_code=403, detail="Only the thread author or teacher can mark answers")
    r.accepted = True
    t.answered = True
    await db.commit()
    return ReplyOut(
        id=r.id,
        thread_id=r.thread_id,
        author_id=r.author_id,
        author_name=r.author.name if r.author else "",
        body=r.body,
        upvotes=r.upvotes,
        accepted=r.accepted,
        created_at=r.created_at,
    )


@router.delete("/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reply(reply_id: str, current: CurrentUser, db: Database) -> None:
    r = await db.get(ForumReply, reply_id)
    if not r:
        raise HTTPException(status_code=404, detail="Reply not found")
    t = await db.get(ForumThread, r.thread_id)
    is_author = r.author_id == current.id
    is_teacher = bool(t) and await _is_teacher(db, t.course_id, current)
    if not (is_author or is_teacher):
        raise HTTPException(status_code=403, detail="Not permitted")
    await db.delete(r)
    await db.commit()
