from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import StudyReview, User, UserWordProgress, VocabularyItem, Word, WordbookWord
from app.schemas import ReviewCreate, ReviewResult, StudyQueueItem, StudyQueueResponse
from app.services.spaced_repetition import calculate_schedule
from app.services.learning_insights import mark_plan_item_completed

router = APIRouter(prefix="/study", tags=["学习"])


@router.get("/queue", response_model=StudyQueueResponse)
def get_study_queue(
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(UTC).replace(tzinfo=None)
    due = db.scalars(
        select(UserWordProgress)
        .options(joinedload(UserWordProgress.word))
        .where(
            UserWordProgress.user_id == current_user.id,
            UserWordProgress.next_review_at <= now,
        )
        .order_by(UserWordProgress.next_review_at)
        .limit(limit)
    ).all()
    items = [
        StudyQueueItem(
            word=item.word,
            mode="review",
            repetitions=item.repetitions,
            mastery_score=item.mastery_score,
        )
        for item in due
    ]

    remaining = min(limit - len(items), current_user.daily_new_words)
    new_count = 0
    if remaining > 0 and current_user.selected_wordbook_id:
        learned_ids = select(UserWordProgress.word_id).where(UserWordProgress.user_id == current_user.id)
        new_words = db.scalars(
            select(Word)
            .join(WordbookWord, WordbookWord.word_id == Word.id)
            .where(
                WordbookWord.wordbook_id == current_user.selected_wordbook_id,
                Word.id.not_in(learned_ids),
            )
            .order_by(WordbookWord.position)
            .limit(remaining)
        ).all()
        items.extend(
            StudyQueueItem(word=word, mode="new", repetitions=0, mastery_score=0)
            for word in new_words
        )
        new_count = len(new_words)

    return StudyQueueResponse(items=items, due_count=len(due), new_count=new_count)


@router.post("/reviews", response_model=ReviewResult)
def submit_review(
    payload: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    word = db.get(Word, payload.word_id)
    if word is None:
        raise HTTPException(status_code=404, detail="单词不存在")

    progress = db.scalar(
        select(UserWordProgress).where(
            UserWordProgress.user_id == current_user.id,
            UserWordProgress.word_id == payload.word_id,
        )
    )
    if progress is None:
        progress = UserWordProgress(user_id=current_user.id, word_id=payload.word_id)
        db.add(progress)
        db.flush()

    previous_interval = progress.interval_days
    now = datetime.now(UTC).replace(tzinfo=None)
    schedule = calculate_schedule(
        rating=payload.rating,
        repetitions=progress.repetitions,
        interval_days=progress.interval_days,
        ease_factor=progress.ease_factor,
        mastery_score=progress.mastery_score,
        now=now,
    )
    progress.repetitions = schedule.repetitions
    progress.interval_days = schedule.interval_days
    progress.ease_factor = schedule.ease_factor
    progress.mastery_score = schedule.mastery_score
    progress.status = schedule.status
    progress.next_review_at = schedule.next_review_at
    progress.last_reviewed_at = now
    db.add(
        StudyReview(
            user_id=current_user.id,
            word_id=payload.word_id,
            rating=payload.rating,
            previous_interval=previous_interval,
            next_interval=schedule.interval_days,
            reviewed_at=now,
        )
    )
    mark_plan_item_completed(
        db, user=current_user, word_id=payload.word_id, reviewed_at=now
    )
    db.commit()
    db.refresh(progress)
    return progress
