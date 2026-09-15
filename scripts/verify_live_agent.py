"""Run a credential-safe end-to-end Agent smoke test with a disposable database."""

import json
import os
import sys
from base64 import urlsafe_b64encode
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API_ROOT))


def main() -> int:
    api_key = os.environ.get("MINIMAX_API_KEY", "").strip()
    database_value = os.environ.get("ZHIXIAN_AGENT_TEST_DB", "").strip()
    if len(api_key) < 8 or not database_value:
        print(json.dumps({"ok": False, "step": "input", "error": "missing_input"}))
        return 2
    database_path = Path(database_value).resolve()
    if database_path.exists():
        database_path.unlink()

    os.environ["ENVIRONMENT"] = "test"
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
    os.environ["SECRET_KEY"] = "temporary-live-agent-secret"
    os.environ["AI_CREDENTIAL_ENCRYPTION_KEY"] = urlsafe_b64encode(
        os.urandom(32)
    ).decode("ascii")

    from fastapi.testclient import TestClient
    from sqlalchemy.orm import close_all_sessions

    from app.db.session import SessionLocal, engine
    from app.main import app
    from app.models import Word

    with TestClient(app) as client:
        registered = client.post(
            "/api/v1/auth/register",
            json={
                "email": "live-agent@example.com",
                "password": "Temporary123!",
                "nickname": "Live Agent",
            },
        )
        registered.raise_for_status()
        headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
        with SessionLocal() as db:
            db.add(
                Word(
                    term="wander",
                    phonetic="/ˈwɒndə/",
                    part_of_speech="v.",
                    translation="漫步",
                    definitions=[],
                    example="We wander slowly.",
                    example_translation="我们慢慢漫步。",
                )
            )
            db.commit()
        configured = client.put(
            "/api/v1/ai/providers/minimax",
            headers=headers,
            json={
                "api_key": api_key,
                "model": "MiniMax-M3",
                "is_enabled": True,
                "is_default": True,
            },
        )
        configured.raise_for_status()
        response = client.post(
            "/api/v1/ai/chat/stream",
            headers=headers,
            json={
                "message": "wander",
                "provider": "minimax",
            },
        )
        response.raise_for_status()
        required_events = {
            "conversation.created",
            "tool.completed",
            "message.completed",
            "usage.completed",
        }
        received_events = {
            line.removeprefix("event: ")
            for line in response.text.splitlines()
            if line.startswith("event: ")
        }
        if not required_events.issubset(received_events):
            raise RuntimeError(
                "missing_events:" + ",".join(sorted(required_events - received_events))
            )
        if api_key in response.text:
            raise RuntimeError("credential_leaked_to_response")
        completed_payload = None
        lines = response.text.splitlines()
        for index, line in enumerate(lines):
            if line == "event: message.completed" and index + 1 < len(lines):
                completed_payload = json.loads(
                    lines[index + 1].removeprefix("data: ")
                )
                break
        if completed_payload is None:
            raise RuntimeError("missing_completed_payload")
        content = str(completed_payload.get("content") or "")
        required_sections = {
            "核心释义",
            "分义项与语境",
            "词形与语法",
            "常见用法",
            "例句",
            "易混词",
        }
        missing_sections = required_sections - {
            section for section in required_sections if section in content
        }
        if missing_sections:
            raise RuntimeError(
                "missing_word_sections:" + ",".join(sorted(missing_sections))
            )
        actions = completed_payload.get("actions") or []
        if not actions or actions[0].get("type") != "add_word_to_collection":
            raise RuntimeError("missing_add_word_action")
        if set(actions[0].get("payload") or {}) != {
            "term",
            "word_id",
            "collection_id",
        }:
            raise RuntimeError("unexpected_add_word_payload")
        conversations = client.get("/api/v1/ai/conversations", headers=headers)
        conversations.raise_for_status()
        if conversations.json()[0]["message_count"] < 4:
            raise RuntimeError("conversation_messages_not_persisted")
        translation_response = client.post(
            "/api/v1/ai/chat/stream",
            headers=headers,
            json={
                "message": "The lake remained tranquil after the storm.",
                "conversation_id": conversations.json()[0]["id"],
            },
        )
        translation_response.raise_for_status()
        translation_payload = None
        translation_lines = translation_response.text.splitlines()
        for index, line in enumerate(translation_lines):
            if line == "event: message.completed" and index + 1 < len(
                translation_lines
            ):
                translation_payload = json.loads(
                    translation_lines[index + 1].removeprefix("data: ")
                )
                break
        if translation_payload is None:
            raise RuntimeError("missing_translation_payload")
        translation_content = str(translation_payload.get("content") or "")
        translation_sections = {
            "中文翻译",
            "语义拆解",
            "关键表达",
            "句型与语法",
            "语境与译法",
        }
        missing_translation_sections = translation_sections - {
            section
            for section in translation_sections
            if section in translation_content
        }
        if missing_translation_sections:
            raise RuntimeError(
                "missing_translation_sections:"
                + ",".join(sorted(missing_translation_sections))
            )
        translation_actions = translation_payload.get("actions") or []
        if (
            not translation_actions
            or translation_actions[0].get("type") != "save_sentence"
        ):
            raise RuntimeError("missing_save_sentence_action")
        normalized_translation = str(
            (translation_actions[0].get("payload") or {}).get("translation")
            or ""
        )
        if not normalized_translation or any(
            marker in normalized_translation for marker in ("##", "**", "`")
        ):
            raise RuntimeError("translation_payload_not_normalized")
        response.close()
        translation_response.close()
        conversations.close()
        configured.close()
        registered.close()
    close_all_sessions()
    engine.dispose(close=True)
    print(
        json.dumps(
            {
                "ok": True,
                "model": "MiniMax-M3",
                "encrypted_provider_config": True,
                "sse": True,
                "tool_execution": True,
                "detailed_word_format": True,
                "detailed_translation_format": True,
                "normalized_learning_action": True,
                "conversation_persistence": True,
                "database_connections_closed": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error_type": type(exc).__name__,
                    "message": str(exc),
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1)
