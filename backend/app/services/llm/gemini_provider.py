from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from .base import LLMProvider, Message

log = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str = "") -> None:
        import google.generativeai as genai

        self.model = model or "gemini-1.5-flash"
        genai.configure(api_key=api_key)
        self._genai = genai

    async def stream_completion(
        self,
        messages: list[Message],
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        # Merge system-role messages into an instruction prefix.
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        history: list[dict] = []
        for m in messages:
            if m.role == "system":
                continue
            history.append({"role": "user" if m.role == "user" else "model", "parts": [m.content]})

        def _iter():
            model = self._genai.GenerativeModel(
                self.model,
                system_instruction=system or None,
                generation_config={"temperature": temperature, "max_output_tokens": max_tokens},
            )
            return model.generate_content(history, stream=True)

        response = await asyncio.to_thread(_iter)
        for chunk in response:
            # response iteration is synchronous; surrender control per chunk
            text = getattr(chunk, "text", "") or ""
            if text:
                yield text
            await asyncio.sleep(0)
