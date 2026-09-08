from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    User, UserWordProgress, VocabularyCollection, VocabularyCollectionItem,
    VocabularyItem, Word, Wordbook, WordbookWord,
)
from app.schemas.workspace import BookDetail, BookSummary, BookWord
from app.services.vocabulary_collections import VocabularyCollectionError, ensure_default_collection


def source_words(db: Session, user: User, kind: str, source_id: int | None):
    if kind == "system":
        source = db.scalar(select(Wordbook).where(Wordbook.id == source_id, Wordbook.is_published.is_(True)))
        if source is None:
            raise VocabularyCollectionError("词书不存在")
        ids = select(WordbookWord.word_id).where(WordbookWord.wordbook_id == source.id)
    elif kind == "personal":
        source = db.scalar(select(VocabularyCollection).where(VocabularyCollection.id == source_id, VocabularyCollection.user_id == user.id))
        if source is None:
            raise VocabularyCollectionError("词书不存在")
        ids = select(VocabularyItem.word_id).join(VocabularyCollectionItem, VocabularyCollectionItem.vocabulary_item_id == VocabularyItem.id).where(VocabularyCollectionItem.collection_id == source.id, VocabularyItem.user_id == user.id)
    else:
        raise VocabularyCollectionError("词书类型无效")
    return source, ids


def summarize_book(db: Session, user: User, kind: str, source_id: int) -> BookSummary:
    source, ids = source_words(db, user, kind, source_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    progress = select(UserWordProgress).where(UserWordProgress.user_id == user.id, UserWordProgress.word_id.in_(ids), UserWordProgress.last_reviewed_at.is_not(None))
    entries = db.scalars(progress).all()
    return BookSummary(
        id=source.id, kind=kind, name=source.name, description=source.description,
        level=source.level if kind == "system" else "个人词书",
        cover_color=source.cover_color if kind == "system" else "#4b7066",
        word_count=db.scalar(select(func.count()).select_from(ids.subquery())) or 0,
        learned_count=len(entries), mastered_count=sum(p.status == "mastered" for p in entries),
        due_count=sum(p.next_review_at <= now for p in entries),
        is_selected=(not user.selected_collection_id and user.selected_wordbook_id == source.id) if kind == "system" else user.selected_collection_id == source.id,
        is_default=source.is_default if kind == "personal" else False,
    )


def library_books(db: Session, user: User) -> list[BookSummary]:
    ensure_default_collection(db, user_id=user.id)
    system_ids = db.scalars(
        select(Wordbook.id).where(
            Wordbook.is_published.is_(True),
            or_(Wordbook.slug.is_(None), Wordbook.slug != "zhixian-core-en-v1"),
        ).order_by(Wordbook.id)
    ).all()
    personal_ids = db.scalars(select(VocabularyCollection.id).where(VocabularyCollection.user_id == user.id).order_by(VocabularyCollection.is_default.desc(), VocabularyCollection.id)).all()
    return [summarize_book(db, user, "system", id_) for id_ in system_ids] + [summarize_book(db, user, "personal", id_) for id_ in personal_ids]


def book_detail(db: Session, user: User, kind: str, id_: int, q: str, state: str, offset: int, limit: int) -> BookDetail:
    _, ids = source_words(db, user, kind, id_)
    statement = select(Word, UserWordProgress).outerjoin(UserWordProgress, (UserWordProgress.word_id == Word.id) & (UserWordProgress.user_id == user.id)).where(Word.id.in_(ids))
    if q.strip():
        statement = statement.where(or_(Word.term.ilike(f"%{q.strip()}%"), Word.translation.ilike(f"%{q.strip()}%")))
    if state == "new":
        statement = statement.where(UserWordProgress.last_reviewed_at.is_(None))
    elif state == "mastered":
        statement = statement.where(UserWordProgress.status == "mastered")
    elif state == "learning":
        statement = statement.where(UserWordProgress.last_reviewed_at.is_not(None), UserWordProgress.status != "mastered")
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    if kind == "system":
        statement = statement.join(WordbookWord, (WordbookWord.word_id == Word.id) & (WordbookWord.wordbook_id == id_)).order_by(WordbookWord.position)
    else:
        statement = statement.order_by(Word.id)
    rows = db.execute(statement.offset(offset).limit(limit)).all()
    return BookDetail(book=summarize_book(db, user, kind, id_), total=total, offset=offset, words=[BookWord(word=word, status=progress.status if progress and progress.last_reviewed_at else "new", mastery_score=progress.mastery_score if progress else 0) for word, progress in rows])
