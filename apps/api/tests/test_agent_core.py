import json
from datetime import UTC, datetime

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import StudyReview, User, Word
from app.services.ai.providers import ProviderStreamEvent
from app.services.ai.tools import execute_tool
from app.services.learning_insights import get_review_plan, learning_history, local_today


def configure_minimax(client, auth_headers):
    response = client.put(
        "/api/v1/ai/providers/minimax",
        headers=auth_headers,
        json={
            "api_key": "minimax-test-secret",
            "model": "MiniMax-M3",
            "is_default": True,
        },
    )
    assert response.status_code == 200


def test_learning_history_plan_and_timezone_boundaries(client, auth_headers):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "learner@example.com"))
        word = db.scalar(select(Word).where(Word.term == "wander"))
        db.add(
            StudyReview(
                user_id=user.id,
                word_id=word.id,
                rating="hard",
                reviewed_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
        db.commit()
        today = local_today(user)
        history = learning_history(db, user=user, day=today)
        assert history["review_count"] == 1
        assert history["words"][0]["term"] == "wander"
        plan = get_review_plan(db, user=user, day=today)
        assert plan["is_forecast"] is False
        assert plan["timezone"] == "Asia/Shanghai"


def test_vocabulary_collection_tools_are_idempotent_and_user_scoped(
    client, auth_headers
):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "learner@example.com"))
        created = execute_tool(
            db,
            user=user,
            tool_name="create_vocabulary_collection",
            arguments={"name": "旅行"},
        )
        repeated = execute_tool(
            db,
            user=user,
            tool_name="create_vocabulary_collection",
            arguments={"name": "旅行"},
        )
        assert created.data["id"] == repeated.data["id"]
        added = execute_tool(
            db,
            user=user,
            tool_name="add_word_to_vocabulary_collection",
            arguments={"term": "wander", "collection_id": created.data["id"]},
        )
        repeated_add = execute_tool(
            db,
            user=user,
            tool_name="add_word_to_vocabulary_collection",
            arguments={"term": "wander", "collection_id": created.data["id"]},
        )
        assert added.data["added"] is True
        assert repeated_add.data["added"] is False
        removed = execute_tool(
            db,
            user=user,
            tool_name="remove_word_from_vocabulary_collection",
            arguments={
                "term": "wander",
                "collection_id": created.data["id"],
            },
        )
        assert removed.data["removed"] is True
        collections = execute_tool(
            db,
            user=user,
            tool_name="list_vocabulary_collections",
            arguments={},
        )
        travel = next(
            item
            for item in collections.data["collections"]
            if item["id"] == created.data["id"]
        )
        assert travel["word_count"] == 0

    second = client.post(
        "/api/v1/auth/register",
        json={
            "email": "collection-second@example.com",
            "password": "Strong123!",
            "nickname": "Second",
        },
    )
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    collections = client.get(
        "/api/v1/vocabulary/collections", headers=second_headers
    ).json()
    assert [item["name"] for item in collections] == ["默认生词本"]


def test_agent_stream_persists_conversation_and_messages(
    client, auth_headers, monkeypatch
):
    configure_minimax(client, auth_headers)

    class FakeProvider:
        async def stream_chat(self, *, messages, tools=None):
            assert tools
            yield ProviderStreamEvent(kind="text", content="你好，")
            yield ProviderStreamEvent(kind="text", content="今天也一起学习。")
            yield ProviderStreamEvent(
                kind="usage", prompt_tokens=12, completion_tokens=8
            )
            yield ProviderStreamEvent(kind="finish", finish_reason="stop")

    monkeypatch.setattr(
        "app.services.ai.agent.build_provider", lambda *_, **__: FakeProvider()
    )
    response = client.post(
        "/api/v1/ai/chat/stream",
        headers=auth_headers,
        json={"message": "你好", "provider": "minimax"},
    )
    assert response.status_code == 200
    assert "event: message.delta" in response.text
    assert "今天也一起学习" in response.text
    assert "event: usage.completed" in response.text

    conversations = client.get(
        "/api/v1/ai/conversations", headers=auth_headers
    ).json()
    assert len(conversations) == 1
    messages = client.get(
        f"/api/v1/ai/conversations/{conversations[0]['id']}/messages",
        headers=auth_headers,
    ).json()
    assert [item["role"] for item in messages] == ["user", "assistant"]
    assert messages[-1]["content"] == "你好，今天也一起学习。"
    assert "minimax-test-secret" not in response.text


