from time import perf_counter
import httpx

from app.core.config import get_settings
from app.services.ai.catalog import ProviderSpec, get_provider_spec
from app.services.ai.providers.base import (
    LLMProvider,
    ProviderAuthenticationError,
    ProviderConnectionResult,
    ProviderRateLimitError,
    ProviderResponseError,
    ProviderUnavailableError,
)


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, spec: ProviderSpec, api_key: str, model: str):
        self.spec = spec
        self.api_key = api_key
        self.model = model

    async def test_connection(self) -> ProviderConnectionResult:
        settings = get_settings()
        timeout = httpx.Timeout(settings.ai_provider_timeout_seconds, connect=10.0)
        started_at = perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.spec.base_url.rstrip('/')}/models",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "User-Agent": "zhixian/0.2",
                    },
                )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ProviderUnavailableError("无法连接模型厂商，请稍后重试") from exc

        latency_ms = round((perf_counter() - started_at) * 1000)
        if response.status_code in {401, 403}:
            raise ProviderAuthenticationError("API Key 无效或没有访问该模型的权限")
        if response.status_code == 429:
            raise ProviderRateLimitError("模型厂商限流、余额不足或额度已用完")
        if response.status_code >= 500:
            raise ProviderUnavailableError("模型厂商服务暂时不可用")
        if response.status_code >= 400:
            raise ProviderResponseError(
                f"模型配置未通过厂商校验（HTTP {response.status_code}）"
            )

        try:
            data = response.json()
            if not isinstance(data, dict):
                raise ProviderResponseError("模型厂商返回了无法识别的数据")
            base_status = data.get("base_resp", {}).get("status_code")
            if base_status not in {None, 0}:
                raise ProviderResponseError("模型厂商拒绝了当前配置")
            model_ids = {
                item["id"]
                for item in data["data"]
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
            if self.model not in model_ids:
                raise ProviderResponseError("API Key 有效，但当前账号无法使用所选模型")
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderResponseError("模型厂商返回了无法识别的数据") from exc

        return ProviderConnectionResult(
            provider=self.spec.key,
            model=self.model,
            latency_ms=latency_ms,
        )


class DeepSeekProvider(OpenAICompatibleProvider):
    pass


class MiniMaxProvider(OpenAICompatibleProvider):
    pass


def build_provider(provider: str, *, api_key: str, model: str) -> LLMProvider:
    spec = get_provider_spec(provider)
    if spec is None:
        raise ValueError("不支持的模型厂商")
    if provider == "deepseek":
        return DeepSeekProvider(spec, api_key, model)
    if provider == "minimax":
        return MiniMaxProvider(spec, api_key, model)
    raise ValueError("不支持的模型厂商")
