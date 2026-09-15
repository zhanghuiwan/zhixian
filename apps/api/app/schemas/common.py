from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
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
    dictionary_source: Literal["system", "custom"] = "system"


class CustomWordDefinition(BaseModel):
    part_of_speech: str = Field(default="", max_length=30)
    meaning: str = Field(min_length=1, max_length=500)


class CustomWordCreate(BaseModel):
    term: str = Field(min_length=1, max_length=100)
    phonetic: str = Field(default="", max_length=120)
    part_of_speech: str = Field(default="", max_length=30)
    translation: str = Field(min_length=1, max_length=500)
    definitions: list[CustomWordDefinition] = Field(
        default_factory=list, max_length=12
    )
    example: str = Field(default="", max_length=1200)
    example_translation: str = Field(default="", max_length=1200)
    collection_id: int | None = Field(default=None, ge=1)


class CustomWordResult(BaseModel):
    word: WordRead
    collection_id: int
    collection_name: str
    created: bool
    ownership_created: bool
    added_to_collection: bool


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


class StudySessionAttempt(BaseModel):
    score: int = Field(ge=0, le=100)
    answer_kind: Literal["forgot", "fuzzy", "remembered", "slider", "quick"]
    round_no: int = Field(ge=1, le=100)
    response_ms: int = Field(default=0, ge=0, le=3_600_000)
    revealed_before_answer: bool = False


class StudySessionWord(BaseModel):
    word_id: int = Field(ge=1)
    mode: Literal["new", "review"]
    source_kind: Literal["system", "personal", "all"] = "all"
    source_id: int | None = Field(default=None, ge=1)
    attempts: list[StudySessionAttempt] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_completed_word(self):
        if self.source_kind in {"system", "personal"} and self.source_id is None:
            raise ValueError("所选词书缺少来源 ID")
        if self.attempts[-1].score < 80:
            raise ValueError("整组提交前，每个单词都必须完成本轮巩固")
        return self


class StudySessionComplete(BaseModel):
    session_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    mode: Literal["all", "new", "review"]
    source_kind: Literal["system", "personal", "all"] = "all"
    source_id: int | None = Field(default=None, ge=1)
    source_name: str = Field(default="综合学习", min_length=1, max_length=120)
    started_at: datetime
    duration_ms: int = Field(default=0, ge=0, le=86_400_000)
    round_count: int = Field(ge=1, le=100)
    words: list[StudySessionWord] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_session(self):
        if self.source_kind in {"system", "personal"} and self.source_id is None:
            raise ValueError("所选词书缺少来源 ID")
        word_ids = [item.word_id for item in self.words]
        if len(word_ids) != len(set(word_ids)):
            raise ValueError("同一学习组不能重复提交单词")
        highest_round = max(attempt.round_no for word in self.words for attempt in word.attempts)
        if highest_round != self.round_count:
            raise ValueError("学习轮数与答题记录不一致")
        return self


class StudySessionResult(BaseModel):
    session_id: str
    word_count: int
    attempt_count: int
    repeated_words: int
    round_count: int
    duration_ms: int
    completed_at: datetime


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
