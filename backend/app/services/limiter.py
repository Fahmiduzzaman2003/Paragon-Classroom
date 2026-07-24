from __future__ import annotations

"""In-memory rate limiter.

Built on slowapi (no Redis dependency — student-friendly, free).
Counters reset on process restart, which is acceptable for a single-node
deployment. When you move to multi-instance prod, swap the storage_uri
to redis:// and everything else keeps working.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Key = client IP. In production behind a proxy, swap this for a function
# that reads X-Forwarded-For (and ensure the proxy strips client-supplied
# values to prevent spoofing).
limiter = Limiter(key_func=get_remote_address, default_limits=[])