import hashlib
import json
from datetime import UTC, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    StudyReview,
    StudySession,
    User,
    UserWordProgress,
    VocabularyItem,
    Word,
    WordbookWord,
)
from app.models.entities import utc_now
from app.schemas.common import (
    ReviewCreate,
    ReviewResult,
    StudyQueueItem,
    StudyQueueResponse,
    StudySessionComplete,
    StudySessionResult,
)
from app.services.learning_insights import local_today, mark_plan_item_completed, utc_day_bounds
from app.services.library import source_words
from app.services.custom_words import visible_word_by_id
from app.services.spaced_repetition import calculate_schedule
from app.services.vocabulary_collections import VocabularyCollectionError


class StudyError(ValueError):
    pass


def first_reviews(user_id: int):
    return select(StudyReview.word_id, func.min(StudyReview.reviewed_at).label("first_at")).where(StudyReview.user_id == user_id).group_by(StudyReview.word_id).subquery()


def remaining_new(db: Session, user: User) -> int:
    start, end = utc_day_bounds(local_today(user), user.timezone)
    first = first_reviews(user.id)
    count = db.scalar(select(func.count()).select_from(first).where(first.c.first_at >= start, first.c.first_at < end)) or 0
    return max(0, user.daily_new_words - count)


def current_source(user: User):
    if user.selected_collection_id:
        return "personal", user.selected_collection_id
    if user.selected_wordbook_id:
        return "system", user.selected_wordbook_id
    return None, None


def intervals(progress: UserWordProgress | None) -> dict[str, str]:
    result = {}
    for rating in ["again", "hard", "good", "easy"]:
        schedule = calculate_schedule(rating=rating, repetitions=progress.repetitions if progress else 0, interval_days=progress.interval_days if progress else 0, ease_factor=progress.ease_factor if progress else 2.5, mastery_score=progress.mastery_score if progress else 0)
        result[rating] = "10 分钟" if rating == "again" else f"{schedule.interval_days} 天"
    return result


def queue(db: Session, user: User, mode: str, kind: str | None, source_id: int | None, limit: int) -> StudyQueueResponse:
    now = utc_now()
    explicit = kind is not None
    ids = None
    source_name = "综合复习"
    if kind:
        source, ids = source_words(db, user, kind, source_id)
        source_name = source.name
    items = []
    due_count = 0
    if mode != "new":
        due_query = select(UserWordProgress).where(UserWordProgress.user_id == user.id, UserWordProgress.last_reviewed_at.is_not(None), UserWordProgress.next_review_at <= now)
        if ids is not None:
            due_query = due_query.where(UserWordProgress.word_id.in_(ids))
        due_count = db.scalar(select(func.count()).select_from(due_query.subquery())) or 0
        due = db.scalars(due_query.order_by(UserWordProgress.next_review_at, UserWordProgress.word_id).limit(limit)).all()
        items += [StudyQueueItem(word=p.word, mode="review", repetitions=p.repetitions, mastery_score=p.mastery_score, source_kind=kind or "all", source_id=source_id, source_name=source_name, intervals=intervals(p)) for p in due]
    budget = min(limit - len(items), remaining_new(db, user)) if mode != "review" else 0
    if budget:
        if kind is None:
            kind, source_id = current_source(user)
        if kind:
            source, ids = source_words(db, user, kind, source_id)
            source_name = source.name
        learned = select(UserWordProgress.word_id).where(UserWordProgress.user_id == user.id, UserWordProgress.last_reviewed_at.is_not(None))
        new_words = []
        # Collected words are real learning candidates, even before the first rating.
        if not explicit:
            new_words = db.scalars(select(Word).join(VocabularyItem).where(VocabularyItem.user_id == user.id, Word.id.not_in(learned)).order_by(VocabularyItem.created_at, Word.id).limit(budget)).all()
        if ids is not None and len(new_words) < budget:
            statement = select(Word).where(Word.id.in_(ids), Word.id.not_in(learned), Word.id.not_in([w.id for w in new_words]))
            if kind == "system":
                statement = statement.join(WordbookWord, (WordbookWord.word_id == Word.id) & (WordbookWord.wordbook_id == source_id)).order_by(WordbookWord.position)
            else:
                statement = statement.order_by(Word.id)
            new_words += db.scalars(statement.limit(budget - len(new_words))).all()
        for word in new_words:
            in_source = ids is not None and db.scalar(select(Word.id).where(Word.id == word.id, Word.id.in_(ids))) is not None
            items.append(StudyQueueItem(word=word, mode="new", repetitions=0, mastery_score=0, source_kind=kind if in_source else "all", source_id=source_id if in_source else None, source_name=source_name if in_source else "个人生词", intervals=intervals(None)))
    return StudyQueueResponse(items=items, due_count=due_count, new_count=sum(item.mode == "new" for item in items))


