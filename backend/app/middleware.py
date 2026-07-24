"""Cross-cutting HTTP middleware: request IDs, security headers, body-size cap.

Kept lightweight so it adds negligible latency on Render's shared CPU.
"""

from __future__ import annotations

import contextvars
import logging
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

log = logging.getLogger("paragon.request")

# Exposes the current request id to any code (e.g. the LLM logger) without
# threading it through every call.
request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


def get_request_id() -> str:
    return request_id_ctx.get()


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a request id to every request/response and log the outcome, so a
    screenshot with ``X-Request-ID`` is enough to find the log line."""

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        token = request_id_ctx.set(rid)
        request.state.request_id = rid
        try:
            response = await call_next(request)
        except Exception:
            log.exception("Unhandled error rid=%s %s %s", rid, request.method, request.url.path)
            raise
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = rid
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Baseline security headers. HSTS is safe because both Render and Vercel
    serve exclusively over HTTPS."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized request bodies early via Content-Length. Streaming
    uploads are additionally capped chunk-by-chunk in the upload handler; this
    is the cheap first line of defence against a giant POST."""

    def __init__(self, app, max_bytes: int) -> None:
        super().__init__(app)
        self._max = max_bytes

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) > self._max:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "error": {
                                "code": 413,
                                "message": "Request body too large",
                                "request_id": get_request_id(),
                            }
                        },
                    )
            except ValueError:
                pass
        return await call_next(request)
