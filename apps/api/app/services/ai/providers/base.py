from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator


@dataclass(frozen=True)
class ProviderConnectionResult:
    provider: str
    model: str
    latency_ms: int


@dataclass(frozen=True)
class ProviderToolCall:
    id: str
    name: str
    arguments: str


@dataclass(frozen=True)
class ProviderChatResponse:
    content: str
    tool_calls: tuple[ProviderToolCall, ...] = ()
    finish_reason: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderStreamEvent:
    kind: str
    content: str = ""
    tool_call_index: int | None = None
    tool_call_id: str = ""
    tool_name: str = ""
    tool_arguments: str = ""
    finish_reason: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0


class ProviderError(RuntimeError):
    pass


class ProviderAuthenticationError(ProviderError):
    pass


class ProviderRateLimitError(ProviderError):
    pass


class ProviderUnavailableError(ProviderError):
    pass


class ProviderResponseError(ProviderError):
    pass


class LLMProvider(ABC):
    @abstractmethod
    async def test_connection(self) -> ProviderConnectionResult:
        """Validate credentials and selected-model availability."""

    @abstractmethod
    async def chat(
        self, *, messages: list[dict], tools: list[dict] | None = None
    ) -> ProviderChatResponse:
        """Return one normalized chat completion."""

    @abstractmethod
    def stream_chat(
        self, *, messages: list[dict], tools: list[dict] | None = None
    ) -> AsyncIterator[ProviderStreamEvent]:
        """Yield normalized provider streaming events."""
