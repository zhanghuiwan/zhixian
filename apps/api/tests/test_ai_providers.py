import asyncio

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import AIProviderConfig, User
from app.services.ai.credentials import CredentialCipher, CredentialDecryptionError
from app.services.ai.providers import (
    ProviderAuthenticationError,
    ProviderConnectionResult,
    ProviderResponseError,
    build_provider,
)


def test_provider_config_is_encrypted_masked_and_user_isolated(client, auth_headers):
    raw_api_key = "sk-test-deepseek-secret-1234"
    saved = client.put(
        "/api/v1/ai/providers/deepseek",
        headers=auth_headers,
        json={
            "api_key": raw_api_key,
            "model": "deepseek-v4-flash",
            "is_enabled": True,
            "is_default": False,
        },
    )
    assert saved.status_code == 200
    assert saved.json()["masked_api_key"] == "••••••••1234"
    assert saved.json()["is_default"] is True
    assert raw_api_key not in saved.text

    configs = client.get("/api/v1/ai/providers", headers=auth_headers)
    assert configs.status_code == 200
    assert raw_api_key not in configs.text
    assert configs.json()[0]["provider"] == "deepseek"

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "learner@example.com"))
        config = db.scalar(
            select(AIProviderConfig).where(AIProviderConfig.user_id == user.id)
        )
        assert raw_api_key not in config.api_key_ciphertext
        assert (
            CredentialCipher.from_settings().decrypt(
                config.api_key_ciphertext,
                user_id=user.id,
                provider="deepseek",
            )
            == raw_api_key
        )

    second = client.post(
        "/api/v1/auth/register",
        json={
            "email": "ai-second@example.com",
            "password": "Strong123!",
            "nickname": "Second",
        },
    )
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    assert client.get("/api/v1/ai/providers", headers=second_headers).json() == []


