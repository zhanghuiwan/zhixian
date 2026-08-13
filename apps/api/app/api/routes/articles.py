from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Article, ArticleSentence, SentenceBookmark, User, Word
from app.schemas import ArticleDetail, ArticleListItem, BookmarkRead, SentenceRead, WordRead

router = APIRouter(tags=["文章"])


@router.get("/articles", response_model=list[ArticleListItem])
def list_articles(db: Session = Depends(get_db)):
    return db.scalars(
        select(Article).where(Article.is_published.is_(True)).order_by(Article.created_at.desc())
    ).all()


@router.get("/articles/bookmarks", response_model=list[BookmarkRead])
def list_bookmarks(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    bookmarks = db.scalars(
        select(SentenceBookmark)
        .options(selectinload(SentenceBookmark.sentence).selectinload(ArticleSentence.article))
        .where(SentenceBookmark.user_id == current_user.id)
        .order_by(SentenceBookmark.created_at.desc())
    ).all()
    return [
        BookmarkRead(
            id=item.id,
            sentence_id=item.sentence_id,
            article_id=item.sentence.article_id,
            article_title=item.sentence.article.title,
            text=item.sentence.text,
            translation=item.sentence.translation,
            created_at=item.created_at,
        )
        for item in bookmarks
    ]


@router.get("/articles/{article_id}", response_model=ArticleDetail)
def get_article(
    article_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    article = db.scalar(
        select(Article).options(selectinload(Article.sentences)).where(Article.id == article_id)
    )
    if article is None or not article.is_published:
        raise HTTPException(status_code=404, detail="文章不存在")
    bookmark_ids = set(
        db.scalars(
            select(SentenceBookmark.sentence_id).where(SentenceBookmark.user_id == current_user.id)
        ).all()
    )
    return ArticleDetail(
        id=article.id,
        title=article.title,
        title_zh=article.title_zh,
        summary=article.summary,
        level=article.level,
        topic=article.topic,
        read_minutes=article.read_minutes,
        cover_gradient=article.cover_gradient,
        sentences=[
            SentenceRead(
                id=item.id,
                position=item.position,
                text=item.text,
                translation=item.translation,
                is_bookmarked=item.id in bookmark_ids,
            )
            for item in article.sentences
        ],
    )


@router.get("/words/lookup", response_model=WordRead)
def lookup_word(
    term: str = Query(min_length=1, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cleaned = term.strip().lower().strip(".,!?;:'\"()[]{}")
    word = db.scalar(select(Word).where(Word.term == cleaned))
    if word is None:
        raise HTTPException(status_code=404, detail="内置词典暂未收录该词")
    return word


@router.post("/articles/sentences/{sentence_id}/bookmark", response_model=BookmarkRead)
def bookmark_sentence(
    sentence_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sentence = db.scalar(
        select(ArticleSentence)
        .options(selectinload(ArticleSentence.article))
        .where(ArticleSentence.id == sentence_id)
    )
    if sentence is None:
        raise HTTPException(status_code=404, detail="句子不存在")
    bookmark = db.scalar(
        select(SentenceBookmark).where(
            SentenceBookmark.user_id == current_user.id,
            SentenceBookmark.sentence_id == sentence_id,
        )
    )
    if bookmark is None:
        bookmark = SentenceBookmark(user_id=current_user.id, sentence_id=sentence_id)
        db.add(bookmark)
        db.commit()
        db.refresh(bookmark)
    return BookmarkRead(
        id=bookmark.id,
        sentence_id=sentence.id,
        article_id=sentence.article_id,
        article_title=sentence.article.title,
        text=sentence.text,
        translation=sentence.translation,
        created_at=bookmark.created_at,
    )


@router.delete("/articles/sentences/{sentence_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
def remove_bookmark(
    sentence_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bookmark = db.scalar(
        select(SentenceBookmark).where(
            SentenceBookmark.user_id == current_user.id,
            SentenceBookmark.sentence_id == sentence_id,
        )
    )
    if bookmark is not None:
        db.delete(bookmark)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

