from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.routes.wordbooks import serialize_wordbook
from app.db.session import get_db
from app.models import StudyReview, User, UserWordProgress, VocabularyItem, Wordbook
from app.schemas import DashboardRead, RecentActivity

router = APIRouter(prefix="/dashboard", tags=["仪表盘"])


@router.get("", response_model=DashboardRead)
def dashboard(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    now = datetime.now(UTC).replace(tzinfo=None)
    today_start = datetime.combine(now.date(), time.min)
    due_today = db.scalar(
        select(func.count()).select_from(UserWordProgress).where(
            UserWordProgress.user_id == current_user.id,
            UserWordProgress.next_review_at <= now,
        )
    ) or 0
    studied_today = db.scalar(
        select(func.count()).select_from(StudyReview).where(
            StudyReview.user_id == current_user.id, StudyReview.reviewed_at >= today_start
        )
    ) or 0
    mastered_words = db.scalar(
        select(func.count()).select_from(UserWordProgress).where(
            UserWordProgress.user_id == current_user.id, UserWordProgress.status == "mastered"
        )
    ) or 0
    vocabulary_count = db.scalar(
        select(func.count()).select_from(VocabularyItem).where(
            VocabularyItem.user_id == current_user.id
        )
    ) or 0

    review_days = db.scalars(
        select(func.date(StudyReview.reviewed_at))
        .where(StudyReview.user_id == current_user.id)
        .distinct()
        .order_by(func.date(StudyReview.reviewed_at).desc())
    ).all()
    normalized_days = {
        value if isinstance(value, str) else value.isoformat() for value in review_days
    }
    streak_days = 0
    cursor = now.date()
    if cursor.isoformat() not in normalized_days:
        cursor -= timedelta(days=1)
    while cursor.isoformat() in normalized_days:
        streak_days += 1
        cursor -= timedelta(days=1)

    reviews = db.scalars(
        select(StudyReview)
        .options(joinedload(StudyReview.word))
        .where(StudyReview.user_id == current_user.id)
        .order_by(StudyReview.reviewed_at.desc())
        .limit(5)
    ).all()
    wordbook = db.get(Wordbook, current_user.selected_wordbook_id) if current_user.selected_wordbook_id else None
    return DashboardRead(
        due_today=due_today,
        studied_today=studied_today,
        mastered_words=mastered_words,
        vocabulary_count=vocabulary_count,
        streak_days=streak_days,
        current_wordbook=serialize_wordbook(wordbook, current_user, db) if wordbook else None,
        recent_activity=[
            RecentActivity(
                word=item.word.term,
                translation=item.word.translation,
                rating=item.rating,
                reviewed_at=item.reviewed_at,
            )
            for item in reviews
        ],
    )
