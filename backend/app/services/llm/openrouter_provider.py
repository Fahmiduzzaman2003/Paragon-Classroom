from __future__ import annotations

from collections.abc import AsyncIterator

from .base import LLMProvider, Message


class OpenRouterProvider(LLMProvider):
    name = "openrouter"

    def __init__(self, api_key: str, model: str = "", base_url: str = "") -> None:
        from openai import AsyncOpenAI

        self.model = model or "anthropic/claude-3.5-sonnet"
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)

    async def stream_completion(
        self,
        messages: list[Message],
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for event in stream:
            if not event.choices:
                continue
            delta = event.choices[0].delta.content or ""
            if delta:
                yield delta