def submit(db: Session, user: User, payload: ReviewCreate) -> ReviewResult:
    # Serialize a user's ratings on PostgreSQL to protect both schedule and daily budget.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    if payload.request_id:
        old = db.scalar(select(StudyReview).where(StudyReview.user_id == user.id, StudyReview.request_id == payload.request_id))
        if old:
            if old.word_id != payload.word_id or old.rating != payload.rating or old.source_kind != payload.source_kind or old.source_id != payload.source_id:
                raise StudyError("这次评分已使用不同内容提交，请刷新学习页面")
            return ReviewResult.model_validate(old.result_snapshot)
    word = visible_word_by_id(db, user_id=user.id, word_id=payload.word_id)
    if word is None:
        raise StudyError("单词不存在")
    source_name = "综合复习" if payload.source_kind == "all" else "来源未记录"
    if payload.source_kind in {"system", "personal"}:
        source, ids = source_words(db, user, payload.source_kind, payload.source_id)
        if db.scalar(select(Word.id).where(Word.id == word.id, Word.id.in_(ids))) is None:
            raise StudyError("单词不在所选词书中")
        source_name = source.name
    progress = db.scalar(select(UserWordProgress).where(UserWordProgress.user_id == user.id, UserWordProgress.word_id == word.id))
    is_new = progress is None or progress.last_reviewed_at is None
    if is_new and remaining_new(db, user) == 0:
        raise StudyError("今天的新词目标已完成，可以继续复习或阅读")
    if progress is None:
        progress = UserWordProgress(user_id=user.id, word_id=word.id)
        db.add(progress)
        db.flush()
    now = utc_now()
    previous_interval = progress.interval_days
    schedule = calculate_schedule(rating=payload.rating, repetitions=progress.repetitions, interval_days=progress.interval_days, ease_factor=progress.ease_factor, mastery_score=progress.mastery_score, now=now)
    for name in ["repetitions", "interval_days", "ease_factor", "mastery_score", "status", "next_review_at"]:
        setattr(progress, name, getattr(schedule, name))
    progress.last_reviewed_at = now
    result = ReviewResult(word_id=word.id, status=progress.status, repetitions=progress.repetitions, interval_days=progress.interval_days, mastery_score=progress.mastery_score, next_review_at=progress.next_review_at)
    db.add(StudyReview(user_id=user.id, word_id=word.id, rating=payload.rating, previous_interval=previous_interval, next_interval=progress.interval_days, reviewed_at=now, source_kind=payload.source_kind, source_id=payload.source_id, source_name=source_name, mode="new" if is_new else "review", request_id=payload.request_id, result_snapshot=result.model_dump(mode="json")))
    mark_plan_item_completed(db, user=user, word_id=word.id, reviewed_at=now)
    db.commit()
    return result


def _session_rating(scores: list[int]) -> tuple[str, str]:
    """Return the stored three-level result and the compatibility scheduler input."""
    if any(score < 20 for score in scores):
        return "forgot", "again"
    if len(scores) > 1 or any(score < 80 for score in scores):
        return "fuzzy", "hard"
    return "remembered", "good"


