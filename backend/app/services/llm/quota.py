"""Per-user and global daily LLM request caps.

In-process counters keyed by UTC date (documented limitation: resets on restart
and isn't shared across instances — the prod upgrade is Redis). Enforced BEFORE
the model call so an over-limit user gets a clean 429, never a partial charge.
"""

from __future__ import annotations

import threading
from datetime import date

from ...config import settings
from .errors import LLMQuotaError

_lock = threading.Lock()
_day: date | None = None
_global_count = 0
_user_counts: dict[str, int] = {}


def _roll_if_new_day() -> None:
    global _day, _global_count, _user_counts
    today = date.today()
    if _day != today:
        _day = today
        _global_count = 0
        _user_counts = {}


def enforce(user_id: str | None) -> None:
    """Raise :class:`LLMQuotaError` if a cap is already reached; else count one."""
    global _global_count
    with _lock:
        _roll_if_new_day()
        if settings.llm_daily_global_cap and _global_count >= settings.llm_daily_global_cap:
            raise LLMQuotaError("global")
        if user_id and settings.llm_daily_user_cap:
            if _user_counts.get(user_id, 0) >= settings.llm_daily_user_cap:
                raise LLMQuotaError("user")
        _global_count += 1
        if user_id:
            _user_counts[user_id] = _user_counts.get(user_id, 0) + 1


def snapshot() -> dict:
    with _lock:
        _roll_if_new_day()
        return {
            "date": str(_day),
            "global_count": _global_count,
            "global_cap": settings.llm_daily_global_cap or None,
            "user_cap": settings.llm_daily_user_cap or None,
            "distinct_users": len(_user_counts),
        }
