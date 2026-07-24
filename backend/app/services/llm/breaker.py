"""Per-provider circuit breaker + rolling success metrics.

In-process (documented limitation — a multi-instance deploy would want this in
Redis; the seam is :class:`CircuitBreaker`, swap its storage). After N
consecutive failures a provider is skipped for a cooldown window, then the next
attempt acts as a half-open probe: success closes it, failure re-opens it.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class _State:
    consecutive_failures: int = 0
    open_until: float = 0.0
    successes: int = 0
    failures: int = 0
    recent: deque[bool] = field(default_factory=lambda: deque(maxlen=20))
    last_error: str = ""


class CircuitBreaker:
    def __init__(self, threshold: int, cooldown_s: int) -> None:
        self._threshold = max(1, threshold)
        self._cooldown = max(1, cooldown_s)
        self._states: dict[str, _State] = {}
        self._lock = threading.Lock()

    def _get(self, key: str) -> _State:
        st = self._states.get(key)
        if st is None:
            st = _State()
            self._states[key] = st
        return st

    def allow(self, key: str) -> bool:
        """False while the breaker is open (inside the cooldown window)."""
        with self._lock:
            st = self._get(key)
            return time.monotonic() >= st.open_until

    def record_success(self, key: str) -> None:
        with self._lock:
            st = self._get(key)
            st.consecutive_failures = 0
            st.open_until = 0.0
            st.successes += 1
            st.recent.append(True)

    def record_failure(self, key: str, error: str = "") -> None:
        with self._lock:
            st = self._get(key)
            st.consecutive_failures += 1
            st.failures += 1
            st.recent.append(False)
            if error:
                st.last_error = error[:200]
            if st.consecutive_failures >= self._threshold:
                st.open_until = time.monotonic() + self._cooldown
                st.consecutive_failures = 0

    def snapshot(self) -> dict[str, dict]:
        now = time.monotonic()
        out: dict[str, dict] = {}
        with self._lock:
            for key, st in self._states.items():
                is_open = now < st.open_until
                total = st.successes + st.failures
                rate = (st.successes / total) if total else None
                recent_rate = (sum(st.recent) / len(st.recent)) if st.recent else None
                out[key] = {
                    "state": "open" if is_open else "closed",
                    "cooldown_remaining_s": round(max(0.0, st.open_until - now), 1),
                    "successes": st.successes,
                    "failures": st.failures,
                    "success_rate": round(rate, 3) if rate is not None else None,
                    "recent_success_rate": round(recent_rate, 3) if recent_rate is not None else None,
                    "last_error": st.last_error or None,
                }
        return out
