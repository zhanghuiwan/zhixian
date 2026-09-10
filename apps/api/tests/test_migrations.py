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
