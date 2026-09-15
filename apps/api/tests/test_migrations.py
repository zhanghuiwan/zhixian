import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text


def run_alembic(database_url: str, revision: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", revision],
        cwd=Path(__file__).parents[1],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def test_0006_migrates_existing_words_and_creates_ownership_table(tmp_path):
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    run_alembic(database_url, "0005")

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO words (term, translation) "
                "VALUES (:term, :translation)"
            ),
            {"term": "legacyword", "translation": "旧词"},
        )

    run_alembic(database_url, "head")
    with engine.connect() as connection:
        source = connection.scalar(
            text(
                "SELECT dictionary_source FROM words "
                "WHERE term = :term"
            ),
            {"term": "legacyword"},
        )
    assert source == "system"
    assert "user_custom_words" in inspect(engine).get_table_names()


def test_0007_preserves_existing_conversations_as_manual(tmp_path):
    database_path = tmp_path / "daily-conversation-migration.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    run_alembic(database_url, "0006")

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (email, password_hash, nickname) "
                "VALUES (:email, :password_hash, :nickname)"
            ),
            {
                "email": "migration@example.com",
                "password_hash": "not-a-real-hash",
                "nickname": "Migration",
            },
        )
        user_id = connection.scalar(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": "migration@example.com"},
        )
        connection.execute(
            text(
                "INSERT INTO ai_conversations "
                "(user_id, title, provider, model) "
                "VALUES (:user_id, :title, :provider, :model)"
            ),
            {
                "user_id": user_id,
                "title": "旧对话",
                "provider": "minimax",
                "model": "MiniMax-M3",
            },
        )

    run_alembic(database_url, "head")
    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT conversation_type, local_date "
                "FROM ai_conversations WHERE title = :title"
            ),
            {"title": "旧对话"},
        ).one()
    assert row.conversation_type == "manual"
    assert row.local_date is None
