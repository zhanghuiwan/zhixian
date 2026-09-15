from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import bearer_scheme, get_current_user
from app.db.session import get_db
from app.models import Article, ArticleSentence, ReadingProgress, SentenceBookmark, User, Word
from app.schemas import ArticleDetail, ArticleListItem, BookmarkRead, WordRead
from app.schemas.workspace import ArticleImportCreate, BookmarkCreate, BookmarkPage, BookmarkUpdate, ReadingResult, ReadingUpdate
from app.services.reading import ReadingError, article_detail, article_summary, bookmark_read, create_bookmark, import_article_text, owned_article, save_reading, visible_articles
from app.services.custom_words import visible_word_clause

router = APIRouter(tags=["文章与句子"])


def optional_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme), db: Session = Depends(get_db)):
    return get_current_user(credentials, db) if credentials else None


@router.get("/articles", response_model=list[ArticleListItem])
def list_articles(user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    articles = db.scalars(select(Article).where(visible_articles(user)).order_by(Article.created_at.desc(), Article.id.desc())).all()
    progress = {p.article_id: p for p in db.scalars(select(ReadingProgress).where(ReadingProgress.user_id == user.id)).all()} if user else {}
    return [article_summary(a, progress.get(a.id)) for a in articles]


@router.post("/articles/import-text", response_model=ArticleListItem, status_code=201)
def import_text_article(
    payload: ArticleImportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return article_summary(import_article_text(db, user, payload))
    except ReadingError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/articles/bookmarks", response_model=list[BookmarkRead])
def list_bookmarks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [bookmark_read(b) for b in db.scalars(select(SentenceBookmark).where(SentenceBookmark.user_id == user.id).order_by(SentenceBookmark.created_at.desc())).all()]


@router.get("/sentences", response_model=BookmarkPage)
def sentences(q: str = Query("", max_length=100), source: str = Query("all", pattern="^(all|article|manual|ai|example)$"), offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    statement = select(SentenceBookmark).where(SentenceBookmark.user_id == user.id)
    if q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where(or_(SentenceBookmark.text.ilike(pattern), SentenceBookmark.translation.ilike(pattern), SentenceBookmark.note.ilike(pattern), SentenceBookmark.source_title.ilike(pattern)))
    if source == "example":
        statement = statement.where(SentenceBookmark.is_example.is_(True))
    elif source != "all":
        statement = statement.where(SentenceBookmark.source_type == source)
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = db.scalars(statement.order_by(SentenceBookmark.created_at.desc(), SentenceBookmark.id.desc()).offset(offset).limit(limit)).all()
    return BookmarkPage(items=[bookmark_read(b) for b in rows], total=total, offset=offset)


@router.post("/sentences", response_model=BookmarkRead, status_code=201)
def save_sentence(payload: BookmarkCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return bookmark_read(create_bookmark(db, user, payload))
    except ReadingError as exc:
        raise HTTPException(404, str(exc)) from exc


def owned_bookmark(db, user, id_):
    item = db.scalar(select(SentenceBookmark).where(SentenceBookmark.id == id_, SentenceBookmark.user_id == user.id))
    if item is None:
        raise HTTPException(404, "收藏不存在")
    return item


@router.patch("/sentences/{id_}", response_model=BookmarkRead)
def edit_sentence(id_: int, payload: BookmarkUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = owned_bookmark(db, user, id_)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    return bookmark_read(item)


@router.delete("/sentences/{id_}", status_code=204)
def delete_sentence(id_: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(owned_bookmark(db, user, id_))
    db.commit()
    return Response(status_code=204)


@router.get("/articles/{article_id}", response_model=ArticleDetail)
def get_article(article_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return article_detail(db, user, article_id)
    except ReadingError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.put("/articles/{article_id}/progress", response_model=ReadingResult)
def update_progress(article_id: int, payload: ReadingUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return save_reading(db, user, article_id, payload)
    except ReadingError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/words/lookup", response_model=WordRead)
def lookup_word(term: str = Query(min_length=1, max_length=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cleaned = term.strip().lower().strip(".,!?;:'\"()[]{}“”")
    irregular = {"was": "be", "were": "be", "is": "be", "are": "be", "went": "go", "gone": "go", "children": "child", "better": "good", "mice": "mouse", "thought": "think", "made": "make"}
    candidates = [cleaned, irregular.get(cleaned, cleaned)]
    if cleaned.endswith("ies"):
        candidates.append(cleaned[:-3] + "y")
    if cleaned.endswith("s"):
        candidates.extend([cleaned[:-1], cleaned[:-2]])
    for suffix in ("ing", "ed"):
        if cleaned.endswith(suffix) and len(cleaned) > len(suffix) + 2:
            stem = cleaned[:-len(suffix)]
            candidates.extend([stem, stem + "e"])
            if len(stem) > 2 and stem[-1] == stem[-2]:
                candidates.append(stem[:-1])
    matches = {
        word.term: word
        for word in db.scalars(
            select(Word).where(
                Word.term.in_(candidates),
                visible_word_clause(user.id),
            )
        ).all()
    }
    for candidate in candidates:
        if candidate in matches:
            return matches[candidate]
    raise HTTPException(404, "词库暂未收录，可以让 AI 解释并加入“我的新增单词”")


@router.post("/articles/sentences/{sentence_id}/bookmark", response_model=BookmarkRead)
def bookmark_sentence(sentence_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sentence = db.scalar(select(ArticleSentence).join(Article).where(ArticleSentence.id == sentence_id, visible_articles(user)))
    if sentence is None:
        raise HTTPException(404, "句子不存在")
    try:
        return bookmark_read(create_bookmark(db, user, BookmarkCreate(text=sentence.text, translation=sentence.translation, article_id=sentence.article_id)))
    except ReadingError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/articles/sentences/{sentence_id}/bookmark", status_code=204)
def remove_bookmark(sentence_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bookmark = db.scalar(select(SentenceBookmark).where(SentenceBookmark.user_id == user.id, SentenceBookmark.sentence_id == sentence_id))
    if bookmark:
        db.delete(bookmark)
        db.commit()
    return Response(status_code=204)
