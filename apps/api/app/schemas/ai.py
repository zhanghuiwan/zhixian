from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class AIConversationCreate(BaseModel):
    title: str = Field(default="新对话", min_length=1, max_length=120)
    provider: ProviderName | None = None


class AIConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    archived: bool | None = None


class AIConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    provider: ProviderName
    model: str
    conversation_type: Literal["daily", "manual"] = "manual"
    local_date: date | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    message_count: int = 0


AIActionType = Literal[
    "add_word_to_collection",
    "request_custom_word",
    "save_sentence",
    "import_article",
    "navigate",
]


class AIResponseAction(BaseModel):
    id: str = Field(min_length=1, max_length=180)
    type: AIActionType
    label: str = Field(min_length=1, max_length=80)
    payload: dict = Field(default_factory=dict)


class AIMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    content: str
    tool_call_id: str | None
    tool_calls: list[dict]
    prompt_tokens: int
    completion_tokens: int
    created_at: datetime
    actions: list[AIResponseAction] = Field(default_factory=list)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = Field(default=None, ge=1)
    provider: ProviderName | None = None

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("消息不能为空")
        return normalized


class AIToolConfirmation(BaseModel):
    confirmed: bool


class AIToolConfirmationResult(BaseModel):
    id: int
    status: str
    tool_name: str
    result: dict | None
    result_summary: str


class AIToolRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tool_name: str
    status: str
    arguments: dict
    result: dict | None
    result_summary: str
    requires_confirmation: bool
    created_at: datetime
