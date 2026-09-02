from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AIUserMemory,
    Article,
    ArticleSentence,
    User,
    UserWordProgress,
    VocabularyItem,
    Word,
)
from app.services.learning_insights import (
    difficult_words,
    get_review_plan,
    learning_history,
    local_today,
)
from app.services.vocabulary_collections import (
    VocabularyCollectionError,
    add_word,
    create_collection,
    delete_collection,
    list_collections,
    remove_word,
    rename_collection,
)


class ToolExecutionError(ValueError):
    pass


class LookupWordArgs(BaseModel):
    term: str = Field(min_length=1, max_length=100)


class LearningHistoryArgs(BaseModel):
    date: date


class ReviewPlanArgs(BaseModel):
    date: date


class DifficultWordsArgs(BaseModel):
    days: int = Field(default=30, ge=1, le=180)
    limit: int = Field(default=10, ge=1, le=30)


class NavigateArgs(BaseModel):
    page: Literal["home", "learn", "articles", "article", "vocabulary", "profile"]
    article_id: int | None = Field(default=None, ge=1)


class EmptyArgs(BaseModel):
    pass


class CreateCollectionArgs(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


class RenameCollectionArgs(BaseModel):
    collection_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=80)


class WordCollectionArgs(BaseModel):
    term: str = Field(min_length=1, max_length=100)
    collection_id: int | None = Field(default=None, ge=1)


class RemoveWordArgs(BaseModel):
    term: str = Field(min_length=1, max_length=100)
    collection_id: int = Field(ge=1)


class DeleteCollectionArgs(BaseModel):
    collection_id: int = Field(ge=1)


class GeneratedExample(BaseModel):
    sentence: str = Field(min_length=1, max_length=300)
    translation: str = Field(min_length=1, max_length=300)


class GeneratedExamplesArgs(BaseModel):
    term: str = Field(min_length=1, max_length=100)
    examples: list[GeneratedExample] = Field(min_length=1, max_length=5)


class GeneratedSentence(BaseModel):
    text: str = Field(min_length=1, max_length=800)
    translation: str = Field(min_length=1, max_length=800)


class GeneratedArticleArgs(BaseModel):
    topic: str = Field(min_length=1, max_length=50)
    level: Literal["A1", "A2", "B1", "B2", "C1", "C2"]
    title: str = Field(min_length=1, max_length=250)
    title_zh: str = Field(min_length=1, max_length=250)
    summary: str = Field(min_length=1, max_length=500)
    target_words: list[str] = Field(default_factory=list, max_length=20)
    sentences: list[GeneratedSentence] = Field(min_length=2, max_length=30)


class RememberPreferenceArgs(BaseModel):
    key: Literal["preferred_topics", "response_style", "learning_goal"]
    value: str = Field(min_length=1, max_length=500)


@dataclass(frozen=True)
class ToolOutcome:
    data: dict
    summary: str
    event_type: str = "tool.completed"


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    arguments_model: type[BaseModel]
    handler: Callable[[Session, User, BaseModel], ToolOutcome]
    requires_confirmation: bool = False

    def provider_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.arguments_model.model_json_schema(),
            },
        }


def _lookup(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = LookupWordArgs.model_validate(raw)
    cleaned = args.term.strip().lower().strip(".,!?;:'\"()[]{}")
    word = db.scalar(select(Word).where(func.lower(Word.term) == cleaned))
    if word is None:
        raise ToolExecutionError("内置词典暂未收录该词")
    progress = db.scalar(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id, UserWordProgress.word_id == word.id
        )
    )
    vocabulary = db.scalar(
        select(VocabularyItem).where(
            VocabularyItem.user_id == user.id, VocabularyItem.word_id == word.id
        )
    )
    data = {
        "word": {
            "id": word.id,
            "term": word.term,
            "phonetic": word.phonetic,
            "part_of_speech": word.part_of_speech,
            "translation": word.translation,
            "definitions": word.definitions,
            "example": word.example,
            "example_translation": word.example_translation,
        },
        "mastery_score": progress.mastery_score if progress else 0,
        "in_vocabulary": vocabulary is not None,
    }
    return ToolOutcome(data, f"已查询 {word.term}")


