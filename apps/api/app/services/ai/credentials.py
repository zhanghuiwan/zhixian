import json

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class CredentialConfigurationError(RuntimeError):
    pass


class CredentialDecryptionError(RuntimeError):
    pass


class CredentialCipher:
    def __init__(self, encryption_key: str):
        try:
            self._fernet = Fernet(encryption_key.strip().encode("ascii"))
        except (ValueError, UnicodeEncodeError) as exc:
            raise CredentialConfigurationError(
                "AI_CREDENTIAL_ENCRYPTION_KEY 不是有效的 Fernet 密钥"
            ) from exc

    @classmethod
    def from_settings(cls) -> "CredentialCipher":
        encryption_key = get_settings().ai_credential_encryption_key
        if not encryption_key or not encryption_key.strip():
            raise CredentialConfigurationError(
                "服务器尚未配置 AI_CREDENTIAL_ENCRYPTION_KEY"
            )
        return cls(encryption_key)

    def encrypt(self, api_key: str, *, user_id: int, provider: str) -> str:
        payload = json.dumps(
            {
                "version": 1,
                "user_id": user_id,
                "provider": provider,
                "api_key": api_key,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return self._fernet.encrypt(payload.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str, *, user_id: int, provider: str) -> str:
        try:
            raw = self._fernet.decrypt(ciphertext.encode("ascii"))
            payload = json.loads(raw.decode("utf-8"))
        except (InvalidToken, UnicodeError, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise CredentialDecryptionError("无法解密已保存的 API Key") from exc

        if (
            payload.get("version") != 1
            or payload.get("user_id") != user_id
            or payload.get("provider") != provider
            or not isinstance(payload.get("api_key"), str)
        ):
            raise CredentialDecryptionError("API Key 密文与当前用户或厂商不匹配")
        return payload["api_key"]

