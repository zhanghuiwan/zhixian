from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    DailyStudyPlan,
    DailyStudyPlanItem,
    StudyReview,
    User,
    UserWordProgress,
    Word,
    WordbookWord,
)


def user_zone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Asia/Shanghai")


def local_today(user: User, *, now: datetime | None = None) -> date:
    instant = now or datetime.now(UTC)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=UTC)
    return instant.astimezone(user_zone(user.timezone)).date()


def utc_day_bounds(day: date, timezone_name: str) -> tuple[datetime, datetime]:
    zone = user_zone(timezone_name)
    start = datetime.combine(day, time.min, zone).astimezone(UTC).replace(tzinfo=None)
    end = datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(UTC).replace(
        tzinfo=None
    )
    return start, end


def learning_history(db: Session, *, user: User, day: date) -> dict:
    start, end = utc_day_bounds(day, user.timezone)
    reviews = db.scalars(
        select(StudyReview)
        .options(joinedload(StudyReview.word))
        .where(
            StudyReview.user_id == user.id,
            StudyReview.reviewed_at >= start,
            StudyReview.reviewed_at < end,
        )
        .order_by(StudyReview.reviewed_at)
    ).all()
    unique_words: dict[int, dict] = {}
    ratings: dict[str, int] = defaultdict(int)
    for review in reviews:
        ratings[review.rating] += 1
        unique_words[review.word_id] = {
            "id": review.word_id,
            "term": review.word.term,
            "translation": review.word.translation,
            "last_rating": review.rating,
            "reviewed_at": review.reviewed_at.isoformat(),
        }
    return {
        "date": day.isoformat(),
        "timezone": user.timezone,
        "review_count": len(reviews),
        "word_count": len(unique_words),
        "ratings": dict(ratings),
        "words": list(unique_words.values()),
    }


def _plan_candidates(db: Session, *, user: User, day: date) -> list[tuple[Word, str]]:
    _, day_end = utc_day_bounds(day, user.timezone)
    due_progress = db.scalars(
        select(UserWordProgress)
        .options(joinedload(UserWordProgress.word))
        .where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.next_review_at < day_end,
        )
        .order_by(UserWordProgress.next_review_at)
    ).all()
    candidates: list[tuple[Word, str]] = [(progress.word, "review") for progress in due_progress]
    used_ids = {word.id for word, _ in candidates}
    if user.selected_wordbook_id:
        learned_ids = select(UserWordProgress.word_id).where(UserWordProgress.user_id == user.id)
        new_words = db.scalars(
            select(Word)
            .join(WordbookWord, WordbookWord.word_id == Word.id)
            .where(
                WordbookWord.wordbook_id == user.selected_wordbook_id,
                Word.id.not_in(learned_ids),
                Word.id.not_in(used_ids) if used_ids else True,
            )
            .order_by(WordbookWord.position)
            .limit(user.daily_new_words)
        ).all()
        candidates.extend((word, "new") for word in new_words)
    return candidates


def get_review_plan(db: Session, *, user: User, day: date) -> dict:
    today = local_today(user)
    is_forecast = day > today
    plan = db.execute(
        select(DailyStudyPlan)
        .options(
            joinedload(DailyStudyPlan.items).joinedload(DailyStudyPlanItem.word)
        )
        .where(DailyStudyPlan.user_id == user.id, DailyStudyPlan.plan_date == day)
    ).unique().scalar_one_or_none()
    if plan is None and day == today:
        plan = DailyStudyPlan(
            user_id=user.id,
            plan_date=day,
            timezone=user.timezone,
            algorithm_version="v1",
            is_forecast=False,
        )
        db.add(plan)
        db.flush()
        for position, (word, item_type) in enumerate(
            _plan_candidates(db, user=user, day=day), start=1
        ):
            plan.items.append(
                DailyStudyPlanItem(
                    word_id=word.id, item_type=item_type, position=position, word=word
                )
            )
        db.commit()
        db.refresh(plan)
    if plan is not None:
        items = [
            {
                "word_id": item.word_id,
                "term": item.word.term,
                "translation": item.word.translation,
                "type": item.item_type,
                "completed": item.completed_at is not None,
            }
            for item in plan.items
        ]
        is_forecast = plan.is_forecast
    else:
        items = [
            {
                "word_id": word.id,
                "term": word.term,
                "translation": word.translation,
                "type": item_type,
                "completed": False,
            }
            for word, item_type in _plan_candidates(db, user=user, day=day)
        ]
    return {
        "date": day.isoformat(),
        "timezone": user.timezone,
        "is_forecast": is_forecast,
        "notice": "预测计划可能随今天的学习结果变化" if is_forecast else "",
        "review_count": sum(item["type"] == "review" for item in items),
        "new_count": sum(item["type"] == "new" for item in items),
        "completed_count": sum(item["completed"] for item in items),
        "items": items,
    }


def mark_plan_item_completed(
    db: Session, *, user: User, word_id: int, reviewed_at: datetime
) -> None:
    aware = reviewed_at.replace(tzinfo=UTC) if reviewed_at.tzinfo is None else reviewed_at
    day = aware.astimezone(user_zone(user.timezone)).date()
    plan = db.scalar(
        select(DailyStudyPlan).where(
            DailyStudyPlan.user_id == user.id, DailyStudyPlan.plan_date == day
        )
    )
    if plan is None:
        return
    item = db.scalar(
        select(DailyStudyPlanItem).where(
            DailyStudyPlanItem.plan_id == plan.id,
            DailyStudyPlanItem.word_id == word_id,
            DailyStudyPlanItem.completed_at.is_(None),
        )
    )
    if item:
        item.completed_at = reviewed_at


def difficult_words(db: Session, *, user: User, days: int = 30, limit: int = 10) -> dict:
    since = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)
    reviews = db.scalars(
        select(StudyReview)
        .options(joinedload(StudyReview.word))
        .where(StudyReview.user_id == user.id, StudyReview.reviewed_at >= since)
    ).all()
    grouped: dict[int, dict] = {}
    for review in reviews:
        entry = grouped.setdefault(
            review.word_id,
            {
                "word_id": review.word_id,
                "term": review.word.term,
                "translation": review.word.translation,
                "attempts": 0,
                "difficult_attempts": 0,
            },
        )
        entry["attempts"] += review.attempt_count
        if review.score_history:
            entry["difficult_attempts"] += review.forgotten_count + review.fuzzy_count
        elif review.rating in {"again", "hard"}:
            entry["difficult_attempts"] += 1
    for entry in grouped.values():
        entry["difficulty_rate"] = round(
            entry["difficult_attempts"] / entry["attempts"], 3
        )
    ranked = sorted(
        grouped.values(),
        key=lambda item: (item["difficulty_rate"], item["attempts"]),
        reverse=True,
    )[:limit]
    return {"days": days, "count": len(ranked), "words": ranked}
