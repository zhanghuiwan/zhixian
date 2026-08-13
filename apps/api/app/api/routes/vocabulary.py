from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User, UserWordProgress, VocabularyItem, Word
from app.schemas import VocabularyCreate, VocabularyRead

router = APIRouter(prefix="/vocabulary", tags=["生词本"])


def serialize_item(item: VocabularyItem, mastery_score: int = 0) -> VocabularyRead:
    return VocabularyRead(
        id=item.id,
        word=item.word,
        source_type=item.source_type,
        source_ref=item.source_ref,
        note=item.note,
        mastery_score=mastery_score,
        created_at=item.created_at,
    )


@router.get("", response_model=list[VocabularyRead])
def list_vocabulary(
    q: str = Query(default="", max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = (
        select(VocabularyItem, UserWordProgress.mastery_score)
        .join(Word, VocabularyItem.word_id == Word.id)
        .outerjoin(
            UserWordProgress,
            (UserWordProgress.word_id == VocabularyItem.word_id)
            & (UserWordProgress.user_id == current_user.id),
        )
        .options(joinedload(VocabularyItem.word))
        .where(VocabularyItem.user_id == current_user.id)
        .order_by(VocabularyItem.created_at.desc())
    )
    if q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where(or_(Word.term.ilike(pattern), Word.translation.ilike(pattern)))
    return [serialize_item(item, mastery or 0) for item, mastery in db.execute(statement).all()]


@router.post("", response_model=VocabularyRead, status_code=status.HTTP_201_CREATED)
def add_vocabulary(
    payload: VocabularyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    word = db.get(Word, payload.word_id)
    if word is None:
        raise HTTPException(status_code=404, detail="单词不存在")
    existing = db.scalar(
        select(VocabularyItem).where(
            VocabularyItem.user_id == current_user.id, VocabularyItem.word_id == payload.word_id
        )
    )
    if existing:
        existing.word = word
        progress = db.scalar(
            select(UserWordProgress).where(
                UserWordProgress.user_id == current_user.id,
                UserWordProgress.word_id == payload.word_id,
            )
        )
        return serialize_item(existing, progress.mastery_score if progress else 0)
    item = VocabularyItem(user_id=current_user.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    item.word = word
    return serialize_item(item)


@router.delete("/{word_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_vocabulary(
    word_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(VocabularyItem).where(
            VocabularyItem.user_id == current_user.id, VocabularyItem.word_id == word_id
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="生词不存在")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

