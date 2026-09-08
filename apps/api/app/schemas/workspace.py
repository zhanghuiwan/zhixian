from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import BookmarkRead, WordRead


class PersonalBookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("名称不能为空")
        return value.strip()


class BookSummary(BaseModel):
    id: int
    kind: Literal["system", "personal"]
    name: str
    description: str
    level: str
    cover_color: str
    word_count: int
    learned_count: int
    mastered_count: int
    due_count: int
    is_selected: bool
    is_default: bool = False


class BookWord(BaseModel):
    word: WordRead
    status: str
    mastery_score: int


class BookDetail(BaseModel):
    book: BookSummary
    words: list[BookWord]
    total: int
    offset: int


class BookTerms(BaseModel):
    terms: list[str] = Field(min_length=1, max_length=200)

    @field_validator("terms")
    @classmethod
    def clean_terms(cls, value: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(term.strip().lower() for term in value if term.strip()))
        if not cleaned or any(len(term) > 100 for term in cleaned):
            raise ValueError("请输入有效单词，每个词不超过 100 字符")
        return cleaned


class AddTermsResult(BaseModel):
    added: int
    existing: int
    missing: list[str]


class BookmarkCreate(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    translation: str = Field(default="", max_length=8000)
    article_id: int | None = Field(default=None, ge=1)
    conversation_id: int | None = Field(default=None, ge=1)
    note: str = Field(default="", max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("收藏内容不能为空")
        return value.strip()

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, value: list[str]) -> list[str]:
        if any(len(tag) > 30 for tag in value):
            raise ValueError("标签不能超过 30 字")
        return list(dict.fromkeys(tag.strip() for tag in value if tag.strip()))


class BookmarkUpdate(BaseModel):
    translation: str | None = Field(default=None, max_length=8000)
    note: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = Field(default=None, max_length=12)

    @field_validator("translation", "note")
    @classmethod
    def reject_null_text(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("字段不能为 null")
        return value

    @field_validator("tags")
    @classmethod
    def clean_optional_tags(cls, value: list[str] | None) -> list[str]:
        if value is None:
            raise ValueError("标签不能为 null")
        return BookmarkCreate.clean_tags(value)


class BookmarkPage(BaseModel):
    items: list[BookmarkRead]
    total: int
    offset: int


class ReadingUpdate(BaseModel):
    position: int = Field(ge=1)
    percent: int = Field(ge=0, le=100)
    completed: bool = False


class ReadingResult(BaseModel):
    position: int
    percent: int
    is_completed: bool


class RecordWord(BaseModel):
    id: int
    term: str
    translation: str
    rating: str
    mode: str


class RecordBook(BaseModel):
    name: str
    kind: str
    id: int | None
    word_count: int


class RecordArticle(BaseModel):
    id: int
    title: str
    percent: int
    completed: bool


class DayRecord(BaseModel):
    date: date
    new_count: int
    review_count: int
    attempts: int
    word_count: int
    reading_count: int
    saved_words: int
    saved_sentences: int
    books: list[RecordBook]
    words: list[RecordWord]
    articles: list[RecordArticle]


class MonthRecords(BaseModel):
    month: str
    timezone: str
    today: date
    days: list[DayRecord]
