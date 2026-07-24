from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from functools import lru_cache

from ...config import settings
from .base import LLMProvider, Message
from .mock_provider import MockLLMProvider

log = logging.getLogger(__name__)


def create_provider(name: str, model: str) -> LLMProvider | None:
    """Construct one provider adapter from its name + model, or None if its key
    is missing / it can't initialise. Adding a provider here (plus a case) is the
    only code change needed to extend the fallback chain."""
    name = (name or "").lower()
    try:
        if name == "mock":
            return MockLLMProvider(model or "paragon-mock-1")
        if name == "openai":
            if not settings.openai_api_key:
                return None
            from .openai_provider import OpenAIProvider

            return OpenAIProvider(settings.openai_api_key, model, settings.openai_base_url)
        if name == "groq":
            # Groq exposes an OpenAI-compatible API, so we reuse the OpenAI adapter.
            if not settings.groq_api_key:
                return None
            from .openai_provider import OpenAIProvider

            p = OpenAIProvider(settings.groq_api_key, model or "llama-3.3-70b-versatile", settings.groq_base_url)
            p.name = "groq"
            return p
        if name == "openrouter":
            if not settings.openrouter_api_key:
                return None
            from .openrouter_provider import OpenRouterProvider

            return OpenRouterProvider(settings.openrouter_api_key, model, settings.openrouter_base_url)
        if name == "mistral":
            # Mistral exposes an OpenAI-compatible API, so we reuse the OpenAI adapter.
            if not settings.mistral_api_key:
                return None
            from .openai_provider import OpenAIProvider

            p = OpenAIProvider(settings.mistral_api_key, model or "mistral-small-latest", settings.mistral_base_url)
            p.name = "mistral"
            return p
        if name == "anthropic":
            if not settings.anthropic_api_key:
                return None
            from .anthropic_provider import AnthropicProvider

            return AnthropicProvider(settings.anthropic_api_key, model)
        if name == "gemini":
            if not settings.gemini_api_key:
                return None
            from .gemini_provider import GeminiProvider

            return GeminiProvider(settings.gemini_api_key, model)
    except Exception as e:
        log.warning("Provider %s unavailable (%s)", name, e)
        return None
    log.warning("Unknown LLM provider in chain: %s", name)
    return None


class FallbackLLM(LLMProvider):
    """Drop-in provider whose ``stream_completion`` runs the whole fallback chain
    (with circuit breaking + classification). Existing callers of ``get_llm()``
    gain resilience without any change."""

    name = "chain"

    def __init__(self) -> None:
        # Imported lazily to avoid a circular import with the orchestrator.
        from . import orchestrator

        self.model = orchestrator.chain_display()

    async def stream_completion(
        self,
        messages: list[Message],
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        from . import orchestrator

        async for delta in orchestrator.stream(messages, temperature=temperature, max_tokens=max_tokens):
            yield delta


@lru_cache(maxsize=1)
def get_llm() -> LLMProvider:
    return FallbackLLM()
