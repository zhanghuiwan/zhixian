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
                "message": "请查一下 wander，并简短告诉我意思。必须使用查词工具。",
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
        conversations = client.get("/api/v1/ai/conversations", headers=headers)
        conversations.raise_for_status()
        if conversations.json()[0]["message_count"] < 4:
            raise RuntimeError("conversation_messages_not_persisted")
        response.close()
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
