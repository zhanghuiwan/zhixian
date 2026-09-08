from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
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
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Shanghai")
    selected_wordbook_id: Mapped[int | None] = mapped_column(ForeignKey("wordbooks.id"))
    selected_collection_id: Mapped[int | None] = mapped_column(Integer)
    example_content_version: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AIProviderConfig(Base):
    __tablename__ = "ai_provider_configs"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_ai_provider_user_provider"),
        Index("ix_ai_provider_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(40))
    display_name: Mapped[str] = mapped_column(String(80))
    api_key_ciphertext: Mapped[str] = mapped_column(Text)
    api_key_last_four: Mapped[str] = mapped_column(String(8))
    base_url: Mapped[str] = mapped_column(String(500))
    model: Mapped[str] = mapped_column(String(120))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class AIConversation(Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (Index("ix_ai_conversations_user_updated", "user_id", "updated_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120), default="新对话")
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)

    messages: Mapped[list[AIMessage]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="AIMessage.id"
    )


class AIMessage(Base):
    __tablename__ = "ai_messages"
    __table_args__ = (Index("ix_ai_messages_conversation_created", "conversation_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text, default="")
    tool_call_id: Mapped[str | None] = mapped_column(String(160))
    tool_calls: Mapped[list[dict]] = mapped_column(JSON, default=list)
    provider_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    conversation: Mapped[AIConversation] = relationship(back_populates="messages")


class AIToolRun(Base):
    __tablename__ = "ai_tool_runs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_ai_tool_runs_idempotency"),
        Index("ix_ai_tool_runs_conversation", "conversation_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE")
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    tool_call_id: Mapped[str] = mapped_column(String(160))
    tool_name: Mapped[str] = mapped_column(String(100))
    arguments: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="running")
    result: Mapped[dict | None] = mapped_column(JSON)
    result_summary: Mapped[str] = mapped_column(String(500), default="")
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    idempotency_key: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)


class AIUserMemory(Base):
    __tablename__ = "ai_user_memories"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_ai_user_memory_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(80))
    value: Mapped[str] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(40), default="explicit")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


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
    slug: Mapped[str | None] = mapped_column(String(120), unique=True, index=True)
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


