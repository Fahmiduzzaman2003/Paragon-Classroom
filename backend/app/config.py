from __future__ import annotations

import os
import secrets
import warnings
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Default placeholder. Production MUST set JWT_SECRET explicitly via env.
# In development we auto-replace this with a random ephemeral secret and
# warn loudly — keeps demos working but never persists a known token.
_INSECURE_DEFAULT_SECRET = "change-me-please-this-must-be-long-and-random"
_GENERATED_DEV_SECRET: str | None = None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Legacy single/multi origin var (kept for backward compatibility). Prefer
    # CORS_ORIGINS. When CORS_ORIGINS is unset we fall back to this list.
    app_frontend_origin: str = (
        "http://localhost:5173,http://localhost:5174,http://localhost:5175,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,"
        "http://localhost:4173,http://localhost:4174,http://localhost:4175,"
        "http://127.0.0.1:4173,http://127.0.0.1:4174,http://127.0.0.1:4175"
    )
    # Explicit CORS allowlist (comma-separated). In production set this to your
    # Vercel production domain + stable preview alias. localhost is auto-added
    # in development via ``cors_allow_origin_regex``.
    cors_origins: str = ""

    # ── Security ───────────────────────────────────────
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_min: int = 30
    jwt_refresh_ttl_days: int = 14

    # ── Email verification ─────────────────────────────
    require_email_verification: bool = True
    email_token_ttl_min: int = 60 * 24  # 24 h

    # SMTP — leave blank to print verification links to the server console
    # (perfect for the free student tier). Sign up at https://mailtrap.io
    # (free 500 emails/month, no card) and paste the SMTP creds here.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "no-reply@paragon.local"
    smtp_from_name: str = "Paragon"
    smtp_use_tls: bool = True

    # ── Google OAuth ───────────────────────────────────
    # Create credentials at https://console.cloud.google.com/apis/credentials
    # (OAuth client ID, Web application). Leave blank to fall back to a
    # deterministic dev-mode login (never allowed in production).
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = (
        "http://localhost:5173/auth/google/callback,"
        "http://localhost:5174/auth/google/callback,"
        "http://localhost:5175/auth/google/callback,"
        "http://127.0.0.1:5173/auth/google/callback,"
        "http://127.0.0.1:5174/auth/google/callback,"
        "http://127.0.0.1:5175/auth/google/callback"
    )
    google_oauth_dev_fallback: bool = True

    # ── Rate limiting (in-memory; restart resets counters) ─────────
    login_rate_limit: str = "5/minute"
    register_rate_limit: str = "10/hour"
    forgot_rate_limit: str = "5/hour"
    upload_rate_limit: str = "30/minute"
    llm_rate_limit: str = "30/minute"

    # ── Database ───────────────────────────────────────
    # Dev default is SQLite. In production set a Neon Postgres URL, e.g.
    #   postgresql+asyncpg://user:pass@ep-xxx.neon.tech/paragon?ssl=require
    database_url: str = "sqlite+aiosqlite:///./paragon.db"
    db_pool_size: int = 5
    db_max_overflow: int = 2
    db_pool_recycle_s: int = 1800

    # ── Object storage ─────────────────────────────────
    uploads_dir: Path = Field(default_factory=lambda: PROJECT_ROOT / "uploads")
    # ``local`` writes to disk (laptop only). ``cloudinary`` streams uploads to
    # Cloudinary so files survive ephemeral-disk hosts like Render Free. When
    # unset we default to local in dev and cloudinary in production.
    storage_backend: Literal["local", "cloudinary"] | None = None
    cloudinary_cloud_name: str = ""
    cloudinary_upload_preset: str = ""
    cloudinary_folder: str = "paragon"

    # Upload guards (enforced client + server).
    max_upload_mb: int = 40
    max_ingest_pages: int = 50
    user_storage_quota_mb: int = 200

    # ── Vector store ───────────────────────────────────
    # ``chroma`` = on-disk ChromaDB (dev only; wiped on Render redeploy).
    # ``pgvector`` = persistent pgvector on the Postgres in DATABASE_URL (prod).
    vector_backend: Literal["chroma", "pgvector"] = "chroma"
    chroma_path: Path = Field(default_factory=lambda: PROJECT_ROOT / "chroma_data")

    # ── LLM ────────────────────────────────────────────
    # Single-provider selector (legacy). The fallback chain below supersedes it
    # when set. Kept so ``mock`` still runs the whole app with zero keys.
    llm_provider: Literal["openai", "openrouter", "anthropic", "gemini", "groq", "mock"] = "mock"
    llm_model: str = ""
    # Ordered, comma-separated fallback chain, e.g.
    #   gemini:gemini-2.0-flash,groq:llama-3.3-70b-versatile,openrouter:meta-llama/llama-3.3-70b-instruct:free
    # Empty = derive a single provider from whichever key is present.
    llm_fallback_chain: str = ""
    # Per-attempt + whole-chain deadlines (seconds).
    llm_attempt_timeout_s: int = 30
    llm_chain_deadline_s: int = 60
    # Cost/quota guards (requests/day; 0 = unlimited).
    llm_daily_user_cap: int = 0
    llm_daily_global_cap: int = 0
    # Circuit breaker.
    llm_breaker_threshold: int = 3
    llm_breaker_cooldown_s: int = 60

    openai_api_key: str = ""
    openai_base_url: str = ""
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # ── Embeddings ─────────────────────────────────────
    # ``local`` = ChromaDB ONNX MiniLM (dev only, heavy on 512 MB).
    # ``gemini``/``openai`` = hosted API (production; no local model, no OOM).
    embedding_provider: Literal["local", "openai", "gemini"] = "local"
    embedding_model: str = ""

    # ── RAG ────────────────────────────────────────────
    rag_chunk_size: int = 500
    rag_chunk_overlap: int = 50
    rag_top_k: int = 6
    rag_similarity_floor: float = 0.15
    # Max approx tokens of retrieved context assembled into the prompt. Context
    # is trimmed deterministically (least-relevant first) when it would exceed.
    rag_context_budget_tokens: int = 3000

    # ── Ingestion worker pool (free tier: no external queue) ───────
    ingest_concurrency: int = 2
    ingest_job_timeout_s: int = 300
    ingest_max_attempts: int = 3

    # ── Exams / grading ────────────────────────────────────────────
    # Grace window after the timer expires in which a submission is still
    # accepted (flagged ``late``) — covers flaky networks / cold-start retries.
    exam_grace_period_s: int = 120
    # Bumped whenever the LLM grading rubric prompt changes; stored per grade
    # for auditability / re-grading decisions.
    grading_rubric_version: str = "v1"

    # ── Observability ──────────────────────────────────
    sentry_dsn: str = ""  # leave blank to disable error tracking

    # ─────────────────────────────────────────────────────
    # Validators
    # ─────────────────────────────────────────────────────
    @field_validator("jwt_secret", mode="before")
    @classmethod
    def _resolve_jwt_secret(cls, v: str) -> str:
        """Trust an explicit secret; in dev mint an ephemeral one; in prod leave
        blank so the after-validator can report it alongside any other problems."""
        global _GENERATED_DEV_SECRET
        if v and v != _INSECURE_DEFAULT_SECRET:
            return v
        env = os.environ.get("APP_ENV", "development").lower()
        if env in {"production", "staging"}:
            return ""  # reported by _validate_production()
        if _GENERATED_DEV_SECRET is None:
            _GENERATED_DEV_SECRET = secrets.token_urlsafe(64)
            warnings.warn(
                "JWT_SECRET not set — generated an ephemeral random secret for "
                "this process. Tokens will NOT survive a restart. Set JWT_SECRET "
                "in backend/.env for stable local tokens.",
                stacklevel=2,
            )
        return _GENERATED_DEV_SECRET

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        """Fail fast in production/staging, listing EVERY missing/invalid var at
        once so a misconfigured deploy is a single clear error, not a guessing
        game. Development stays permissive so the app runs with zero setup."""
        if self.app_env not in {"production", "staging"}:
            return self

        problems: list[str] = []

        if not self.jwt_secret:
            problems.append(
                "JWT_SECRET is required. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        if self.is_sqlite:
            problems.append(
                "DATABASE_URL points at SQLite — Render's disk is ephemeral. "
                "Set a Postgres URL (postgresql+asyncpg://...)."
            )
        if not self.cors_origins.strip() and not self.app_frontend_origin.strip():
            problems.append("CORS_ORIGINS is required (your Vercel frontend origin).")

        if self._effective_storage_backend == "cloudinary" and not (
            self.cloudinary_cloud_name and self.cloudinary_upload_preset
        ):
            problems.append(
                "STORAGE_BACKEND=cloudinary requires CLOUDINARY_CLOUD_NAME and "
                "CLOUDINARY_UPLOAD_PRESET."
            )
        if self.vector_backend == "chroma":
            problems.append(
                "VECTOR_BACKEND=chroma is on-disk and wiped on every Render "
                "redeploy. Set VECTOR_BACKEND=pgvector."
            )
        if self.embedding_provider == "local":
            problems.append(
                "EMBEDDING_PROVIDER=local loads a model in-process and risks OOM "
                "on Render Free. Use 'gemini' (or 'openai') with the matching key."
            )
        if self.embedding_provider == "gemini" and not self.gemini_api_key:
            problems.append("EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY.")
        if self.embedding_provider == "openai" and not self.openai_api_key:
            problems.append("EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY.")
        if self.google_oauth_dev_fallback:
            problems.append(
                "GOOGLE_OAUTH_DEV_FALLBACK must be false in production "
                "(the dev shim would let anyone sign in as any email)."
            )

        if problems:
            bullet = "\n  - ".join(problems)
            raise RuntimeError(
                f"Invalid configuration for APP_ENV={self.app_env}:\n  - {bullet}\n"
                "Fix these environment variables and redeploy."
            )
        return self

    # ─────────────────────────────────────────────────────
    # Derived helpers
    # ─────────────────────────────────────────────────────
    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_username and self.smtp_password)

    @property
    def email_verification_enforced(self) -> bool:
        """Gate logins on verification ONLY when the link can actually reach the
        user: a real SMTP server, or — in development — the console fallback a
        dev can read from the logs. In PRODUCTION without SMTP, enforcing would
        lock real users out of an inbox they never receive, so we don't."""
        if not self.require_email_verification:
            return False
        return self.smtp_configured or self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env in {"production", "staging"}

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.cors_origins.strip() or self.app_frontend_origin
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def cors_allow_origin_regex(self) -> str | None:
        """Allow any localhost/127.0.0.1 port in development so every Vite/preview
        port works without listing them. Disabled in production."""
        if self.is_production:
            return None
        return r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    @property
    def _effective_storage_backend(self) -> str:
        backend = (self.storage_backend or "").strip().lower()
        if backend:
            return backend
        return "local" if self.app_env == "development" else "cloudinary"

    @property
    def active_llm_provider(self) -> Literal["openai", "openrouter", "anthropic", "gemini", "groq", "mock"]:
        """Resolve the single runtime LLM provider (used when no fallback chain
        is configured). Promotes a real provider when only its key is present."""
        if self.llm_provider != "mock":
            return self.llm_provider
        if self.gemini_api_key.strip():
            return "gemini"
        if self.groq_api_key.strip():
            return "groq"
        if self.openrouter_api_key.strip():
            return "openrouter"
        if self.anthropic_api_key.strip():
            return "anthropic"
        if self.openai_api_key.strip():
            return "openai"
        return "mock"

    @property
    def llm_chain(self) -> list[tuple[str, str]]:
        """Parse LLM_FALLBACK_CHAIN into [(provider, model), ...]. Falls back to a
        single-entry chain derived from ``active_llm_provider`` when unset."""
        raw = self.llm_fallback_chain.strip()
        if not raw:
            return [(self.active_llm_provider, self.llm_model)]
        chain: list[tuple[str, str]] = []
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            provider, _, model = part.partition(":")
            chain.append((provider.strip().lower(), model.strip()))
        return chain or [(self.active_llm_provider, self.llm_model)]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    # Only create local dirs when actually using on-disk backends — in prod
    # (cloudinary + pgvector) we never touch the ephemeral disk.
    if s._effective_storage_backend == "local":
        s.uploads_dir.mkdir(parents=True, exist_ok=True)
    if s.vector_backend == "chroma":
        s.chroma_path.mkdir(parents=True, exist_ok=True)
    return s


settings = get_settings()
