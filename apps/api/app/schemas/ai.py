from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ProviderName = Literal["deepseek", "minimax"]


class AIProviderCatalogItem(BaseModel):
    provider: ProviderName
    display_name: str
    base_url: str
    default_model: str
    models: list[str]
    supports_tools: bool
    supports_streaming: bool


class AIProviderUpsert(BaseModel):
    api_key: str | None = Field(default=None, max_length=512)
    model: str = Field(min_length=1, max_length=120)
    is_enabled: bool = True
    is_default: bool = False

    @field_validator("api_key")
    @classmethod
    def normalize_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        if len(normalized) < 8:
            raise ValueError("API Key 长度不正确")
        return normalized

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or any(ord(character) < 32 for character in normalized):
            raise ValueError("模型名称不正确")
        return normalized


class AIProviderRead(BaseModel):
    provider: ProviderName
    display_name: str
    base_url: str
    model: str
    masked_api_key: str
    is_enabled: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime


class AIProviderConnectionRead(BaseModel):
    status: Literal["ok"] = "ok"
    provider: ProviderName
    model: str
    latency_ms: int