class WordlistSource(Base):
    __tablename__ = "wordlist_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_key: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    repository_url: Mapped[str] = mapped_column(String(500))
    repository_commit: Mapped[str] = mapped_column(String(64))
    source_file: Mapped[str] = mapped_column(String(500))
    source_sha256: Mapped[str] = mapped_column(String(64))
    declared_count: Mapped[int] = mapped_column(Integer)
    parsed_count: Mapped[int] = mapped_column(Integer)
    license_status: Mapped[str] = mapped_column(String(40))
    transform_version: Mapped[int] = mapped_column(Integer, default=1)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    entries: Mapped[list[WordlistSourceEntry]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class WordlistSourceEntry(Base):
    __tablename__ = "wordlist_source_entries"
    __table_args__ = (
        UniqueConstraint("source_id", "word_id", name="uq_wordlist_source_word"),
        Index("ix_wordlist_source_entries_word_id", "word_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("wordlist_sources.id", ondelete="CASCADE"), index=True
    )
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id", ondelete="CASCADE"))
    source_position: Mapped[int] = mapped_column(Integer)

    source: Mapped[WordlistSource] = relationship(back_populates="entries")
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
    __table_args__ = (
        Index("ix_reviews_user_time", "user_id", "reviewed_at"),
        UniqueConstraint("user_id", "request_id", name="uq_review_request"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id", ondelete="CASCADE"))
    rating: Mapped[str] = mapped_column(String(20))
    previous_interval: Mapped[int] = mapped_column(Integer, default=0)
    next_interval: Mapped[int] = mapped_column(Integer, default=0)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    source_kind: Mapped[str] = mapped_column(String(20), default="legacy")
    source_id: Mapped[int | None] = mapped_column(Integer)
    source_name: Mapped[str] = mapped_column(String(120), default="来源未记录")
    mode: Mapped[str] = mapped_column(String(20), default="legacy")
    request_id: Mapped[str | None] = mapped_column(String(64))
    result_snapshot: Mapped[dict | None] = mapped_column(JSON)

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


class VocabularyCollection(Base):
    __tablename__ = "vocabulary_collections"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_vocabulary_collection_user_name"),
        Index("ix_vocabulary_collections_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(300), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class VocabularyCollectionItem(Base):
    __tablename__ = "vocabulary_collection_items"
    __table_args__ = (
        UniqueConstraint(
            "collection_id", "vocabulary_item_id", name="uq_vocabulary_collection_item"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    collection_id: Mapped[int] = mapped_column(
        ForeignKey("vocabulary_collections.id", ondelete="CASCADE"), index=True
    )
    vocabulary_item_id: Mapped[int] = mapped_column(
        ForeignKey("vocabulary_items.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DailyStudyPlan(Base):
    __tablename__ = "daily_study_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "plan_date", name="uq_daily_study_plan_user_date"),
        Index("ix_daily_study_plan_user_date", "user_id", "plan_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    plan_date: Mapped[date] = mapped_column(Date)
    timezone: Mapped[str] = mapped_column(String(64))
    algorithm_version: Mapped[str] = mapped_column(String(30), default="v1")
    is_forecast: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    items: Mapped[list[DailyStudyPlanItem]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="DailyStudyPlanItem.position",
    )


class DailyStudyPlanItem(Base):
    __tablename__ = "daily_study_plan_items"
    __table_args__ = (
        UniqueConstraint("plan_id", "word_id", "item_type", name="uq_daily_plan_word_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("daily_study_plans.id", ondelete="CASCADE"), index=True
    )
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id", ondelete="CASCADE"))
    item_type: Mapped[str] = mapped_column(String(20))
    position: Mapped[int] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    plan: Mapped[DailyStudyPlan] = relationship(back_populates="items")
    word: Mapped[Word] = relationship()


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(250))
    slug: Mapped[str | None] = mapped_column(String(120), unique=True)
    title_zh: Mapped[str] = mapped_column(String(250))
    summary: Mapped[str] = mapped_column(String(500))
    level: Mapped[str] = mapped_column(String(20))
    topic: Mapped[str] = mapped_column(String(50))
    read_minutes: Mapped[int] = mapped_column(Integer, default=5)
    cover_gradient: Mapped[str] = mapped_column(String(120), default="forest")
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    source_type: Mapped[str] = mapped_column(String(30), default="seed")
    generation_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
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
    __table_args__ = (
        UniqueConstraint("user_id", "sentence_id"),
        UniqueConstraint("user_id", "dedup_key", name="uq_bookmark_user_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sentence_id: Mapped[int | None] = mapped_column(
        ForeignKey("article_sentences.id", ondelete="SET NULL"), index=True
    )
    article_id: Mapped[int | None] = mapped_column(
        ForeignKey("articles.id", ondelete="SET NULL")
    )
    text: Mapped[str] = mapped_column(Text, default="")
    translation: Mapped[str] = mapped_column(Text, default="")
    source_type: Mapped[str] = mapped_column(String(20), default="article")
    source_title: Mapped[str] = mapped_column(String(250), default="")
    source_ref: Mapped[str | None] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_example: Mapped[bool] = mapped_column(Boolean, default=False)
    dedup_key: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sentence: Mapped[ArticleSentence | None] = relationship()


class ReadingProgress(Base):
    __tablename__ = "reading_progress"
    __table_args__ = (UniqueConstraint("user_id", "article_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=1)
    percent: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ReadingActivity(Base):
    __tablename__ = "reading_activity"
    __table_args__ = (UniqueConstraint("user_id", "article_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date, index=True)
    percent: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
