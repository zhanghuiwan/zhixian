from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    """Return naive UTC for cross-database DateTime compatibility."""
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(80))
    level: Mapped[str] = mapped_column(String(20), default="B1")
    daily_new_words: Mapped[int] = mapped_column(Integer, default=10)
    selected_wordbook_id: Mapped[int | None] = mapped_column(ForeignKey("wordbooks.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Word(Base):
    __tablename__ = "words"

    id: Mapped[int] = mapped_column(primary_key=True)
    term: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    phonetic: Mapped[str] = mapped_column(String(120), default="")
    part_of_speech: Mapped[str] = mapped_column(String(30), default="")
    translation: Mapped[str] = mapped_column(String(500))
    definitions: Mapped[list[dict]] = mapped_column(JSON, default=list)
    example: Mapped[str] = mapped_column(Text, default="")
    example_translation: Mapped[str] = mapped_column(Text, default="")


class Wordbook(Base):
    __tablename__ = "wordbooks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str] = mapped_column(String(500))
    level: Mapped[str] = mapped_column(String(30))
    cover_color: Mapped[str] = mapped_column(String(30), default="#345C4B")
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    words: Mapped[list[WordbookWord]] = relationship(
        back_populates="wordbook", cascade="all, delete-orphan", order_by="WordbookWord.position"
    )


class WordbookWord(Base):
    __tablename__ = "wordbook_words"
    __table_args__ = (UniqueConstraint("wordbook_id", "word_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    wordbook_id: Mapped[int] = mapped_column(ForeignKey("wordbooks.id", ondelete="CASCADE"))
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)

    wordbook: Mapped[Wordbook] = relationship(back_populates="words")
    word: Mapped[Word] = relationship()


class UserWordProgress(Base):
    __tablename__ = "user_word_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "word_id"),
        Index("ix_progress_due", "user_id", "next_review_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="learning")
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    mastery_score: Mapped[int] = mapped_column(Integer, default=0)
    next_review_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    word: Mapped[Word] = relationship()


class StudyReview(Base):
    __tablename__ = "study_reviews"
    __table_args__ = (Index("ix_reviews_user_time", "user_id", "reviewed_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id", ondelete="CASCADE"))
    rating: Mapped[str] = mapped_column(String(20))
    previous_interval: Mapped[int] = mapped_column(Integer, default=0)
    next_interval: Mapped[int] = mapped_column(Integer, default=0)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    word: Mapped[Word] = relationship()


class VocabularyItem(Base):
    __tablename__ = "vocabulary_items"
    __table_args__ = (UniqueConstraint("user_id", "word_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(30), default="manual")
    source_ref: Mapped[str | None] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    word: Mapped[Word] = relationship()


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(250))
    title_zh: Mapped[str] = mapped_column(String(250))
    summary: Mapped[str] = mapped_column(String(500))
    level: Mapped[str] = mapped_column(String(20))
    topic: Mapped[str] = mapped_column(String(50))
    read_minutes: Mapped[int] = mapped_column(Integer, default=5)
    cover_gradient: Mapped[str] = mapped_column(String(120), default="forest")
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sentences: Mapped[list[ArticleSentence]] = relationship(
        back_populates="article", cascade="all, delete-orphan", order_by="ArticleSentence.position"
    )


class ArticleSentence(Base):
    __tablename__ = "article_sentences"
    __table_args__ = (UniqueConstraint("article_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    translation: Mapped[str] = mapped_column(Text)

    article: Mapped[Article] = relationship(back_populates="sentences")


class SentenceBookmark(Base):
    __tablename__ = "sentence_bookmarks"
    __table_args__ = (UniqueConstraint("user_id", "sentence_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sentence_id: Mapped[int] = mapped_column(
        ForeignKey("article_sentences.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sentence: Mapped[ArticleSentence] = relationship()
