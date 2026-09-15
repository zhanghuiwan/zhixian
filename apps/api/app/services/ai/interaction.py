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
TRANSLATION_HEADING_PATTERN = re.compile(
    r"^#{2,3}\s*(?:中文翻译|自然译文)\s*$", re.MULTILINE
)
NEXT_HEADING_PATTERN = re.compile(r"^#{2,4}\s+", re.MULTILINE)

WORD_RESPONSE_FORMAT = (
    "查词回答必须使用层次清晰的 Markdown，并按以下顺序完整覆盖："
    "① 标题行写单词、英式/美式音标（能区分时都写）和主要词性；"
    "② ‘核心释义’同时给出简明中文释义与准确英文释义；"
    "③ ‘分义项与语境’按词性说明常见义项、适用场景、语体和典型搭配；"
    "④ ‘词形与语法’列出适用的单复数、第三人称单数、现在分词、过去式、过去分词、"
    "比较级/最高级及可数性，不适用的项目不要硬凑；"
    "⑤ ‘常见用法’给出高频搭配、固定结构、介词搭配和常见错误；"
    "⑥ ‘例句’提供 3 至 5 个覆盖不同义项或场景的自然英文例句及中文翻译；"
    "⑦ ‘易混词’用表格比较近义词、形近词或容易误用的词。"
    "词典工具结果是核心事实；可以用确定的语言知识补充，但不得捏造，不确定时明确说明。"
)

TRANSLATION_RESPONSE_FORMAT = (
    "英译中回答必须使用稳定的 Markdown 结构：先用二级标题‘中文翻译’，下一行用引用块"
    "给出一条可独立收藏的自然中文译文；再依次给出‘语义拆解’、‘关键表达’、‘句型与语法’"
    "和‘语境与译法’。说明重要词组、指代、时态、语气、歧义、正式/口语差异；存在合理的"
    "其他译法时说明适用场景。不要为了凑篇幅重复原文，也不要在结尾追加学习建议或反问。"
)

ARTICLE_RESPONSE_FORMAT = (
    "长文英译中先以‘全文翻译’为二级标题，保持原段落顺序完整翻译；随后用‘重点词句’、"
    "‘语篇与语境’和‘易误译处’补充关键表达、衔接、语气、文化背景或歧义。译文完整性优先，"
    "不要改写成摘要，不在结尾追加建议或反问。"
)


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
            "本轮用户只输入了英文单词，默认任务是详细查词。必须先调用 lookup_word。"
            f"{WORD_RESPONSE_FORMAT}不要在结尾反问或追加学习建议。"
        ),
        "english_sentence": (
            "本轮用户只输入了英文句子。默认任务是准确、自然地翻译成中文，不把疑问句当作"
            f"对助手的提问来回答。{TRANSLATION_RESPONSE_FORMAT}"
        ),
        "english_article": (
            "本轮用户只输入了较长英文文本，默认任务是详细英译中。"
            f"{ARTICLE_RESPONSE_FORMAT}界面会另行提供进入阅读模式的操作。"
        ),
        "general": (
            "直接完成用户当前目标。不要在回答末尾例行添加“要不要我”之类的反问或"
            "泛化建议；只有用户明确要求时才扩展。"
        ),
    }
    return instructions[classification.kind]


def global_language_response_instruction() -> str:
    return (
        "用户以中文或混合语言明确要求查词时，也遵循以下查词格式："
        f"{WORD_RESPONSE_FORMAT}"
        "用户明确要求英译中时，也遵循以下翻译格式："
        f"{TRANSLATION_RESPONSE_FORMAT}"
        "输入是长文时改用以下格式："
        f"{ARTICLE_RESPONSE_FORMAT}"
    )


def extract_primary_translation(content: str) -> str:
    match = TRANSLATION_HEADING_PATTERN.search(content)
    if match:
        remainder = content[match.end() :].lstrip("\r\n")
        next_heading = NEXT_HEADING_PATTERN.search(remainder)
        section = remainder[: next_heading.start()] if next_heading else remainder
        lines = [
            re.sub(r"^\s*>\s?", "", line).strip()
            for line in section.splitlines()
        ]
        value = "\n".join(line for line in lines if line).strip()
    else:
        value = next(
            (
                re.sub(r"^\s*>\s?", "", line).strip()
                for line in content.splitlines()
                if line.strip() and not line.lstrip().startswith("#")
            ),
            "",
        )
    return re.sub(r"(?:\*\*|__|`)", "", value).strip()[:8000]


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
        translation = extract_primary_translation(assistant_content)
        if not translation:
            return []
        return [
            _action(
                "save_sentence",
                "收藏句子",
                {
                    "text": classification.text,
                    "translation": translation,
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