def test_default_provider_switch_update_without_key_and_delete(client, auth_headers):
    deepseek = client.put(
        "/api/v1/ai/providers/deepseek",
        headers=auth_headers,
        json={"api_key": "sk-deepseek-1234", "model": "deepseek-v4-flash"},
    )
    assert deepseek.status_code == 200
    assert deepseek.json()["is_default"] is True

    minimax = client.put(
        "/api/v1/ai/providers/minimax",
        headers=auth_headers,
        json={
            "api_key": "minimax-secret-5678",
            "model": "MiniMax-M2.7",
            "is_default": True,
        },
    )
    assert minimax.status_code == 200
    assert minimax.json()["is_default"] is True

    configs = client.get("/api/v1/ai/providers", headers=auth_headers).json()
    assert [item["provider"] for item in configs] == ["minimax", "deepseek"]
    assert configs[1]["is_default"] is False

    updated = client.put(
        "/api/v1/ai/providers/minimax",
        headers=auth_headers,
        json={
            "model": "MiniMax-M2.7-highspeed",
            "is_enabled": True,
            "is_default": True,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["masked_api_key"] == "••••••••5678"
    assert updated.json()["model"] == "MiniMax-M2.7-highspeed"

    removed = client.delete("/api/v1/ai/providers/minimax", headers=auth_headers)
    assert removed.status_code == 204
    remaining = client.get("/api/v1/ai/providers", headers=auth_headers).json()
    assert len(remaining) == 1
    assert remaining[0]["provider"] == "deepseek"
    assert remaining[0]["is_default"] is True


def test_first_provider_requires_key_and_disabled_provider_cannot_be_default(
    client, auth_headers
):
    missing_key = client.put(
        "/api/v1/ai/providers/deepseek",
        headers=auth_headers,
        json={"model": "deepseek-v4-flash"},
    )
    assert missing_key.status_code == 400

    invalid_default = client.put(
        "/api/v1/ai/providers/deepseek",
        headers=auth_headers,
        json={
            "api_key": "sk-deepseek-1234",
            "model": "deepseek-v4-flash",
            "is_enabled": False,
            "is_default": True,
        },
    )
    assert invalid_default.status_code == 400


def test_provider_connection_uses_decrypted_key(client, auth_headers, monkeypatch):
    raw_api_key = "sk-test-connection-9012"
    client.put(
        "/api/v1/ai/providers/deepseek",
        headers=auth_headers,
        json={"api_key": raw_api_key, "model": "deepseek-v4-flash"},
    )
    received: dict[str, str] = {}

    class FakeProvider:
        async def test_connection(self):
            return ProviderConnectionResult(
                provider="deepseek", model="deepseek-v4-flash", latency_ms=12
            )

    def fake_build_provider(provider, *, api_key, model):
        received.update(provider=provider, api_key=api_key, model=model)
        return FakeProvider()

    monkeypatch.setattr("app.api.routes.ai.build_provider", fake_build_provider)
    response = client.post("/api/v1/ai/providers/deepseek/test", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "provider": "deepseek",
        "model": "deepseek-v4-flash",
        "latency_ms": 12,
    }
    assert received == {
        "provider": "deepseek",
        "api_key": raw_api_key,
        "model": "deepseek-v4-flash",
    }


def test_ciphertext_is_bound_to_user_and_provider():
    cipher = CredentialCipher.from_settings()
    ciphertext = cipher.encrypt("sk-bound-secret", user_id=1, provider="deepseek")
    assert cipher.decrypt(ciphertext, user_id=1, provider="deepseek") == "sk-bound-secret"

    for user_id, provider in [(2, "deepseek"), (1, "minimax")]:
        try:
            cipher.decrypt(ciphertext, user_id=user_id, provider=provider)
        except CredentialDecryptionError:
            pass
        else:
            raise AssertionError("ciphertext context mismatch should be rejected")


def test_provider_adapters_validate_model_list_without_sending_content(monkeypatch):
    calls: list[dict] = []

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            calls.append({"client": kwargs})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def get(self, url, *, headers):
            calls.append({"url": url, "headers": headers})
            model = "MiniMax-M2.7" if "minimaxi" in url else "deepseek-v4-flash"
            return httpx.Response(200, json={"object": "list", "data": [{"id": model}]})

    monkeypatch.setattr(
        "app.services.ai.providers.openai_compatible.httpx.AsyncClient", FakeAsyncClient
    )
    deepseek = asyncio.run(
        build_provider(
            "deepseek", api_key="sk-deepseek-secret", model="deepseek-v4-flash"
        ).test_connection()
    )
    minimax = asyncio.run(
        build_provider(
            "minimax", api_key="minimax-secret", model="MiniMax-M2.7"
        ).test_connection()
    )
    assert deepseek.provider == "deepseek"
    assert minimax.provider == "minimax"
    urls = [call["url"] for call in calls if "url" in call]
    assert urls == [
        "https://api.deepseek.com/models",
        "https://api.minimaxi.com/v1/models",
    ]
    assert all("secret" not in call.get("url", "") for call in calls)


def test_provider_adapter_maps_authentication_and_model_access_errors(monkeypatch):
    class UnauthorizedClient:
        def __init__(self, **_):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def get(self, *_args, **_kwargs):
            return httpx.Response(401, json={"error": "unauthorized"})

    monkeypatch.setattr(
        "app.services.ai.providers.openai_compatible.httpx.AsyncClient", UnauthorizedClient
    )
    provider = build_provider(
        "deepseek", api_key="sk-invalid-key", model="deepseek-v4-flash"
    )
    try:
        asyncio.run(provider.test_connection())
    except ProviderAuthenticationError:
        pass
    else:
        raise AssertionError("401 should be mapped to ProviderAuthenticationError")

    class MissingModelClient(UnauthorizedClient):
        async def get(self, *_args, **_kwargs):
            return httpx.Response(200, json={"object": "list", "data": []})

    monkeypatch.setattr(
        "app.services.ai.providers.openai_compatible.httpx.AsyncClient", MissingModelClient
    )
    try:
        asyncio.run(provider.test_connection())
    except ProviderResponseError:
        pass
    else:
        raise AssertionError("missing model should be mapped to ProviderResponseError")


def test_provider_stream_normalizes_text_tool_chunks_and_usage(monkeypatch):
    lines = [
        'data: {"choices":[{"delta":{"content":"你"}}]}',
        'data: {"choices":[{"delta":{"content":"好"}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"lookup_","arguments":"{\\\"term\\\":"}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"word","arguments":"\\\"wander\\\"}"}}]},"finish_reason":"tool_calls"}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":4}}',
        "data: [DONE]",
    ]
    captured: dict = {}

    class FakeStreamResponse:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def aiter_lines(self):
            for line in lines:
                yield line

    class FakeClient:
        def __init__(self, **_):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        def stream(self, method, url, *, headers, json):
            captured.update(method=method, url=url, headers=headers, payload=json)
            return FakeStreamResponse()

    monkeypatch.setattr(
        "app.services.ai.providers.openai_compatible.httpx.AsyncClient", FakeClient
    )
    provider = build_provider(
        "minimax", api_key="minimax-secret", model="MiniMax-M3"
    )

    async def collect():
        return [
            event
            async for event in provider.stream_chat(
                messages=[{"role": "user", "content": "查词"}],
                tools=[{"type": "function", "function": {"name": "lookup_word"}}],
            )
        ]

    events = asyncio.run(collect())
    assert "".join(item.content for item in events if item.kind == "text") == "你好"
    assert "".join(item.tool_name for item in events if item.kind == "tool_call") == "lookup_word"
    assert "".join(
        item.tool_arguments for item in events if item.kind == "tool_call"
    ) == '{"term":"wander"}'
    usage = next(item for item in events if item.kind == "usage")
    assert (usage.prompt_tokens, usage.completion_tokens) == (9, 4)
    assert captured["payload"]["stream"] is True
    assert captured["payload"]["reasoning_split"] is True
    assert "secret" not in captured["url"]
