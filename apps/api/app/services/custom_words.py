from __future__ import annotations

import re
import unicodedata

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    User,
    UserCustomWord,
    VocabularyCollection,
    VocabularyCollectionItem,
    VocabularyItem,
    Word,
)
from app.services.vocabulary_collections import ensure_default_collection

CUSTOM_WORD_PATTERN = re.compile(r"^[a-z][a-z .'-]*$")


class CustomWordError(ValueError):
    pass


def normalize_word_term(value: str) -> str:
    term = " ".join(unicodedata.normalize("NFKC", value).strip().lower().split())
    if not term or len(term) > 100 or not CUSTOM_WORD_PATTERN.fullmatch(term):
        raise CustomWordError("请输入有效的英文单词或短语")
    return term


def visible_word_clause(user_id: int):
    return or_(
        Word.dictionary_source == "system",
        exists(
            select(UserCustomWord.id).where(
                UserCustomWord.user_id == user_id,
                UserCustomWord.word_id == Word.id,
            )
        ),
    )


def visible_word_by_id(db: Session, *, user_id: int, word_id: int) -> Word | None:
    return db.scalar(
        select(Word).where(Word.id == word_id, visible_word_clause(user_id))
    )


def visible_word_by_term(db: Session, *, user_id: int, term: str) -> Word | None:
    cleaned = normalize_word_term(term)
    return db.scalar(
        select(Word).where(
            func.lower(Word.term) == cleaned,
            visible_word_clause(user_id),
        )
    )


def list_custom_words(db: Session, *, user_id: int) -> list[Word]:
    return db.scalars(
        select(Word)
        .join(UserCustomWord, UserCustomWord.word_id == Word.id)
        .where(
            UserCustomWord.user_id == user_id,
            Word.dictionary_source == "custom",
        )
        .order_by(UserCustomWord.created_at.desc(), UserCustomWord.id.desc())
    ).all()


def create_custom_word(
    db: Session,
    *,
    user: User,
    term: str,
    translation: str,
    phonetic: str = "",
    part_of_speech: str = "",
    definitions: list[dict] | None = None,
    example: str = "",
    example_translation: str = "",
    collection_id: int | None = None,
    created_by: str = "ai_agent",
) -> dict:
    cleaned = normalize_word_term(term)
    cleaned_translation = translation.strip()
    if not cleaned_translation:
        raise CustomWordError("中文释义不能为空")

    if collection_id is None:
        collection = ensure_default_collection(db, user_id=user.id)
    else:
        collection = db.scalar(
            select(VocabularyCollection).where(
                VocabularyCollection.id == collection_id,
                VocabularyCollection.user_id == user.id,
            )
        )
        if collection is None:
            raise CustomWordError("生词本不存在")

    word = db.scalar(select(Word).where(func.lower(Word.term) == cleaned))
    created = word is None
    if word is None:
        word = Word(
            term=cleaned,
            phonetic=phonetic.strip(),
            part_of_speech=part_of_speech.strip(),
            translation=cleaned_translation,
            definitions=definitions or [],
            example=example.strip(),
            example_translation=example_translation.strip(),
            dictionary_source="custom",
        )
        db.add(word)
        db.flush()

    ownership_created = False
    if word.dictionary_source == "custom":
        ownership = db.scalar(
            select(UserCustomWord).where(
                UserCustomWord.user_id == user.id,
                UserCustomWord.word_id == word.id,
            )
        )
        if ownership is None:
            db.add(
                UserCustomWord(
                    user_id=user.id,
                    word_id=word.id,
                    created_by=created_by,
                )
            )
            ownership_created = True

    item = db.scalar(
        select(VocabularyItem).where(
            VocabularyItem.user_id == user.id,
            VocabularyItem.word_id == word.id,
        )
    )
    if item is None:
        item = VocabularyItem(
            user_id=user.id,
            word_id=word.id,
            source_type=(
                "custom_word"
                if word.dictionary_source == "custom"
                else created_by
            ),
        )
        db.add(item)
        db.flush()

    link = db.scalar(
        select(VocabularyCollectionItem).where(
            VocabularyCollectionItem.collection_id == collection.id,
            VocabularyCollectionItem.vocabulary_item_id == item.id,
        )
    )
    added_to_collection = link is None
    if added_to_collection:
        db.add(
            VocabularyCollectionItem(
                collection_id=collection.id,
                vocabulary_item_id=item.id,
            )
        )
    db.commit()
    return {
        "word": word,
        "collection_id": collection.id,
        "collection_name": collection.name,
        "created": created,
        "ownership_created": ownership_created,
        "added_to_collection": added_to_collection,
    }
