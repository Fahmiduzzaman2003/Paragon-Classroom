"""Provider-agnostic LLM orchestration: ordered fallback chain, error-classified
retries, per-provider circuit breaking, per-attempt timeout + whole-chain
deadline, cost/quota guards, JSON-mode with one repair, and streaming with a
buffer-until-first-token fallback.

Everything is driven by ``LLM_FALLBACK_CHAIN`` — adding/reordering providers is a
config change, no code edit.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from functools import lru_cache

from ...config import settings
from . import quota
from .base import LLMProvider, Message
from .breaker import CircuitBreaker
from .errors import Decision, LLMUnavailableError, classify, safe_reason
from .factory import create_provider

log = logging.getLogger("paragon.llm")

_breaker = CircuitBreaker(settings.llm_breaker_threshold, settings.llm_breaker_cooldown_s)
_MAX_RETRIES_PER_PROVIDER = 3


@dataclass(slots=True)
class LLMResult:
    text: str
    model_used: str
    provider: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    attempts: int


@lru_cache(maxsize=1)
def _chain() -> list[LLMProvider]:
    providers: list[LLMProvider] = []
    for name, model in settings.llm_chain:
        p = create_provider(name, model)
        if p is not None:
            providers.append(p)
    if not providers:
        log.warning("No usable providers in LLM_FALLBACK_CHAIN — using mock")
        mock = create_provider("mock", "")
        if mock:
            providers.append(mock)
    return providers


def chain_display() -> str:
    return ",".join(f"{p.name}:{p.model}" for p in _chain())


def has_real_provider() -> bool:
    """True when the chain contains a non-mock provider (i.e. a real API key is
    configured). Lets features degrade cleanly to deterministic/manual paths when
    running key-less locally."""
    return any(p.name != "mock" for p in _chain())


def health_snapshot() -> dict:
    return {
        "chain": [{"provider": p.name, "model": p.model} for p in _chain()],
        "breakers": _breaker.snapshot(),
        "quota": quota.snapshot(),
    }


def _tok(messages: list[Message]) -> int:
    return max(1, sum(len(m.content) for m in messages) // 4)


def _log_call(*, provider: str, model: str, attempt: int, latency_ms: int,
              tokens_in: int, tokens_out: int, user_id: str | None,
              error_class: str | None = None) -> None:
    # Structured single-line log. Cost is 0 on the free tier but the field is
    # here so a paid provider can populate it later.
    log.info(
        "llm_call provider=%s model=%s attempt=%d latency_ms=%d tok_in=%d tok_out=%d user=%s error=%s",
        provider, model, attempt, latency_ms, tokens_in, tokens_out, user_id or "-", error_class or "-",
    )


async def _collect(provider: LLMProvider, messages: list[Message], temperature: float, max_tokens: int) -> str:
    parts: list[str] = []
    async for delta in provider.stream_completion(messages, temperature, max_tokens):
        if delta:
            parts.append(delta)
    return "".join(parts)


async def complete(
    messages: list[Message],
    *,
    user_id: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    deadline_s: int | None = None,
    attempt_timeout_s: int | None = None,
) -> LLMResult:
    """Run the chain to a single, non-streamed completion. Enforces quota first,
    a per-attempt timeout, and a whole-chain deadline."""
    quota.enforce(user_id)
    deadline = time.monotonic() + (deadline_s or settings.llm_chain_deadline_s)
    attempt_to = attempt_timeout_s or settings.llm_attempt_timeout_s
    attempts = 0
    last_err: Exception | None = None
    tokens_in = _tok(messages)

    for provider in _chain():
        key = provider.name
        if not _breaker.allow(key):
            log.info("Skipping %s (circuit open)", key)
            continue
        for r in range(_MAX_RETRIES_PER_PROVIDER):
            if time.monotonic() >= deadline:
                log.warning("LLM chain deadline exceeded")
                raise LLMUnavailableError()
            attempts += 1
            t0 = time.monotonic()
            try:
                remaining = deadline - time.monotonic()
                to = max(1.0, min(attempt_to, remaining))
                text = await asyncio.wait_for(
                    _collect(provider, messages, temperature, max_tokens), timeout=to
                )
                if not text.strip():
                    raise RuntimeError("empty completion")
                _breaker.record_success(key)
                latency = int((time.monotonic() - t0) * 1000)
                _log_call(provider=key, model=provider.model, attempt=attempts, latency_ms=latency,
                          tokens_in=tokens_in, tokens_out=len(text) // 4, user_id=user_id)
                return LLMResult(text, provider.model, key, tokens_in, len(text) // 4, latency, attempts)
            except Exception as e:  # noqa: BLE001
                last_err = e
                decision = classify(e)
                _breaker.record_failure(key, str(e))
                _log_call(provider=key, model=provider.model, attempt=attempts,
                          latency_ms=int((time.monotonic() - t0) * 1000), tokens_in=tokens_in,
                          tokens_out=0, user_id=user_id, error_class=f"{type(e).__name__}:{decision.value}")
                if decision == Decision.FAIL_FAST:
                    raise LLMUnavailableError() from e
                if decision == Decision.RETRY_SAME and r < _MAX_RETRIES_PER_PROVIDER - 1:
                    await asyncio.sleep(min(8.0, 1.5 * (2 ** r)) + random.uniform(0, 0.5))
                    continue
                break  # NEXT_PROVIDER, or retries exhausted → next provider

    log.error("All LLM providers failed; last error: %s", last_err)
    raise LLMUnavailableError()


async def stream(
    messages: list[Message],
    *,
    user_id: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
):
    """Stream deltas with a buffer-until-first-token fallback: if a provider fails
    BEFORE emitting its first token, we transparently try the next one. Once bytes
    are flushed to the client we can't fall back, so a mid-stream failure raises a
    graceful error instead of silently truncating."""
    quota.enforce(user_id)
    attempt_to = settings.llm_attempt_timeout_s
    last_err: Exception | None = None
    tokens_in = _tok(messages)

    for provider in _chain():
        key = provider.name
        if not _breaker.allow(key):
            continue
        t0 = time.monotonic()
        try:
            gen = provider.stream_completion(messages, temperature, max_tokens).__aiter__()
            first = await asyncio.wait_for(gen.__anext__(), timeout=attempt_to)
        except StopAsyncIteration:
            last_err = RuntimeError("empty stream")
            _breaker.record_failure(key, "empty stream")
            continue
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 — failed before first token → try next provider
            last_err = e
            decision = classify(e)
            _breaker.record_failure(key, str(e))
            _log_call(provider=key, model=provider.model, attempt=1,
                      latency_ms=int((time.monotonic() - t0) * 1000), tokens_in=tokens_in,
                      tokens_out=0, user_id=user_id, error_class=f"{type(e).__name__}:{decision.value}")
            if decision == Decision.FAIL_FAST:
                raise LLMUnavailableError(detail=safe_reason(e)) from e
            continue

        # First token arrived — commit to this provider.
        _breaker.record_success(key)
        emitted = 0
        yield first
        emitted += len(first)
        try:
            async for delta in gen:
                if delta:
                    emitted += len(delta)
                    yield delta
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 — bytes already flushed, cannot fall back
            log.warning("Mid-stream failure on %s after %d chars: %s", key, emitted, e)
            raise LLMUnavailableError("The response was interrupted. Please retry.") from e
        _log_call(provider=key, model=provider.model, attempt=1,
                  latency_ms=int((time.monotonic() - t0) * 1000), tokens_in=tokens_in,
                  tokens_out=emitted // 4, user_id=user_id)
        return

    log.error("All LLM providers failed before first token; last error: %s", last_err)
    raise LLMUnavailableError(detail=safe_reason(last_err))


# ─────────────────────────────────────────────────────
# Structured (JSON) output with one repair attempt
# ─────────────────────────────────────────────────────
def _extract_json(text: str) -> dict:
    import json

    s = text.strip()
    # Strip markdown fences if present.
    if s.startswith("```"):
        s = s.split("```", 2)[1] if s.count("```") >= 2 else s.strip("`")
        if s.lstrip().startswith("json"):
            s = s.lstrip()[4:]
    # Fall back to the outermost braces.
    start, end = s.find("{"), s.rfind("}")
    if start != -1 and end != -1 and end > start:
        s = s[start : end + 1]
    return json.loads(s)


async def complete_json(
    messages: list[Message],
    *,
    schema,  # a pydantic BaseModel subclass
    user_id: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.0,
):
    """Return ``(validated_model_instance, LLMResult)``. Requests JSON, validates
    against ``schema`` (a pydantic model), and does ONE repair round before
    letting the failure fall through to the caller."""
    fields = list(getattr(schema, "model_fields", {}).keys())
    hint = Message(
        role="system",
        content=(
            "Respond with a SINGLE valid JSON object and nothing else — no prose, "
            f"no markdown fences. Required keys: {fields}."
        ),
    )
    res = await complete(messages + [hint], user_id=user_id, max_tokens=max_tokens, temperature=temperature)
    try:
        return schema.model_validate(_extract_json(res.text)), res
    except Exception as first_err:
        log.info("JSON validation failed (%s); attempting one repair", first_err)
        repair = Message(
            role="user",
            content=(
                "Your previous reply was not valid JSON for the required schema. "
                "Reply again with ONLY a corrected JSON object. Your previous reply was:\n"
                f"{res.text[:1200]}"
            ),
        )
        res2 = await complete(
            messages + [hint, repair], user_id=user_id, max_tokens=max_tokens, temperature=0.0
        )
        return schema.model_validate(_extract_json(res2.text)), res2
