from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User, VocabularyCollectionItem, VocabularyItem, Word
from app.schemas.workspace import AddTermsResult, BookDetail, BookSummary, BookTerms, PersonalBookCreate
from app.services.library import book_detail, library_books, source_words, summarize_book
from app.services.vocabulary_collections import VocabularyCollectionError, create_collection, delete_collection, remove_word, rename_collection

router = APIRouter(prefix="/library", tags=["词书工作台"])
Kind = Literal["system", "personal"]


def resolve(db, user, kind, id_):
    try:
        return source_words(db, user, kind, id_)
    except VocabularyCollectionError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("", response_model=list[BookSummary])
def list_books(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return library_books(db, user)


@router.post("/personal", response_model=BookSummary, status_code=201)
def create_book(payload: PersonalBookCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        book = create_collection(db, user_id=user.id, **payload.model_dump())
    except VocabularyCollectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    return summarize_book(db, user, "personal", book["id"])


@router.get("/{kind}/{id_}", response_model=BookDetail)
def detail(kind: Kind, id_: int, q: str = Query("", max_length=100), state: Literal["all", "new", "learning", "mastered"] = "all", offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resolve(db, user, kind, id_)
    return book_detail(db, user, kind, id_, q, state, offset, limit)


@router.post("/{kind}/{id_}/select", response_model=BookSummary)
def select_book(kind: Kind, id_: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resolve(db, user, kind, id_)
    user.selected_collection_id = id_ if kind == "personal" else None
    if kind == "system":
        user.selected_wordbook_id = id_
    db.commit()
    return summarize_book(db, user, kind, id_)


@router.patch("/personal/{id_}", response_model=BookSummary)
def update_book(id_: int, payload: PersonalBookCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book, _ = resolve(db, user, "personal", id_)
    try:
        rename_collection(db, user_id=user.id, collection_id=id_, name=payload.name)
    except VocabularyCollectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    book.description = payload.description.strip()
    db.commit()
    return summarize_book(db, user, "personal", id_)


@router.delete("/personal/{id_}", status_code=204)
def delete_book(id_: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resolve(db, user, "personal", id_)
    try:
        delete_collection(db, user_id=user.id, collection_id=id_)
    except VocabularyCollectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    return Response(status_code=204)


@router.post("/personal/{id_}/words", response_model=AddTermsResult)
def add_terms(id_: int, payload: BookTerms, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book, _ = resolve(db, user, "personal", id_)
    added = existing = 0
    missing = []
    for term in payload.terms:
        word = db.scalar(select(Word).where(Word.term == term))
        if word is None:
            missing.append(term)
            continue
        item = db.scalar(select(VocabularyItem).where(VocabularyItem.user_id == user.id, VocabularyItem.word_id == word.id))
        if item is None:
            item = VocabularyItem(user_id=user.id, word_id=word.id, source_type="manual")
            db.add(item)
            db.flush()
        link = db.scalar(select(VocabularyCollectionItem).where(VocabularyCollectionItem.collection_id == book.id, VocabularyCollectionItem.vocabulary_item_id == item.id))
        if link:
            existing += 1
        else:
            db.add(VocabularyCollectionItem(collection_id=book.id, vocabulary_item_id=item.id))
            added += 1
    db.commit()
    return AddTermsResult(added=added, existing=existing, missing=missing)


@router.delete("/personal/{id_}/words/{word_id}", status_code=204)
def remove_term(id_: int, word_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resolve(db, user, "personal", id_)
    word = db.get(Word, word_id)
    if word:
        remove_word(db, user_id=user.id, term=word.term, collection_id=id_)
    return Response(status_code=204)