def test_destructive_agent_tool_waits_for_exact_confirmation(
    client, auth_headers, monkeypatch
):
    configure_minimax(client, auth_headers)
    collection = client.post(
        "/api/v1/vocabulary/collections",
        headers=auth_headers,
        json={"name": "准备删除"},
    ).json()

    class DeleteProvider:
        async def stream_chat(self, *, messages, tools=None):
            arguments = json.dumps(
                {"collection_id": collection["id"]}, ensure_ascii=False
            )
            yield ProviderStreamEvent(
                kind="tool_call",
                tool_call_index=0,
                tool_call_id="delete-call-1",
                tool_name="delete_vocabulary_collection",
                tool_arguments=arguments,
            )
            yield ProviderStreamEvent(kind="finish", finish_reason="tool_calls")

    monkeypatch.setattr(
        "app.services.ai.agent.build_provider", lambda *_, **__: DeleteProvider()
    )
    response = client.post(
        "/api/v1/ai/chat/stream",
        headers=auth_headers,
        json={"message": "删除准备删除生词本", "provider": "minimax"},
    )
    assert "event: confirmation.required" in response.text
    assert any(
        item["id"] == collection["id"]
        for item in client.get(
            "/api/v1/vocabulary/collections", headers=auth_headers
        ).json()
    )
    data_line = next(
        line for line in response.text.splitlines() if '"tool_run_id"' in line
    )
    tool_run_id = json.loads(data_line.removeprefix("data: "))["tool_run_id"]
    conversation_id = json.loads(
        next(
            line
            for line in response.text.splitlines()
            if '"conversation_id"' in line
        ).removeprefix("data: ")
    )["conversation_id"]
    runs = client.get(
        f"/api/v1/ai/conversations/{conversation_id}/tool-runs",
        headers=auth_headers,
    )
    assert runs.status_code == 200
    assert runs.json()[0]["status"] == "pending_confirmation"
    confirmed = client.post(
        f"/api/v1/ai/tool-runs/{tool_run_id}/confirm",
        headers=auth_headers,
        json={"confirmed": True},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "succeeded"
    assert all(
        item["id"] != collection["id"]
        for item in client.get(
            "/api/v1/vocabulary/collections", headers=auth_headers
        ).json()
    )


def test_generated_examples_article_draft_and_explicit_memory(
    client, auth_headers
):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "learner@example.com"))
        examples = execute_tool(
            db,
            user=user,
            tool_name="present_generated_examples",
            arguments={
                "term": "wander",
                "examples": [
                    {
                        "sentence": "We wander through the quiet town.",
                        "translation": "我们漫步穿过安静的小镇。",
                    }
                ],
            },
        )
        assert examples.data["examples"][0]["sentence"].startswith("We wander")
        article = execute_tool(
            db,
            user=user,
            tool_name="generate_article_draft",
            arguments={
                "topic": "旅行",
                "level": "B1",
                "title": "A Quiet Journey",
                "title_zh": "一段安静的旅程",
                "summary": "A short graded story.",
                "target_words": ["wander", "tranquil"],
                "sentences": [
                    {
                        "text": "We wander beside a tranquil lake.",
                        "translation": "我们在宁静的湖边漫步。",
                    },
                    {
                        "text": "The journey helps us notice small things.",
                        "translation": "这段旅程让我们留意细小的事物。",
                    },
                ],
            },
        )
        memory = execute_tool(
            db,
            user=user,
            tool_name="remember_learning_preference",
            arguments={"key": "preferred_topics", "value": "旅行与自然"},
        )
        article_id = article.data["article_id"]
        assert article.data["is_draft"] is True
        assert memory.data["saved"] is True

    detail = client.get(
        f"/api/v1/articles/{article_id}", headers=auth_headers
    )
    assert detail.status_code == 200
    assert detail.json()["title"] == "A Quiet Journey"

    second = client.post(
        "/api/v1/auth/register",
        json={
            "email": "draft-second@example.com",
            "password": "Strong123!",
            "nickname": "Second",
        },
    )
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    assert (
        client.get(
            f"/api/v1/articles/{article_id}", headers=second_headers
        ).status_code
        == 404
    )
