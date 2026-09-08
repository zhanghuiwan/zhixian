from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    nickname: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=80)
    level: str | None = Field(default=None, pattern="^(A1|A2|B1|B2|C1|C2)$")
    daily_new_words: int | None = Field(default=None, ge=1, le=50)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("时区名称无效") from exc
        return value


class UserRead(ORMModel):
    id: int
    email: EmailStr
    nickname: str
    level: str
    daily_new_words: int
    timezone: str
    selected_wordbook_id: int | None
    selected_collection_id: int | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class WordRead(ORMModel):
    id: int
    term: str
    phonetic: str
    part_of_speech: str
    translation: str
    definitions: list[dict]
    example: str
    example_translation: str


class WordbookRead(BaseModel):
    id: int
    name: str
    description: str
    level: str
    cover_color: str
    word_count: int
    learned_count: int
    mastered_count: int
    is_selected: bool


class StudyQueueItem(BaseModel):
    word: WordRead
    mode: str
    repetitions: int
    mastery_score: int
    source_kind: str = "all"
    source_id: int | None = None
    source_name: str = "综合复习"
    intervals: dict[str, str] = Field(default_factory=dict)


class StudyQueueResponse(BaseModel):
    items: list[StudyQueueItem]
    due_count: int
    new_count: int


class ReviewCreate(BaseModel):
    word_id: int
    rating: str = Field(pattern="^(again|hard|good|easy)$")
    source_kind: Literal["system", "personal", "all", "legacy"] = "legacy"
    source_id: int | None = Field(default=None, ge=1)
    request_id: str | None = Field(default=None, min_length=8, max_length=64)


class ReviewResult(BaseModel):
    word_id: int
    status: str
    repetitions: int
    interval_days: int
    mastery_score: int
    next_review_at: datetime


class VocabularyCreate(BaseModel):
    word_id: int
    source_type: str = Field(default="manual", max_length=30)
    source_ref: str | None = Field(default=None, max_length=120)
    note: str = Field(default="", max_length=500)


class VocabularyRead(BaseModel):
    id: int
    word: WordRead
    source_type: str
    source_ref: str | None
    note: str
    mastery_score: int
    created_at: datetime


class VocabularyCollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


class VocabularyCollectionUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class VocabularyCollectionRead(BaseModel):
    id: int
    name: str
    description: str
    is_default: bool
    word_count: int


class ArticleListItem(ORMModel):
    id: int
    title: str
    title_zh: str
    summary: str
    level: str
    topic: str
    read_minutes: int
    cover_gradient: str
    source_type: str = "seed"
    is_private: bool = False
    progress: int = 0
    is_completed: bool = False


class SentenceRead(ORMModel):
    id: int
    position: int
    text: str
    translation: str
    is_bookmarked: bool = False


class ArticleDetail(ArticleListItem):
    sentences: list[SentenceRead]
    last_position: int = 1


class BookmarkRead(BaseModel):
    id: int
    sentence_id: int | None
    article_id: int | None
    article_title: str
    text: str
    translation: str
    created_at: datetime
    source_type: str = "article"
    source_ref: str | None = None
    note: str = ""
    tags: list[str] = Field(default_factory=list)
    is_example: bool = False


class RecentActivity(BaseModel):
    word: str
    translation: str
    rating: str
    reviewed_at: datetime


class DashboardRead(BaseModel):
    due_today: int
    studied_today: int
    mastered_words: int
    vocabulary_count: int
    streak_days: int
    current_wordbook: WordbookRead | None
    recent_activity: list[RecentActivity]
