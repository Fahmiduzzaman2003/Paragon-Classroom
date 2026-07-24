"""Error classification + safe, user-facing LLM error types.

We never blanket-retry. Each failure is classified so the orchestrator knows
whether to retry the same provider, move to the next, or fail fast.
"""

from __future__ import annotations

import asyncio
from enum import Enum


class Decision(str, Enum):
    RETRY_SAME = "retry_same"      # transient: 429/5xx/timeout/connection reset
    NEXT_PROVIDER = "next_provider"  # auth/model/context/content-filter/quota
    FAIL_FAST = "fail_fast"        # our own bad request (400) / cancellation


class LLMUnavailableError(Exception):
    """Raised when the whole chain fails. Carries only a safe, generic message —
    raw provider errors (which can leak keys/prompts) are logged, never surfaced."""

    def __init__(self, message: str = "The AI service is temporarily unavailable. Please try again in a moment.") -> None:
        super().__init__(message)


class LLMQuotaError(Exception):
    """Raised when a per-user or global daily request cap is hit."""

    def __init__(self, scope: str) -> None:
        self.scope = scope
        super().__init__(
            "You've reached today's AI usage limit. Please try again tomorrow."
            if scope == "user"
            else "The AI service has reached its daily capacity. Please try again later."
        )


def _status_of(exc: Exception) -> int | None:
    for attr in ("status_code", "code", "http_status"):
        v = getattr(exc, attr, None)
        if isinstance(v, int):
            return v
    resp = getattr(exc, "response", None)
    if resp is not None:
        v = getattr(resp, "status_code", None)
        if isinstance(v, int):
            return v
    return None


def classify(exc: Exception) -> Decision:
    """Map any provider exception to a fallback decision."""
    if isinstance(exc, asyncio.CancelledError):
        return Decision.FAIL_FAST
    if isinstance(exc, asyncio.TimeoutError):
        return Decision.RETRY_SAME

    status = _status_of(exc)
    msg = str(exc).lower()

    # Move on immediately — retrying the same provider won't help.
    if status in (401, 403) or "api key" in msg or "unauthor" in msg or "permission" in msg:
        return Decision.NEXT_PROVIDER
    if status == 404 or "not found" in msg or "does not exist" in msg or "unknown model" in msg:
        return Decision.NEXT_PROVIDER
    if "context length" in msg or "maximum context" in msg or "too many tokens" in msg or "context_length" in msg:
        return Decision.NEXT_PROVIDER
    if "content filter" in msg or "safety" in msg or "blocked" in msg or "content_policy" in msg:
        return Decision.NEXT_PROVIDER
    if "quota" in msg or "exhausted" in msg or "billing" in msg or "insufficient_quota" in msg:
        return Decision.NEXT_PROVIDER

    # Transient — retry the same provider with backoff.
    if status == 429 or "rate limit" in msg or "overloaded" in msg or "timeout" in msg:
        return Decision.RETRY_SAME
    if status is not None and 500 <= status < 600:
        return Decision.RETRY_SAME
    if "connection" in msg or "reset" in msg or "temporarily" in msg:
        return Decision.RETRY_SAME

    # A 400 that isn't one of the above is likely our malformed request → fail fast.
    if status == 400:
        return Decision.FAIL_FAST

    # Unknown: treat as transient but capped by attempt limits.
    return Decision.RETRY_SAME
