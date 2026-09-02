from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import AIProviderConfig
from app.schemas.ai import AIProviderRead, AIProviderUpsert
from app.services.ai.catalog import ProviderSpec
from app.services.ai.credentials import CredentialCipher


class ProviderConfigNotFoundError(LookupError):
    pass


class ProviderConfigValidationError(ValueError):
    pass


def serialize_provider_config(config: AIProviderConfig) -> AIProviderRead:
    return AIProviderRead(
        provider=config.provider,
        display_name=config.display_name,
        base_url=config.base_url,
        model=config.model,
        masked_api_key=f"••••••••{config.api_key_last_four}",
        is_enabled=config.is_enabled,
        is_default=config.is_default,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


def get_provider_config(
    db: Session, *, user_id: int, provider: str
) -> AIProviderConfig | None:
    return db.scalar(
        select(AIProviderConfig).where(
            AIProviderConfig.user_id == user_id,
            AIProviderConfig.provider == provider,
        )
    )


def list_provider_configs(db: Session, *, user_id: int) -> list[AIProviderConfig]:
    return list(
        db.scalars(
            select(AIProviderConfig)
            .where(AIProviderConfig.user_id == user_id)
            .order_by(AIProviderConfig.is_default.desc(), AIProviderConfig.created_at)
        ).all()
    )


def _ensure_single_default(db: Session, *, user_id: int) -> None:
    enabled_configs = list(
        db.scalars(
            select(AIProviderConfig)
            .where(
                AIProviderConfig.user_id == user_id,
                AIProviderConfig.is_enabled.is_(True),
            )
            .order_by(AIProviderConfig.is_default.desc(), AIProviderConfig.id)
        ).all()
    )
    if not enabled_configs:
        return
    default_config = next((item for item in enabled_configs if item.is_default), enabled_configs[0])
    for item in enabled_configs:
        item.is_default = item.id == default_config.id


def upsert_provider_config(
    db: Session,
    *,
    user_id: int,
    spec: ProviderSpec,
    payload: AIProviderUpsert,
    cipher: CredentialCipher,
) -> AIProviderConfig:
    config = get_provider_config(db, user_id=user_id, provider=spec.key)
    if config is None and payload.api_key is None:
        raise ProviderConfigValidationError("首次配置时必须填写 API Key")
    if payload.is_default and not payload.is_enabled:
        raise ProviderConfigValidationError("停用的厂商不能设为默认模型")

    if config is None:
        api_key = payload.api_key or ""
        config = AIProviderConfig(
            user_id=user_id,
            provider=spec.key,
            display_name=spec.display_name,
            api_key_ciphertext=cipher.encrypt(
                api_key, user_id=user_id, provider=spec.key
            ),
            api_key_last_four=api_key[-4:],
            base_url=spec.base_url,
            model=payload.model,
            is_enabled=payload.is_enabled,
            is_default=payload.is_default,
        )
        db.add(config)
        db.flush()
    else:
        config.display_name = spec.display_name
        config.base_url = spec.base_url
        config.model = payload.model
        config.is_enabled = payload.is_enabled
        config.is_default = payload.is_default and payload.is_enabled
        if payload.api_key is not None:
            config.api_key_ciphertext = cipher.encrypt(
                payload.api_key, user_id=user_id, provider=spec.key
            )
            config.api_key_last_four = payload.api_key[-4:]

    if config.is_default:
        db.execute(
            update(AIProviderConfig)
            .where(
                AIProviderConfig.user_id == user_id,
                AIProviderConfig.id != config.id,
            )
            .values(is_default=False)
        )
    db.flush()
    _ensure_single_default(db, user_id=user_id)
    db.commit()
    db.refresh(config)
    return config


def delete_provider_config(db: Session, *, user_id: int, provider: str) -> None:
    config = get_provider_config(db, user_id=user_id, provider=provider)
    if config is None:
        raise ProviderConfigNotFoundError("模型厂商尚未配置")
    db.delete(config)
    db.flush()
    _ensure_single_default(db, user_id=user_id)
    db.commit()

