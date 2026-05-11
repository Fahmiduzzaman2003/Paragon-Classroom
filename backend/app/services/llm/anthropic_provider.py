from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from .base import LLMProvider, Message

log = logging.getLogger(__name__)


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str = "") -> None:
        from anthropic import AsyncAnthropic

        self.model = model or "claude-haiku-4-5-20251001"
        self._client = AsyncAnthropic(api_key=api_key)

    async def stream_completion(
        self,
        messages: list[Message],
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        system = ""
        normal: list[dict] = []
        for m in messages:
            if m.role == "system":
                system = (system + "\n\n" + m.content).strip()
            else:
                normal.append({"role": m.role, "content": m.content})
        async with self._client.messages.stream(
            model=self.model,
            system=system or None,
            messages=normal,
            max_tokens=max_tokens,
            temperature=temperature,
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield text
