from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "知闲 API"
    environment: str = "development"
    database_url: str = "sqlite:///./zhixian.db"
    secret_key: str = "local-development-secret-change-before-deploy"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: list[str] | str = ["http://localhost:3000"]
    create_demo_user: bool = False
    ai_credential_encryption_key: str | None = None
    ai_provider_timeout_seconds: float = 20.0
    ai_max_agent_steps: int = 6
    ai_max_tool_calls: int = 10
    ai_max_output_tokens: int = 2048
    ai_max_context_messages: int = 24

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
