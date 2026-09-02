from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.ai import (
    AIProviderCatalogItem,
    AIProviderConnectionRead,
    AIProviderRead,
    AIProviderUpsert,
    ProviderName,
)
from app.services.ai.catalog import PROVIDER_SPECS, get_provider_spec
from app.services.ai.credentials import (
    CredentialCipher,
    CredentialConfigurationError,
    CredentialDecryptionError,
)
from app.services.ai.provider_configs import (
    ProviderConfigNotFoundError,
    ProviderConfigValidationError,
    delete_provider_config,
    get_provider_config,
    list_provider_configs,
    serialize_provider_config,
    upsert_provider_config,
)
from app.services.ai.providers import (
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderResponseError,
    ProviderUnavailableError,
    build_provider,
)

router = APIRouter(prefix="/ai/providers", tags=["AI 模型设置"])


def _get_spec(provider: str):
    spec = get_provider_spec(provider)
    if spec is None:
        raise HTTPException(status_code=404, detail="不支持的模型厂商")
    return spec


def _get_cipher() -> CredentialCipher:
    try:
        return CredentialCipher.from_settings()
    except CredentialConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/catalog", response_model=list[AIProviderCatalogItem])
def provider_catalog(_: User = Depends(get_current_user)):
    return [
        AIProviderCatalogItem(
            provider=spec.key,
            display_name=spec.display_name,
            base_url=spec.base_url,
            default_model=spec.default_model,
            models=list(spec.models),
            supports_tools=spec.supports_tools,
            supports_streaming=spec.supports_streaming,
        )
        for spec in PROVIDER_SPECS.values()
    ]


@router.get("", response_model=list[AIProviderRead])
def providers(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return [
        serialize_provider_config(config)
        for config in list_provider_configs(db, user_id=current_user.id)
    ]


@router.put("/{provider}", response_model=AIProviderRead)
def save_provider(
    provider: ProviderName,
    payload: AIProviderUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    spec = _get_spec(provider)
    try:
        config = upsert_provider_config(
            db,
            user_id=current_user.id,
            spec=spec,
            payload=payload,
            cipher=_get_cipher(),
        )
    except ProviderConfigValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_provider_config(config)


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
def remove_provider(
    provider: ProviderName,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        delete_provider_config(db, user_id=current_user.id, provider=provider)
    except ProviderConfigNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{provider}/test", response_model=AIProviderConnectionRead)
async def test_provider(
    provider: ProviderName,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = get_provider_config(db, user_id=current_user.id, provider=provider)
    if config is None:
        raise HTTPException(status_code=404, detail="请先保存该模型厂商的配置")
    try:
        api_key = _get_cipher().decrypt(
            config.api_key_ciphertext,
            user_id=current_user.id,
            provider=config.provider,
        )
        result = await build_provider(
            config.provider, api_key=api_key, model=config.model
        ).test_connection()
    except CredentialDecryptionError as exc:
        raise HTTPException(status_code=409, detail="API Key 无法解密，请重新填写并保存") from exc
    except ProviderAuthenticationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderResponseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AIProviderConnectionRead(
        provider=result.provider,
        model=result.model,
        latency_ms=result.latency_ms,
    )
