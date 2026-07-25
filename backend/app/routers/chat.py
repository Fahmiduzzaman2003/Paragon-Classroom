from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..config import settings
from ..dependencies import CurrentUser, Database, assert_enrolled
from ..services.limiter import limiter
from ..models.conversation import Conversation, Message as MessageModel
from ..models.course import Course
from ..database import SessionLocal
from ..schemas.chat import (
    ChatRequest,
    ConversationOut,
    MessageOut,
    RagDebugChunk,
)
from ..services.llm import (
    LLMQuotaError,
    LLMUnavailableError,
    Message as LLMMessage,
    chain_display,
)
from ..services.llm import stream as llm_stream
from ..services.rag_service import build_rag_prompt, hybrid_retrieve, resolve_grounding
from ..services import vector_store

log = logging.getLogger(__name__)

router = APIRouter()


def _sse(event: str, data: dict) -> str:
    """Format a Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ─────────────────────────────────────────────────────
# Conversations
# ─────────────────────────────────────────────────────

@router.get("/courses/{course_id}/conversations", response_model=list[ConversationOut])
async def list_conversations(
    course_id: str, current: CurrentUser, db: Database
) -> list[ConversationOut]:
    await assert_enrolled(db, current, course_id)
    rows = (await db.execute(
        select(Conversation)
        .where(Conversation.course_id == course_id, Conversation.user_id == current.id)
        .order_by(Conversation.updated_at.desc())
    )).scalars().all()
    # Count messages per conversation
    out: list[ConversationOut] = []
    for c in rows:
        count = await db.scalar(
            select(func.count(MessageModel.id)).where(MessageModel.conversation_id == c.id)
        ) or 0
        out.append(
            ConversationOut(
                id=c.id,
                course_id=c.course_id,
                user_id=c.user_id,
                title=c.title,
                created_at=c.created_at,
                updated_at=c.updated_at,
                message_count=int(count),
            )
        )
    return out


@router.get(
    "/courses/{course_id}/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
)
async def list_messages(
    course_id: str, conversation_id: str, current: CurrentUser, db: Database
) -> list[MessageOut]:
    await assert_enrolled(db, current, course_id)
    convo = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.course_id == course_id,
            Conversation.user_id == current.id,
        )
    )
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    rows = (await db.execute(
        select(MessageModel)
        .where(MessageModel.conversation_id == conversation_id)
        .order_by(MessageModel.created_at.asc())
    )).scalars().all()
    return [MessageOut.model_validate(m) for m in rows]


@router.delete(
    "/courses/{course_id}/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    course_id: str, conversation_id: str, current: CurrentUser, db: Database
) -> None:
    await assert_enrolled(db, current, course_id)
    convo = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.course_id == course_id,
            Conversation.user_id == current.id,
        )
    )
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(convo)
    await db.commit()


# ─────────────────────────────────────────────────────
# Streaming chat (SSE)
# ─────────────────────────────────────────────────────

@router.post("/courses/{course_id}/chat")
@limiter.limit(settings.llm_rate_limit)
async def chat_stream(
    request: Request, course_id: str, payload: ChatRequest, current: CurrentUser, db: Database
):
    await assert_enrolled(db, current, course_id)
    course = await db.scalar(
        select(Course).where(Course.id == course_id).options(selectinload(Course.teacher))
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Ensure or create conversation
    conversation_id = payload.conversation_id
    if conversation_id:
        convo = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.course_id == course_id,
                Conversation.user_id == current.id,
            )
        )
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        convo = Conversation(
            id=str(uuid.uuid4()),
            user_id=current.id,
            course_id=course_id,
            title=payload.message[:60],
        )
        db.add(convo)
        await db.commit()
        await db.refresh(convo)

    # Persist the user message
    user_msg = MessageModel(
        id=str(uuid.uuid4()),
        conversation_id=convo.id,
        role="user",
        content=payload.message,
        citations=[],
    )
    db.add(user_msg)
    # Load recent history for context
    history_rows = (await db.execute(
        select(MessageModel)
        .where(MessageModel.conversation_id == convo.id)
        .order_by(MessageModel.created_at.asc())
    )).scalars().all()
    convo.updated_at = datetime.now(timezone.utc)
    await db.commit()

    assistant_id = str(uuid.uuid4())
    model_display = chain_display()

    # ── Semantic cache fast-path ────────────────────────────────
    # A standalone question (fresh chat, unscoped) that's semantically close to a
    # previously-answered one returns the cached answer instantly — skipping both
    # retrieval and the LLM. Only new conversations are cacheable, so follow-ups
    # (which depend on prior turns) always run normally. Fail-open: any cache
    # error falls straight through to the normal path.
    # The cache is keyed by (course, question, grounding), so every grounding
    # level has its own answer — a strict answer is never served for an open
    # request, and each level still benefits from caching.
    effective_grounding = resolve_grounding(payload.grounding, payload.rag_mode, course.rag_mode)
    cacheable = (
        settings.semantic_cache_enabled
        and not payload.conversation_id
        and not payload.scoped_material_id
    )
    cache_hit: dict | None = None
    if cacheable:
        try:
            cache_hit = await asyncio.to_thread(
                vector_store.semantic_cache_lookup,
                course_id,
                payload.message,
                settings.semantic_cache_threshold,
                settings.semantic_cache_ttl_days,
                effective_grounding,
            )
        except Exception as e:  # noqa: BLE001 — cache is best-effort
            log.warning("Semantic cache lookup failed: %s", e)
            cache_hit = None

    debug_payload: list[dict] = []
    llm_messages: list[LLMMessage] = []

    if cache_hit:
        citations_payload = cache_hit.get("citations") or []
    else:
        # At low grounding (Open) the AI answers purely from its own trained
        # knowledge, so skip retrieval entirely — no sources fetched, no citations.
        # Retrieval runs OUTSIDE the streaming generator so failures surface as HTTP 500.
        if effective_grounding <= 25:
            retrieved = []
        else:
            retrieved = await asyncio.to_thread(
                hybrid_retrieve,
                course,
                payload.message,
                None,
                payload.scoped_material_id,
            )
        citations_payload = [
            {
                "id": f"cit-{i+1}",
                "material_id": ch.material_id,
                "filename": ch.filename,
                "page": ch.page,
                "chunk_index": ch.chunk_index,
                "score": round(ch.score, 4),
                "source_url": ch.source_url or None,
                "snippet": (ch.document[:340] + "…") if len(ch.document) > 340 else ch.document,
            }
            for i, ch in enumerate(retrieved)
        ]
        if payload.debug and (course.teacher_id == current.id or current.role == "admin"):
            debug_payload = [
                RagDebugChunk(
                    material_id=ch.material_id,
                    filename=ch.filename,
                    page=ch.page,
                    chunk_index=ch.chunk_index,
                    score=round(ch.score, 4),
                    snippet=ch.document[:800],
                ).model_dump()
                for ch in retrieved
            ]
        recent = [(m.role, m.content) for m in history_rows if m.role in ("user", "assistant")]
        llm_messages = build_rag_prompt(
            course=course,
            question=payload.message,
            chunks=retrieved,
            recent_messages=recent,
            grounding=effective_grounding,
        )

    async def event_stream():
        # Open frames: tell client which conversation + meta
        yield _sse(
            "start",
            {
                "conversation_id": convo.id,
                "message_id": assistant_id,
                "user_message_id": user_msg.id,
                "model": "semantic-cache" if cache_hit else model_display,
                "ai_name": course.ai_name,
                "cached": bool(cache_hit),
                # The grounding this answer was produced at. For a cache hit it
                # equals the requested grounding (the cache is keyed on it), so
                # the client can verify per-grounding caching is working.
                "grounding": effective_grounding,
            },
        )
        if citations_payload:
            yield _sse("citations", {"citations": citations_payload})
        if debug_payload:
            yield _sse("debug", {"chunks": debug_payload})

        if cache_hit:
            # Instant answer from the semantic cache — no retrieval, no LLM.
            full = (cache_hit.get("answer") or "").strip()
            if full:
                yield _sse("delta", {"text": full})
        else:
            buf_parts: list[str] = []
            try:
                async for delta in llm_stream(llm_messages, user_id=current.id):
                    if not delta:
                        continue
                    buf_parts.append(delta)
                    yield _sse("delta", {"text": delta})
                    # Give up the event loop so cancellations land
                    await asyncio.sleep(0)
            except asyncio.CancelledError:
                log.info("Client cancelled chat stream conversation=%s", convo.id)
                raise
            except LLMQuotaError as e:
                yield _sse("error", {"message": str(e)})
            except LLMUnavailableError as e:
                # Generic message + a short, secret-redacted reason so an operator can
                # see WHY the chain failed (e.g. "HTTP 404: model not found") without
                # digging through server logs. `detail` never contains keys/prompts.
                detail = getattr(e, "detail", "")
                log.warning("LLM chain unavailable: %s", detail or e)
                msg = "The AI service is temporarily unavailable. Please try again."
                if detail:
                    msg = f"{msg} (reason: {detail})"
                yield _sse("error", {"message": msg})
            except Exception as e:
                # Never leak raw provider errors to the client.
                log.exception("LLM streaming error: %s", e)
                yield _sse("error", {"message": "The AI service is temporarily unavailable. Please try again."})

            full = "".join(buf_parts).strip()

            # Cache a fresh, non-empty answer so the next similar question is instant.
            if cacheable and full:
                try:
                    await asyncio.to_thread(
                        vector_store.semantic_cache_store,
                        course_id, payload.message, full, citations_payload, effective_grounding,
                    )
                except Exception as e:  # noqa: BLE001 — cache is best-effort
                    log.warning("Semantic cache store failed: %s", e)

        # Persist the assistant message in a fresh session (the request session is stale).
        async with SessionLocal() as write_db:
            write_db.add(
                MessageModel(
                    id=assistant_id,
                    conversation_id=convo.id,
                    role="assistant",
                    content=full,
                    citations=citations_payload,
                )
            )
            conv = await write_db.get(Conversation, convo.id)
            if conv:
                conv.updated_at = datetime.now(timezone.utc)
                # If this was the first real exchange, title the conversation nicely
                if conv.title.startswith("New ") or not conv.title.strip():
                    conv.title = payload.message[:60]
            await write_db.commit()

        yield _sse(
            "done",
            {
                "conversation_id": convo.id,
                "message_id": assistant_id,
                "citations": citations_payload,
            },
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
