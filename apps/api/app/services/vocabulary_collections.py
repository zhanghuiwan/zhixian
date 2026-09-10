from __future__ import annotations

from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.orm import Session

from app.models import (
    User,
    UserCustomWord,
    VocabularyCollection,
    VocabularyCollectionItem,
    VocabularyItem,
    Word,
)


class VocabularyCollectionError(ValueError):
    pass


def ensure_default_collection(db: Session, *, user_id: int) -> VocabularyCollection:
    collection = db.scalar(
        select(VocabularyCollection).where(
            VocabularyCollection.user_id == user_id,
            VocabularyCollection.is_default.is_(True),
        )
    )
    if collection is not None:
        return collection
    collection = db.scalar(
        select(VocabularyCollection).where(
            VocabularyCollection.user_id == user_id,
            VocabularyCollection.name == "默认生词本",
        )
    )
    if collection is None:
        collection = VocabularyCollection(
            user_id=user_id,
            name="默认生词本",
            description="自动收录未指定分类的生词",
            is_default=True,
        )
        db.add(collection)
        db.flush()
    else:
        collection.is_default = True
    existing_items = db.scalars(
        select(VocabularyItem).where(VocabularyItem.user_id == user_id)
    ).all()
    for item in existing_items:
        db.add(
            VocabularyCollectionItem(
                collection_id=collection.id,
                vocabulary_item_id=item.id,
            )
        )
    db.commit()
    db.refresh(collection)
    return collection


def list_collections(db: Session, *, user_id: int) -> list[dict]:
    ensure_default_collection(db, user_id=user_id)
    rows = db.execute(
        select(VocabularyCollection, func.count(VocabularyCollectionItem.id))
        .outerjoin(
            VocabularyCollectionItem,
            VocabularyCollectionItem.collection_id == VocabularyCollection.id,
        )
        .where(VocabularyCollection.user_id == user_id)
        .group_by(VocabularyCollection.id)
        .order_by(VocabularyCollection.is_default.desc(), VocabularyCollection.created_at)
    ).all()
    return [
        {
            "id": collection.id,
            "name": collection.name,
            "description": collection.description,
            "is_default": collection.is_default,
            "word_count": count,
        }
        for collection, count in rows
    ]


def create_collection(
    db: Session, *, user_id: int, name: str, description: str = ""
) -> dict:
    cleaned = name.strip()
    if not cleaned:
        raise VocabularyCollectionError("名称不能为空")
    if cleaned == "默认生词本":
        raise VocabularyCollectionError("“默认生词本”是保留名称")
    existing = db.scalar(
        select(VocabularyCollection).where(
            VocabularyCollection.user_id == user_id,
            func.lower(VocabularyCollection.name) == cleaned.lower(),
        )
    )
    if existing:
        return {
            "id": existing.id,
            "name": existing.name,
            "description": existing.description,
            "is_default": existing.is_default,
            "created": False,
        }
    collection = VocabularyCollection(
        user_id=user_id, name=cleaned, description=description.strip()
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "is_default": False,
        "created": True,
    }


def _owned_collection(
    db: Session, *, user_id: int, collection_id: int
) -> VocabularyCollection:
    collection = db.scalar(
        select(VocabularyCollection).where(
            VocabularyCollection.id == collection_id,
            VocabularyCollection.user_id == user_id,
        )
    )
    if collection is None:
        raise VocabularyCollectionError("生词本不存在")
    return collection


def rename_collection(
    db: Session, *, user_id: int, collection_id: int, name: str
) -> dict:
    collection = _owned_collection(db, user_id=user_id, collection_id=collection_id)
    if collection.is_default:
        raise VocabularyCollectionError("默认生词本不能重命名")
    cleaned = name.strip()
    if not cleaned:
        raise VocabularyCollectionError("名称不能为空")
    conflict = db.scalar(
        select(VocabularyCollection).where(
            VocabularyCollection.user_id == user_id,
            VocabularyCollection.id != collection.id,
            func.lower(VocabularyCollection.name) == cleaned.lower(),
        )
    )
    if conflict:
        raise VocabularyCollectionError("同名生词本已存在")
    collection.name = cleaned
    db.commit()
    return {"id": collection.id, "name": collection.name, "renamed": True}


def add_word(
    db: Session,
    *,
    user: User,
    term: str,
    collection_id: int | None = None,
) -> dict:
    word = db.scalar(
        select(Word).where(
            func.lower(Word.term) == term.strip().lower(),
            or_(
                Word.dictionary_source == "system",
                exists(
                    select(UserCustomWord.id).where(
                        UserCustomWord.user_id == user.id,
                        UserCustomWord.word_id == Word.id,
                    )
                ),
            ),
        )
    )
    if word is None:
        raise VocabularyCollectionError("词库暂未收录该词")
    collection = (
        _owned_collection(db, user_id=user.id, collection_id=collection_id)
        if collection_id
        else ensure_default_collection(db, user_id=user.id)
    )
    item = db.scalar(
        select(VocabularyItem).where(
            VocabularyItem.user_id == user.id, VocabularyItem.word_id == word.id
        )
    )
    if item is None:
        item = VocabularyItem(
            user_id=user.id, word_id=word.id, source_type="ai_agent"
        )
        db.add(item)
        db.flush()
    link = db.scalar(
        select(VocabularyCollectionItem).where(
            VocabularyCollectionItem.collection_id == collection.id,
            VocabularyCollectionItem.vocabulary_item_id == item.id,
        )
    )
    added = link is None
    if added:
        db.add(
            VocabularyCollectionItem(
                collection_id=collection.id, vocabulary_item_id=item.id
            )
        )
    db.commit()
    return {
        "word_id": word.id,
        "term": word.term,
        "translation": word.translation,
        "collection_id": collection.id,
        "collection_name": collection.name,
        "added": added,
    }


def remove_word(
    db: Session, *, user_id: int, term: str, collection_id: int
) -> dict:
    collection = _owned_collection(db, user_id=user_id, collection_id=collection_id)
    item = db.scalar(
        select(VocabularyItem)
        .join(Word, Word.id == VocabularyItem.word_id)
        .where(
            VocabularyItem.user_id == user_id,
            func.lower(Word.term) == term.strip().lower(),
        )
    )
    if item is None:
        return {"term": term, "collection_id": collection.id, "removed": False}
    link = db.scalar(
        select(VocabularyCollectionItem).where(
            VocabularyCollectionItem.collection_id == collection.id,
            VocabularyCollectionItem.vocabulary_item_id == item.id,
        )
    )
    if link:
        db.delete(link)
        db.commit()
    return {"term": term, "collection_id": collection.id, "removed": link is not None}


def delete_collection(db: Session, *, user_id: int, collection_id: int) -> dict:
    collection = _owned_collection(db, user_id=user_id, collection_id=collection_id)
    if collection.is_default:
        raise VocabularyCollectionError("默认生词本不能删除")
    name = collection.name
    db.execute(update(User).where(User.id == user_id, User.selected_collection_id == collection_id).values(selected_collection_id=None))
    db.execute(delete(VocabularyCollectionItem).where(VocabularyCollectionItem.collection_id == collection_id))
    db.delete(collection)
    db.commit()
    return {"id": collection_id, "name": name, "deleted": True}