def _naive_utc(value):
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def complete_session(
    db: Session, user: User, payload: StudySessionComplete
) -> StudySessionResult:
    """Commit one completed study group and update each word exactly once."""
    fingerprint = hashlib.sha256(
        json.dumps(
            payload.model_dump(mode="json"),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()

    db.scalar(select(User).where(User.id == user.id).with_for_update())
    existing = db.scalar(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.client_session_id == payload.session_id,
        )
    )
    if existing:
        if existing.payload_hash != fingerprint:
            raise StudyError("这个学习组已经用不同内容提交，请刷新学习页面")
        return StudySessionResult.model_validate(existing.result_snapshot)

    canonical_sources: dict[tuple[str, int | None], tuple[str, set[int] | None]] = {}

    def source_for(kind: str, source_id: int | None) -> tuple[str, set[int] | None]:
        key = (kind, source_id)
        if key in canonical_sources:
            return canonical_sources[key]
        if kind == "all":
            canonical_sources[key] = ("综合复习", None)
            return canonical_sources[key]
        source, word_ids = source_words(db, user, kind, source_id)
        canonical_sources[key] = (source.name, set(db.scalars(word_ids).all()))
        return canonical_sources[key]

    session_source_name, _ = source_for(payload.source_kind, payload.source_id)
    now = utc_now()
    attempt_count = sum(len(item.attempts) for item in payload.words)
    repeated_words = sum(len(item.attempts) > 1 for item in payload.words)
    session = StudySession(
        user_id=user.id,
        client_session_id=payload.session_id,
        mode=payload.mode,
        source_kind=payload.source_kind,
        source_id=payload.source_id,
        source_name=session_source_name,
        word_count=len(payload.words),
        attempt_count=attempt_count,
        repeated_words=repeated_words,
        round_count=payload.round_count,
        duration_ms=payload.duration_ms,
        started_at=_naive_utc(payload.started_at),
        completed_at=now,
        payload_hash=fingerprint,
        result_snapshot={},
    )
    db.add(session)
    db.flush()

    for item in payload.words:
        word = visible_word_by_id(db, user_id=user.id, word_id=item.word_id)
        if word is None:
            raise StudyError("学习组中包含不存在的单词")
        source_name, source_word_ids = source_for(item.source_kind, item.source_id)
        if source_word_ids is not None and word.id not in source_word_ids:
            raise StudyError("学习组中的单词不在所选词书中")

        progress = db.scalar(
            select(UserWordProgress).where(
                UserWordProgress.user_id == user.id,
                UserWordProgress.word_id == word.id,
            )
        )
        is_new = progress is None or progress.last_reviewed_at is None
        if progress is None:
            progress = UserWordProgress(user_id=user.id, word_id=word.id)
            db.add(progress)
            db.flush()

        scores = [attempt.score for attempt in item.attempts]
        rating, scheduler_rating = _session_rating(scores)
        previous_interval = progress.interval_days
        schedule = calculate_schedule(
            rating=scheduler_rating,
            repetitions=progress.repetitions,
            interval_days=progress.interval_days,
            ease_factor=progress.ease_factor,
            mastery_score=progress.mastery_score,
            now=now,
        )
        for name in [
            "repetitions",
            "interval_days",
            "ease_factor",
            "mastery_score",
            "status",
            "next_review_at",
        ]:
            setattr(progress, name, getattr(schedule, name))
        progress.last_reviewed_at = now
        result = ReviewResult(
            word_id=word.id,
            status=progress.status,
            repetitions=progress.repetitions,
            interval_days=progress.interval_days,
            mastery_score=progress.mastery_score,
            next_review_at=progress.next_review_at,
        )
        forgotten_count = sum(score < 20 for score in scores)
        fuzzy_count = sum(20 <= score < 80 for score in scores)
        attempt_history = [attempt.model_dump(mode="json") for attempt in item.attempts]
        db.add(
            StudyReview(
                user_id=user.id,
                word_id=word.id,
                rating=rating,
                previous_interval=previous_interval,
                next_interval=progress.interval_days,
                reviewed_at=now,
                source_kind=item.source_kind,
                source_id=item.source_id,
                source_name=source_name,
                mode="new" if is_new else "review",
                result_snapshot=result.model_dump(mode="json"),
                session_id=session.id,
                familiarity_score=scores[-1],
                attempt_count=len(scores),
                forgotten_count=forgotten_count,
                fuzzy_count=fuzzy_count,
                round_count=max(attempt.round_no for attempt in item.attempts),
                score_history=scores,
                attempt_history=attempt_history,
                revealed_count=sum(
                    attempt.revealed_before_answer for attempt in item.attempts
                ),
                response_ms_total=sum(attempt.response_ms for attempt in item.attempts),
            )
        )
        mark_plan_item_completed(db, user=user, word_id=word.id, reviewed_at=now)

    response = StudySessionResult(
        session_id=payload.session_id,
        word_count=len(payload.words),
        attempt_count=attempt_count,
        repeated_words=repeated_words,
        round_count=payload.round_count,
        duration_ms=payload.duration_ms,
        completed_at=now,
    )
    session.result_snapshot = response.model_dump(mode="json")
    db.commit()
    return response
