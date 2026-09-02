from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConnectionResult:
    provider: str
    model: str
    latency_ms: int


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
