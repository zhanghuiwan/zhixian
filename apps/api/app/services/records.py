from collections import defaultdict
from datetime import UTC, date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Article, ReadingActivity, SentenceBookmark, StudyReview, User, VocabularyItem
from app.schemas.workspace import DayRecord, RecordArticle, RecordBook, RecordWord
from app.services.learning_insights import user_zone, utc_day_bounds
from app.services.reading import visible_articles
from app.services.study_workspace import first_reviews


def period_records(db: Session, user: User, start_day: date, end_day: date) -> list[DayRecord]:
    start, _ = utc_day_bounds(start_day, user.timezone)
    end, _ = utc_day_bounds(end_day, user.timezone)
    zone = user_zone(user.timezone)
    def day_of(timestamp):
        return timestamp.replace(tzinfo=UTC).astimezone(zone).date()
    first = {row.word_id: day_of(row.first_at) for row in db.execute(select(first_reviews(user.id))).all()}
    reviews = db.scalars(select(StudyReview).options(joinedload(StudyReview.word)).where(StudyReview.user_id == user.id, StudyReview.reviewed_at >= start, StudyReview.reviewed_at < end).order_by(StudyReview.reviewed_at, StudyReview.id)).all()
    buckets = defaultdict(list)
    for review in reviews:
        buckets[day_of(review.reviewed_at)].append(review)
    readings = defaultdict(list)
    for activity, article in db.execute(select(ReadingActivity, Article).join(Article, Article.id == ReadingActivity.article_id).where(ReadingActivity.user_id == user.id, ReadingActivity.day >= start_day, ReadingActivity.day < end_day, visible_articles(user))).all():
        readings[activity.day].append(RecordArticle(id=article.id, title=article.title, percent=activity.percent, completed=activity.completed))
    saved_words, saved_sentences = defaultdict(int), defaultdict(int)
    for timestamp in db.scalars(select(VocabularyItem.created_at).where(VocabularyItem.user_id == user.id, VocabularyItem.created_at >= start, VocabularyItem.created_at < end)).all():
        saved_words[day_of(timestamp)] += 1
    for timestamp in db.scalars(select(SentenceBookmark.created_at).where(SentenceBookmark.user_id == user.id, SentenceBookmark.is_example.is_(False), SentenceBookmark.created_at >= start, SentenceBookmark.created_at < end)).all():
        saved_sentences[day_of(timestamp)] += 1
    output = []
    day = start_day
    while day < end_day:
        rows = buckets[day]
        words = {r.word_id: r for r in rows}
        groups = defaultdict(set)
        for r in rows:
            groups[(r.source_kind, r.source_id, r.source_name)].add(r.word_id)
        new_count = sum(first[word_id] == day for word_id in words)
        output.append(DayRecord(date=day, new_count=new_count, review_count=len(words) - new_count, attempts=sum(r.attempt_count for r in rows), word_count=len(words), reading_count=len(readings[day]), saved_words=saved_words[day], saved_sentences=saved_sentences[day], books=[RecordBook(kind=k, id=id_, name=name, word_count=len(ids)) for (k, id_, name), ids in groups.items()], words=[RecordWord(id=r.word_id, term=r.word.term, translation=r.word.translation, rating=r.rating, mode="new" if first[r.word_id] == day else "review") for r in words.values()], articles=readings[day]))
        day += timedelta(days=1)
    return output
