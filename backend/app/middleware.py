"""Cross-cutting HTTP middleware: request IDs, security headers, body-size cap.

These are written as **pure ASGI** middleware (not ``BaseHTTPMiddleware``) on
purpose. ``BaseHTTPMiddleware`` rebuilds the response object, which corrupts
``StreamingResponse`` / Server-Sent-Events — it can drop headers (including the
CORS header, breaking the chat stream in the browser) and it buffers the body
instead of flushing each token. Pure ASGI middleware only wraps ``send`` to
tweak the response-start headers, so streaming passes through untouched.
"""

from __future__ import annotations

import contextvars
import logging
import uuid

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("paragon.request")

# Exposes the current request id to any code (e.g. the LLM logger) without
# threading it through every call.
request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


def get_request_id() -> str:
    return request_id_ctx.get()


class RequestIDMiddleware:
    """Attach a request id to every request/response so a screenshot with
    ``X-Request-ID`` is enough to find the log line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        rid = ""
        for k, v in scope["headers"]:
            if k == b"x-request-id":
                rid = v.decode("latin-1")
                break
        rid = rid or uuid.uuid4().hex[:16]
        token = request_id_ctx.set(rid)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = rid
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            request_id_ctx.reset(token)


class SecurityHeadersMiddleware:
    """Baseline security headers. HSTS is safe because both Render and Vercel
    serve exclusively over HTTPS."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                h.setdefault("X-Content-Type-Options", "nosniff")
                h.setdefault("X-Frame-Options", "DENY")
                h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                h.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
            await send(message)

        await self.app(scope, receive, send_wrapper)


class BodySizeLimitMiddleware:
    """Reject oversized request bodies early via Content-Length. Streaming
    uploads are additionally capped chunk-by-chunk in the upload handler; this
    is the cheap first line of defence against a giant POST."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self._max = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for k, v in scope["headers"]:
            if k == b"content-length":
                try:
                    if int(v) > self._max:
                        resp = JSONResponse(
                            status_code=413,
                            content={
                                "error": {
                                    "code": 413,
                                    "message": "Request body too large",
                                    "request_id": get_request_id(),
                                }
                            },
                        )
                        await resp(scope, receive, send)
                        return
                except ValueError:
                    pass
                break

        await self.app(scope, receive, send)
