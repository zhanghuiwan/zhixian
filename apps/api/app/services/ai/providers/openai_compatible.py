import json
from time import perf_counter
from typing import AsyncIterator
import httpx

from app.core.config import get_settings
from app.services.ai.catalog import ProviderSpec, get_provider_spec
from app.services.ai.providers.base import (
    LLMProvider,
    ProviderAuthenticationError,
    ProviderChatResponse,
    ProviderConnectionResult,
    ProviderRateLimitError,
    ProviderResponseError,
    ProviderStreamEvent,
    ProviderToolCall,
    ProviderUnavailableError,
)


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, spec: ProviderSpec, api_key: str, model: str):
        self.spec = spec
        self.api_key = api_key
        self.model = model

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "zhixian/0.2",
        }

    def _payload(
        self, *, messages: list[dict], tools: list[dict] | None, stream: bool
    ) -> dict:
        settings = get_settings()
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "max_tokens": settings.ai_max_output_tokens,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if self.spec.key == "minimax":
            payload["reasoning_split"] = True
        if stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    @staticmethod
    def _raise_for_response(response: httpx.Response) -> None:
        if response.status_code in {401, 403}:
            raise ProviderAuthenticationError("API Key 无效或没有访问该模型的权限")
        if response.status_code == 429:
            raise ProviderRateLimitError("模型厂商限流、余额不足或额度已用完")
        if response.status_code >= 500:
            raise ProviderUnavailableError("模型厂商服务暂时不可用")
        if response.status_code >= 400:
            raise ProviderResponseError(
                f"模型调用失败（HTTP {response.status_code}）"
            )

    async def test_connection(self) -> ProviderConnectionResult:
        settings = get_settings()
        timeout = httpx.Timeout(settings.ai_provider_timeout_seconds, connect=10.0)
        started_at = perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{self.spec.base_url.rstrip('/')}/models",
                    headers=self._headers,
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

    async def chat(
        self, *, messages: list[dict], tools: list[dict] | None = None
    ) -> ProviderChatResponse:
        settings = get_settings()
        timeout = httpx.Timeout(settings.ai_provider_timeout_seconds, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.spec.base_url.rstrip('/')}/chat/completions",
                    headers=self._headers,
                    json=self._payload(messages=messages, tools=tools, stream=False),
                )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ProviderUnavailableError("无法连接模型厂商，请稍后重试") from exc
        self._raise_for_response(response)
        try:
            data = response.json()
            choice = data["choices"][0]
            message = choice["message"]
            calls = tuple(
                ProviderToolCall(
                    id=call.get("id", ""),
                    name=call["function"]["name"],
                    arguments=call["function"].get("arguments", "{}"),
                )
                for call in message.get("tool_calls", [])
            )
            usage = data.get("usage") or {}
            return ProviderChatResponse(
                content=message.get("content") or "",
                tool_calls=calls,
                finish_reason=choice.get("finish_reason"),
                prompt_tokens=usage.get("prompt_tokens", 0) or 0,
                completion_tokens=usage.get("completion_tokens", 0) or 0,
            )
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderResponseError("模型厂商返回了无法识别的数据") from exc

    async def stream_chat(
        self, *, messages: list[dict], tools: list[dict] | None = None
    ) -> AsyncIterator[ProviderStreamEvent]:
        settings = get_settings()
        timeout = httpx.Timeout(settings.ai_provider_timeout_seconds, connect=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.spec.base_url.rstrip('/')}/chat/completions",
                    headers=self._headers,
                    json=self._payload(messages=messages, tools=tools, stream=True),
                ) as response:
                    self._raise_for_response(response)
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError as exc:
                            raise ProviderResponseError("模型流式响应格式不正确") from exc
                        usage = data.get("usage") or {}
                        if usage:
                            yield ProviderStreamEvent(
                                kind="usage",
                                prompt_tokens=usage.get("prompt_tokens", 0) or 0,
                                completion_tokens=usage.get("completion_tokens", 0) or 0,
                            )
                        choices = data.get("choices") or []
                        if not choices:
                            continue
                        choice = choices[0]
                        delta = choice.get("delta") or {}
                        content = delta.get("content")
                        if content:
                            yield ProviderStreamEvent(kind="text", content=content)
                        for call in delta.get("tool_calls") or []:
                            function = call.get("function") or {}
                            yield ProviderStreamEvent(
                                kind="tool_call",
                                tool_call_index=call.get("index", 0),
                                tool_call_id=call.get("id") or "",
                                tool_name=function.get("name") or "",
                                tool_arguments=function.get("arguments") or "",
                            )
                        if choice.get("finish_reason"):
                            yield ProviderStreamEvent(
                                kind="finish", finish_reason=choice["finish_reason"]
                            )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ProviderUnavailableError("无法连接模型厂商，请稍后重试") from exc


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
    ProviderStreamEvent,
    ProviderToolCall,
