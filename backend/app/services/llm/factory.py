from __future__ import annotations

import logging
from functools import lru_cache

from ...config import settings
from .base import LLMProvider
from .mock_provider import MockLLMProvider

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_llm() -> LLMProvider:
    provider = settings.active_llm_provider
    model = settings.llm_model

    try:
        if provider == "openai":
            if not settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY not set")
            from .openai_provider import OpenAIProvider

            return OpenAIProvider(
                settings.openai_api_key,
                model,
                settings.openai_base_url,
            )
        if provider == "openrouter":
            if not settings.openrouter_api_key:
                raise RuntimeError("OPENROUTER_API_KEY not set")
            from .openrouter_provider import OpenRouterProvider

            return OpenRouterProvider(
                settings.openrouter_api_key,
                model,
                settings.openrouter_base_url,
            )
        if provider == "anthropic":
            if not settings.anthropic_api_key:
                raise RuntimeError("ANTHROPIC_API_KEY not set")
            from .anthropic_provider import AnthropicProvider

            return AnthropicProvider(settings.anthropic_api_key, model)
        if provider == "gemini":
            if not settings.gemini_api_key:
                raise RuntimeError("GEMINI_API_KEY not set")
            from .gemini_provider import GeminiProvider

            return GeminiProvider(settings.gemini_api_key, model)
    except Exception as e:
        log.warning("LLM provider %s unavailable (%s); using mock provider", provider, e)

    return MockLLMProvider()
