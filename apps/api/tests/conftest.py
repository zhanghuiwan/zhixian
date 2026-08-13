import os

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///./test_zhixian.db"
os.environ["SECRET_KEY"] = "test-secret"

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import Article, ArticleSentence, Word, Wordbook, WordbookWord


@pytest.fixture(autouse=True)
def fresh_database():
    get_settings.cache_clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        words = [
            Word(term="tranquil", phonetic="/ˈtræŋkwɪl/", part_of_speech="adj.", translation="宁静的", definitions=[], example="A tranquil lake.", example_translation="宁静的湖。"),
            Word(term="wander", phonetic="/ˈwɒndə/", part_of_speech="v.", translation="漫步", definitions=[], example="We wander slowly.", example_translation="我们慢慢漫步。"),
        ]
        db.add_all(words)
        db.flush()
        book = Wordbook(name="测试词书", description="测试", level="A2", cover_color="#000")
        db.add(book)
        db.flush()
        for position, word in enumerate(words, 1):
            db.add(WordbookWord(wordbook_id=book.id, word_id=word.id, position=position))
        article = Article(title="A Quiet Walk", title_zh="安静散步", summary="测试文章", level="A2", topic="生活", read_minutes=2)
        db.add(article)
        db.flush()
        db.add(ArticleSentence(article_id=article.id, position=1, text="We wander beside a tranquil lake.", translation="我们在宁静的湖边漫步。"))
        db.commit()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers(client):
    response = client.post("/api/v1/auth/register", json={"email": "learner@example.com", "password": "Strong123!", "nickname": "Learner"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

