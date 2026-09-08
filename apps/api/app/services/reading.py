import hashlib

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AIConversation, Article, ArticleSentence, ReadingActivity, ReadingProgress, SentenceBookmark, User
from app.models.entities import utc_now
from app.schemas.common import ArticleDetail, ArticleListItem, BookmarkRead, SentenceRead
from app.schemas.workspace import BookmarkCreate, ReadingResult, ReadingUpdate
from app.services.learning_insights import local_today


class ReadingError(ValueError):
    pass


def visible_articles(user: User | None):
    public = and_(Article.owner_user_id.is_(None), Article.is_published.is_(True))
    return or_(public, Article.owner_user_id == user.id) if user else public


def owned_article(db: Session, user: User, article_id: int) -> Article:
    article = db.scalar(select(Article).where(Article.id == article_id, visible_articles(user)))
    if article is None:
        raise ReadingError("文章不存在")
    return article


def article_summary(article: Article, progress: ReadingProgress | None = None) -> ArticleListItem:
    return ArticleListItem(
        id=article.id, title=article.title, title_zh=article.title_zh, summary=article.summary,
        level=article.level, topic=article.topic, read_minutes=article.read_minutes,
        cover_gradient=article.cover_gradient, source_type=article.source_type,
        is_private=article.owner_user_id is not None,
        progress=progress.percent if progress else 0,
        is_completed=bool(progress and progress.completed_at),
    )


def article_detail(db: Session, user: User, article_id: int) -> ArticleDetail:
    article = owned_article(db, user, article_id)
    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.user_id == user.id, ReadingProgress.article_id == article_id))
    bookmarks = set(db.scalars(select(SentenceBookmark.sentence_id).where(SentenceBookmark.user_id == user.id, SentenceBookmark.article_id == article_id)).all())
    return ArticleDetail(**article_summary(article, progress).model_dump(), last_position=progress.position if progress else 1, sentences=[SentenceRead(id=s.id, position=s.position, text=s.text, translation=s.translation, is_bookmarked=s.id in bookmarks) for s in article.sentences])


def bookmark_read(item: SentenceBookmark) -> BookmarkRead:
    sentence = item.sentence
    return BookmarkRead(
        id=item.id, sentence_id=item.sentence_id,
        article_id=item.article_id or (sentence.article_id if sentence else None),
        article_title=item.source_title or (sentence.article.title if sentence else "手动收藏"),
        text=item.text or (sentence.text if sentence else ""),
        translation=item.translation or (sentence.translation if sentence else ""),
        source_type=item.source_type, source_ref=item.source_ref,
        note=item.note, tags=item.tags, is_example=item.is_example, created_at=item.created_at,
    )


def create_bookmark(db: Session, user: User, payload: BookmarkCreate, *, commit: bool = True) -> SentenceBookmark:
    source_type, source_title, source_ref = "manual", "手动收藏", None
    sentence_id = None
    if payload.article_id and payload.conversation_id:
        raise ReadingError("请选择一个收藏来源")
    if payload.article_id:
        article = owned_article(db, user, payload.article_id)
        normalized = " ".join(payload.text.split())
        if normalized not in " ".join(" ".join(s.text for s in article.sentences).split()):
            raise ReadingError("选中文字不在这篇文章中，请重新选择")
        sentence_id = next((s.id for s in article.sentences if " ".join(s.text.split()) == normalized), None)
        source_type, source_title, source_ref = "article", article.title, str(article.id)
    elif payload.conversation_id:
        conversation = db.scalar(select(AIConversation).where(AIConversation.id == payload.conversation_id, AIConversation.user_id == user.id))
        if conversation is None:
            raise ReadingError("对话不存在")
        source_type, source_title, source_ref = "ai", conversation.title, str(conversation.id)
    key = hashlib.sha256(f"{source_type}:{source_ref or ''}:{' '.join(payload.text.split())}".encode()).hexdigest()
    existing = db.scalar(select(SentenceBookmark).where(SentenceBookmark.user_id == user.id, SentenceBookmark.dedup_key == key))
    if existing is None and sentence_id:
        existing = db.scalar(select(SentenceBookmark).where(SentenceBookmark.user_id == user.id, SentenceBookmark.sentence_id == sentence_id))
    if existing:
        return existing
    item = SentenceBookmark(
        user_id=user.id, sentence_id=sentence_id, article_id=payload.article_id,
        text=payload.text.strip(), translation=payload.translation.strip(),
        source_type=source_type, source_title=source_title, source_ref=source_ref,
        note=payload.note, tags=payload.tags, dedup_key=key,
    )
    db.add(item)
    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(SentenceBookmark).where(SentenceBookmark.user_id == user.id, SentenceBookmark.dedup_key == key))
            if existing:
                return existing
            raise
        db.refresh(item)
    else:
        db.flush()
    return item


def save_reading(db: Session, user: User, article_id: int, payload: ReadingUpdate) -> ReadingResult:
    article = owned_article(db, user, article_id)
    if payload.position > len(article.sentences):
        raise ReadingError("阅读位置无效")
    now = utc_now()
    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.user_id == user.id, ReadingProgress.article_id == article.id))
    if progress is None:
        progress = ReadingProgress(user_id=user.id, article_id=article.id)
        db.add(progress)
    progress.position, progress.percent, progress.updated_at = payload.position, payload.percent, now
    if payload.completed:
        progress.completed_at = progress.completed_at or now
        progress.percent = 100
    today = local_today(user)
    activity = db.scalar(select(ReadingActivity).where(ReadingActivity.user_id == user.id, ReadingActivity.article_id == article.id, ReadingActivity.day == today))
    if activity is None:
        activity = ReadingActivity(user_id=user.id, article_id=article.id, day=today, percent=0)
        db.add(activity)
    activity.percent = max(activity.percent, progress.percent)
    activity.completed = bool(activity.completed or payload.completed)
    activity.updated_at = now
    db.commit()
    return ReadingResult(position=progress.position, percent=progress.percent, is_completed=progress.completed_at is not None)
