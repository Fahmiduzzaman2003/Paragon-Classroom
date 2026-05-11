from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal


@dataclass(slots=True)
class Message:
    role: Literal["user", "assistant", "system"]
    content: str


class LLMProvider(ABC):
    """Streaming chat-completion provider. Subclasses MUST yield plain text deltas."""

    name: str
    model: str

    @abstractmethod
    async def stream_completion(
        self,
        messages: list[Message],
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        """Yield string chunks of the assistant's reply. Should be cancellable."""
        raise NotImplementedError
        yield ""  # pragma: no cover  — make type checker happy