def _history(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = LearningHistoryArgs.model_validate(raw)
    data = learning_history(db, user=user, day=args.date)
    return ToolOutcome(data, f"{args.date.isoformat()} 共复习 {data['review_count']} 次")


def _plan(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = ReviewPlanArgs.model_validate(raw)
    today = local_today(user)
    if args.date < today:
        raise ToolExecutionError("历史日期请使用学习历史工具查询")
    if (args.date - today).days > 7:
        raise ToolExecutionError("目前仅支持未来 7 天的计划预测")
    data = get_review_plan(db, user=user, day=args.date)
    return ToolOutcome(data, f"{args.date.isoformat()} 共 {len(data['items'])} 个计划单词")


def _difficult(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = DifficultWordsArgs.model_validate(raw)
    data = difficult_words(db, user=user, days=args.days, limit=args.limit)
    return ToolOutcome(data, f"找到 {data['count']} 个近期易错词")


def _navigate(_: Session, __: User, raw: BaseModel) -> ToolOutcome:
    args = NavigateArgs.model_validate(raw)
    if args.page == "article" and args.article_id is None:
        raise ToolExecutionError("打开具体文章时必须提供文章 ID")
    data = args.model_dump(exclude_none=True)
    return ToolOutcome(data, f"准备打开 {args.page}", "navigation.requested")


def _list_collections(db: Session, user: User, _: BaseModel) -> ToolOutcome:
    data = {"collections": list_collections(db, user_id=user.id)}
    return ToolOutcome(data, f"共有 {len(data['collections'])} 个生词本")


def _create_collection(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = CreateCollectionArgs.model_validate(raw)
    data = create_collection(
        db, user_id=user.id, name=args.name, description=args.description
    )
    return ToolOutcome(data, f"生词本“{data['name']}”已就绪")


def _rename_collection(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = RenameCollectionArgs.model_validate(raw)
    data = rename_collection(
        db, user_id=user.id, collection_id=args.collection_id, name=args.name
    )
    return ToolOutcome(data, f"已重命名为“{data['name']}”")


def _add_word(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = WordCollectionArgs.model_validate(raw)
    data = add_word(
        db, user=user, term=args.term, collection_id=args.collection_id
    )
    return ToolOutcome(data, f"{data['term']} 已加入“{data['collection_name']}”")


def _remove_word(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = RemoveWordArgs.model_validate(raw)
    data = remove_word(
        db,
        user_id=user.id,
        term=args.term,
        collection_id=args.collection_id,
    )
    return ToolOutcome(data, f"{args.term} 已从指定生词本移除")


def _delete_collection(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = DeleteCollectionArgs.model_validate(raw)
    data = delete_collection(
        db, user_id=user.id, collection_id=args.collection_id
    )
    return ToolOutcome(data, f"生词本“{data['name']}”已删除")


def _examples(_: Session, __: User, raw: BaseModel) -> ToolOutcome:
    args = GeneratedExamplesArgs.model_validate(raw)
    return ToolOutcome(args.model_dump(), f"已为 {args.term} 生成 {len(args.examples)} 个例句")


def _article(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = GeneratedArticleArgs.model_validate(raw)
    article = Article(
        title=args.title,
        title_zh=args.title_zh,
        summary=args.summary,
        level=args.level,
        topic=args.topic,
        read_minutes=max(1, round(len(args.sentences) / 5)),
        cover_gradient="forest",
        is_published=False,
        owner_user_id=user.id,
        source_type="ai",
        generation_metadata={"target_words": args.target_words},
    )
    db.add(article)
    db.flush()
    for position, sentence in enumerate(args.sentences, start=1):
        db.add(
            ArticleSentence(
                article_id=article.id,
                position=position,
                text=sentence.text,
                translation=sentence.translation,
            )
        )
    db.commit()
    return ToolOutcome(
        {
            "article_id": article.id,
            "title": article.title,
            "title_zh": article.title_zh,
            "level": article.level,
            "topic": article.topic,
            "sentence_count": len(args.sentences),
            "is_draft": True,
        },
        f"文章草稿“{article.title}”已保存",
    )


def _remember(db: Session, user: User, raw: BaseModel) -> ToolOutcome:
    args = RememberPreferenceArgs.model_validate(raw)
    memory = db.scalar(
        select(AIUserMemory).where(
            AIUserMemory.user_id == user.id, AIUserMemory.key == args.key
        )
    )
    if memory is None:
        memory = AIUserMemory(
            user_id=user.id, key=args.key, value=args.value, source="explicit"
        )
        db.add(memory)
    else:
        memory.value = args.value
    db.commit()
    return ToolOutcome(
        {"key": args.key, "value": args.value, "saved": True},
        "已记住这项学习偏好",
    )


TOOL_REGISTRY: dict[str, ToolDefinition] = {
    definition.name: definition
    for definition in [
        ToolDefinition("lookup_word", "查询内置词典中的单词及当前用户掌握状态。", LookupWordArgs, _lookup),
        ToolDefinition(
            "get_learning_history",
            "查询某个具体本地日期真实发生的学习和复习记录。",
            LearningHistoryArgs,
            _history,
        ),
        ToolDefinition(
            "get_review_plan",
            "获取今天确定的学习计划或未来七天内的预测计划。",
            ReviewPlanArgs,
            _plan,
        ),
        ToolDefinition(
            "get_difficult_words",
            "根据近期 again/hard 记录查询易错词。",
            DifficultWordsArgs,
            _difficult,
        ),
        ToolDefinition(
            "navigate_to_page",
            "打开知闲内的学习、文章、生词本、首页或设置页面。",
            NavigateArgs,
            _navigate,
        ),
        ToolDefinition(
            "list_vocabulary_collections",
            "列出用户的全部生词本和单词数量。",
            EmptyArgs,
            _list_collections,
        ),
        ToolDefinition(
            "create_vocabulary_collection",
            "新建一个自定义生词本。",
            CreateCollectionArgs,
            _create_collection,
        ),
        ToolDefinition(
            "rename_vocabulary_collection",
            "重命名指定的自定义生词本。",
            RenameCollectionArgs,
            _rename_collection,
        ),
        ToolDefinition(
            "add_word_to_vocabulary_collection",
            "将词典中已有单词加入指定生词本；不指定时加入默认生词本。",
            WordCollectionArgs,
            _add_word,
        ),
        ToolDefinition(
            "remove_word_from_vocabulary_collection",
            "从指定生词本移除一个单词，但保留其他生词本和学习进度。",
            RemoveWordArgs,
            _remove_word,
        ),
        ToolDefinition(
            "delete_vocabulary_collection",
            "删除指定自定义生词本及其分类关系。默认生词本不可删除。",
            DeleteCollectionArgs,
            _delete_collection,
            requires_confirmation=True,
        ),
        ToolDefinition(
            "present_generated_examples",
            "当用户要求例句时，生成符合用户等级的英文例句和中文翻译并用此工具展示。",
            GeneratedExamplesArgs,
            _examples,
        ),
        ToolDefinition(
            "generate_article_draft",
            "生成分级英文文章、逐句翻译并保存为当前用户的文章草稿。",
            GeneratedArticleArgs,
            _article,
        ),
        ToolDefinition(
            "remember_learning_preference",
            "仅在用户明确要求记住长期学习偏好时保存。",
            RememberPreferenceArgs,
            _remember,
        ),
    ]
}


def provider_tools() -> list[dict]:
    return [definition.provider_schema() for definition in TOOL_REGISTRY.values()]


def validate_tool_arguments(tool_name: str, arguments: Any) -> BaseModel:
    definition = TOOL_REGISTRY.get(tool_name)
    if definition is None:
        raise ToolExecutionError("模型请求了不受支持的工具")
    try:
        return definition.arguments_model.model_validate(arguments)
    except ValidationError as exc:
        raise ToolExecutionError("工具参数不正确") from exc


def execute_tool(
    db: Session, *, user: User, tool_name: str, arguments: Any
) -> ToolOutcome:
    definition = TOOL_REGISTRY.get(tool_name)
    if definition is None:
        raise ToolExecutionError("模型请求了不受支持的工具")
    validated = validate_tool_arguments(tool_name, arguments)
    try:
        return definition.handler(db, user, validated)
    except VocabularyCollectionError as exc:
        raise ToolExecutionError(str(exc)) from exc
