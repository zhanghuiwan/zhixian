from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User, VocabularyCollection
from app.services.custom_words import CustomWordError, visible_word_by_term
from app.services.vocabulary_collections import ensure_default_collection

InputKind = Literal["general", "english_word", "english_sentence", "english_article"]

WORD_PATTERN = re.compile(r"^[A-Za-z]+(?:[-'][A-Za-z]+)*$")
SENTENCE_ENDING_PATTERN = re.compile(r"[.!?](?:\s|$)")
CJK_PATTERN = re.compile(r"[\u3400-\u9fff]")


@dataclass(frozen=True)
class InputClassification:
    kind: InputKind
    text: str


def classify_input(value: str) -> InputClassification:
    text = value.strip()
    if (
        not re.search(r"[A-Za-z]", text)
        or CJK_PATTERN.search(text)
        or re.search(r"(?:https?://|www\.|\S+@\S+)", text, re.IGNORECASE)
    ):
        return InputClassification("general", text)
    if WORD_PATTERN.fullmatch(text):
        return InputClassification("english_word", text)
    sentence_count = len(SENTENCE_ENDING_PATTERN.findall(text))
    if len(text) >= 280 or sentence_count >= 3 or "\n\n" in text:
        return InputClassification("english_article", text)
    return InputClassification("english_sentence", text)


def input_instruction(classification: InputClassification) -> str:
    instructions = {
        "english_word": (
            "本轮用户只输入了英文单词。必须先调用 lookup_word。正文给出简洁中文释义、"
            "词性和一个必要的用法提示；不要在结尾反问或追加学习建议。"
        ),
        "english_sentence": (
            "本轮用户只输入了英文句子。默认任务是准确、自然地翻译成中文，不回答句子"
            "表达的问题，不主动讲语法，不在结尾反问或追加建议。"
        ),
        "english_article": (
            "本轮用户只输入了较长英文文本。默认任务是按原有段落翻译成中文，保留原意，"
            "不改写原文，不在结尾反问或追加建议。界面会另行提供进入阅读模式的操作。"
        ),
        "general": (
            "直接完成用户当前目标。不要在回答末尾例行添加“要不要我”之类的反问或"
            "泛化建议；只有用户明确要求时才扩展。"
        ),
    }
    return instructions[classification.kind]


def _action(type_: str, label: str, payload: dict, key: str) -> dict:
    return {"id": key, "type": type_, "label": label, "payload": payload}


def _word_actions(db: Session, user: User, term: str, word_id: int) -> list[dict]:
    default = ensure_default_collection(db, user_id=user.id)
    recent = db.scalars(
        select(VocabularyCollection)
        .where(
            VocabularyCollection.user_id == user.id,
            VocabularyCollection.is_default.is_(False),
        )
        .order_by(VocabularyCollection.created_at.desc(), VocabularyCollection.id.desc())
        .limit(2)
    ).all()
    collections = [default, *recent]
    return [
        _action(
            "add_word_to_collection",
            "加入默认生词本" if collection.is_default else f"加入「{collection.name}」",
            {"term": term, "word_id": word_id, "collection_id": collection.id},
            f"word:{word_id}:collection:{collection.id}",
        )
        for collection in collections
    ]


def _content_key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def build_response_actions(
    db: Session,
    *,
    user: User,
    conversation_id: int,
    user_message: str,
    assistant_content: str,
    tool_results: list[dict],
) -> list[dict]:
    classification = classify_input(user_message)

    for result in reversed(tool_results):
        if result["tool_name"] == "generate_article_draft" and result["ok"]:
            article_id = result["data"].get("article_id")
            if article_id:
                return [
                    _action(
                        "navigate",
                        "打开文章",
                        {"path": f"/articles/{article_id}"},
                        f"article:{article_id}:open",
                    )
                ]

    lookup = next(
        (
            result
            for result in reversed(tool_results)
            if result["tool_name"] == "lookup_word" and result["ok"]
        ),
        None,
    )
    if lookup:
        data = lookup["data"]
        if data.get("found") and isinstance(data.get("word"), dict):
            word = data["word"]
            return _word_actions(db, user, str(word["term"]), int(word["id"]))[:3]
        term = str(data.get("term") or classification.text).strip().lower()
        if term:
            return [
                _action(
                    "request_custom_word",
                    "加入我的新增单词",
                    {"term": term},
                    f"custom-word:{term}",
                )
            ]

    if classification.kind == "english_word":
        try:
            word = visible_word_by_term(db, user_id=user.id, term=classification.text)
        except CustomWordError:
            word = None
        if word:
            return _word_actions(db, user, word.term, word.id)[:3]
        term = classification.text.lower()
        return [
            _action(
                "request_custom_word",
                "加入我的新增单词",
                {"term": term},
                f"custom-word:{term}",
            )
        ]

    if classification.kind == "english_sentence" and assistant_content.strip():
        return [
            _action(
                "save_sentence",
                "收藏句子",
                {
                    "text": classification.text,
                    "translation": assistant_content.strip()[:8000],
                    "conversation_id": conversation_id,
                },
                f"sentence:{conversation_id}:{_content_key(classification.text)}",
            )
        ]

    if classification.kind == "english_article":
        first_line = next(
            (line.strip() for line in classification.text.splitlines() if line.strip()),
            "我的导入文章",
        )
        return [
            _action(
                "import_article",
                "保存并进入阅读模式",
                {"content": classification.text, "title": first_line[:120]},
                f"article-import:{conversation_id}:{_content_key(classification.text)}",
            )
        ]

    if any(
        result["tool_name"] == "get_review_plan" and result["ok"]
        for result in tool_results
    ):
        return [
            _action(
                "navigate",
                "开始学习",
                {"path": "/learn"},
                f"review-plan:{conversation_id}:start",
            )
        ]
    return []
