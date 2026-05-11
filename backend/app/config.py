from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_frontend_origin: str = (
        "http://localhost:5173,"
        "http://localhost:5174,"
        "http://localhost:5175,"
        "http://127.0.0.1:5173,"
        "http://127.0.0.1:5174,"
        "http://127.0.0.1:5175,"
        "http://localhost:4173,"
        "http://localhost:4174,"
        "http://localhost:4175,"
        "http://127.0.0.1:4173,"
        "http://127.0.0.1:4174,"
        "http://127.0.0.1:4175"
    )

    # Security
    jwt_secret: str = "change-me-please-this-must-be-long-and-random"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_min: int = 30
    jwt_refresh_ttl_days: int = 14

    # Database
    database_url: str = "sqlite+aiosqlite:///./paragon.db"

    # Storage
    uploads_dir: Path = Field(default_factory=lambda: PROJECT_ROOT / "uploads")
    chroma_path: Path = Field(default_factory=lambda: PROJECT_ROOT / "chroma_data")

    # LLM
    llm_provider: Literal["openai", "openrouter", "anthropic", "gemini", "mock"] = "mock"
    llm_model: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    anthropic_api_key: str = ""
    gemini_api_key: str = ""

    # Embeddings
    embedding_provider: Literal["local", "openai"] = "local"
    embedding_model: str = ""

    # RAG
    rag_chunk_size: int = 500
    rag_chunk_overlap: int = 50
    rag_top_k: int = 6

    @property
    def active_llm_provider(self) -> Literal["openai", "openrouter", "anthropic", "gemini", "mock"]:
        """Resolve the runtime LLM provider.

        Keep the configured provider when it is explicit, but automatically
        promote a real provider when only its key is present and the app is
        still on the default mock setting.
        """
        if self.openrouter_api_key.strip():
            return "openrouter"
        if self.llm_provider != "mock":
            return self.llm_provider
        if self.gemini_api_key.strip():
            return "gemini"
        if self.anthropic_api_key.strip():
            return "anthropic"
        if self.openai_api_key.strip():
            return "openai"
        return "mock"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    # Ensure directories exist
    s.uploads_dir.mkdir(parents=True, exist_ok=True)
    s.chroma_path.mkdir(parents=True, exist_ok=True)
    return s


settings = get_settings()
