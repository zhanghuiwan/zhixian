from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User, UserWordProgress, Wordbook, WordbookWord
from app.schemas import WordbookRead

router = APIRouter(prefix="/wordbooks", tags=["词书"])


def serialize_wordbook(wordbook: Wordbook, user: User, db: Session) -> WordbookRead:
    word_ids = select(WordbookWord.word_id).where(WordbookWord.wordbook_id == wordbook.id)
    word_count = db.scalar(
        select(func.count()).select_from(WordbookWord).where(WordbookWord.wordbook_id == wordbook.id)
    ) or 0
    learned_count = db.scalar(
        select(func.count()).select_from(UserWordProgress).where(
            UserWordProgress.user_id == user.id, UserWordProgress.word_id.in_(word_ids)
        )
    ) or 0
    mastered_count = db.scalar(
        select(func.count()).select_from(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.word_id.in_(word_ids),
            UserWordProgress.status == "mastered",
        )
    ) or 0
    return WordbookRead(
        id=wordbook.id,
        name=wordbook.name,
        description=wordbook.description,
        level=wordbook.level,
        cover_color=wordbook.cover_color,
        word_count=word_count,
        learned_count=learned_count,
        mastered_count=mastered_count,
        is_selected=user.selected_wordbook_id == wordbook.id,
    )


@router.get("", response_model=list[WordbookRead])
def list_wordbooks(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    wordbooks = db.scalars(
        select(Wordbook).where(Wordbook.is_published.is_(True)).order_by(Wordbook.id)
    ).all()
    return [serialize_wordbook(item, current_user, db) for item in wordbooks]


@router.post("/{wordbook_id}/select", response_model=WordbookRead)
def select_wordbook(
    wordbook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wordbook = db.get(Wordbook, wordbook_id)
    if wordbook is None or not wordbook.is_published:
        raise HTTPException(status_code=404, detail="词书不存在")
    current_user.selected_wordbook_id = wordbook.id
    current_user.selected_collection_id = None
    db.commit()
    return serialize_wordbook(wordbook, current_user, db)
