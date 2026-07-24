from __future__ import annotations

"""Email service.

Free-student-friendly design:
  * Configure SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD (e.g. Mailtrap's free
    sandbox, 500 emails/month, no credit card) to deliver real email.
  * Leave them blank to print all email contents to the server log
    (perfect for hackathon demos, offline dev, CI, etc.).

Both modes share the same public surface so the auth router never needs
to branch on which one is active.
"""

import asyncio
import logging
import secrets
from dataclasses import dataclass

import aiosmtplib
from email.message import EmailMessage

from ..config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailMessageData:
    to_email: str
    subject: str
    text: str
    html: str | None = None


def _build_message(msg: EmailMessageData) -> EmailMessage:
    m = EmailMessage()
    m["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    m["To"] = msg.to_email
    m["Subject"] = msg.subject
    m.set_content(msg.text)
    if msg.html:
        m.add_alternative(msg.html, subtype="html")
    return m


async def send_email(payload: EmailMessageData) -> None:
    """Send via SMTP if configured, otherwise log to stdout.

    Failures are logged but never raise — an unreachable SMTP server must
    not block user sign-up. The verification-resend endpoint is the
    fallback path.
    """
    configured = bool(settings.smtp_host and settings.smtp_username and settings.smtp_password)
    if not configured:
        log.warning(
            "[EMAIL:console-fallback]\n  to=%s\n  subject=%s\n----\n%s\n----",
            payload.to_email,
            payload.subject,
            payload.text,
        )
        return

    message = _build_message(payload)
    # Pick the TLS mode from the port so any standard provider works without the
    # user reasoning about implicit-vs-STARTTLS:
    #   465        -> implicit TLS (SSL from the first byte)
    #   587/2525/25 -> STARTTLS (upgrade a plaintext connection)
    port = settings.smtp_port
    implicit_tls = port == 465
    try:
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            use_tls=implicit_tls,
            start_tls=not implicit_tls,
        )
        log.info("Sent email to %s (subject=%s)", payload.to_email, payload.subject)
    except Exception as exc:  # noqa: BLE001 — never block sign-up on mail failure
        log.error("SMTP send failed for %s: %s", payload.to_email, exc)


# ─────────────────────────────────────────────────────
# Token helpers — used by /auth/verify-email and /auth/forgot-password
# ─────────────────────────────────────────────────────

def generate_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash). The raw token goes in the email
    link; only the hash is persisted.
    """
    raw = secrets.token_urlsafe(32)
    import hashlib
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, digest


def hash_token(raw: str) -> str:
    import hashlib
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()