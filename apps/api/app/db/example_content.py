"""Original learning examples, versioned with the application."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Article, User
from app.schemas.workspace import BookmarkCreate
from app.services.reading import create_bookmark

EXAMPLE_ARTICLES = [
    {
        "slug": "learning-to-ask-better-questions",
        "title": "Learning to Ask Better Questions",
        "title_zh": "学会提出更好的问题",
        "summary": "把 AI 变成学习伙伴，从描述一个真正困扰你的问题开始。",
        "level": "B1", "topic": "AI 与学习", "read_minutes": 3, "cover_gradient": "forest",
        "sentences": [
            ("A useful conversation often begins with a small, specific question.", "一段有帮助的对话，常常从一个具体的小问题开始。"),
            ("When Maya started learning English with an AI assistant, she asked it to explain everything at once.", "玛雅刚开始和 AI 助手学英语时，总是让它一次解释所有内容。"),
            ("The answers were long, but she still found it difficult to use the new words.", "回答很长，但她依然觉得新单词用起来很困难。"),
            ("One afternoon, she tried a different approach: she brought a sentence from an article she was reading.", "一天下午，她尝试了另一种方法：带来自己正在读的文章中的一句话。"),
            ("Instead of asking for a translation alone, she asked why the writer had chosen one word rather than another.", "她没有只要求翻译，而是问作者为什么选择这个词而不是另一个。"),
            ("The explanation helped her notice a difference she had missed before.", "解释帮助她注意到一个之前忽略的区别。"),
            ("She saved the sentence, wrote her own example, and returned to it the next morning.", "她收藏了这个句子，写下自己的例句，并在第二天早上重新看了一遍。"),
            ("A good question does more than request an answer; it gives your attention a direction.", "一个好问题不只是索取答案，它还为你的注意力指明方向。"),
            ("An assistant can offer possibilities, but you still need to compare them with the original context.", "助手可以提供多种可能，但你仍需要结合原始语境进行比较。"),
            ("Learning becomes more useful when you turn an explanation into something you can actually say.", "当你把解释变成自己真正能说出的话，学习就会变得更有用。"),
        ],
    },
    {
        "slug": "a-notebook-of-small-discoveries",
        "title": "A Notebook of Small Discoveries",
        "title_zh": "一本记录小发现的笔记",
        "summary": "在日常阅读中收集词语和句子，让它们慢慢成为自己的表达。",
        "level": "A2", "topic": "阅读与表达", "read_minutes": 2, "cover_gradient": "sunrise",
        "sentences": [
            ("Leo keeps a small notebook beside his desk.", "利奥在书桌旁放着一本小笔记本。"),
            ("Every evening, he reads a short story and chooses one sentence he likes.", "每天晚上，他读一篇短故事，并选出一个自己喜欢的句子。"),
            ("He does not try to remember every new word.", "他并不试图记住每一个新单词。"),
            ("He writes down the sentence and adds a note about where he found it.", "他把句子写下来，并记下它的出处。"),
            ("Sometimes he changes a few words to describe his own day.", "有时他会换掉几个词，用来描述自己的一天。"),
            ("A sentence about a quiet garden becomes a sentence about his favorite cafe.", "一个描写安静花园的句子，变成了一个描写他最喜欢的咖啡馆的句子。"),
            ("On Sunday, he reads his notes again and shares one idea with a friend.", "周日，他会再次阅读笔记，并和朋友分享其中一个想法。"),
            ("The notebook grows slowly, but every page belongs to him.", "笔记本的内容增长得很慢，但每一页都属于他自己。"),
        ],
    },
]


def ensure_example_bookmarks(db: Session, user: User) -> None:
    """Seed once. A deleted example must remain deleted across restarts."""
    if user.example_content_version >= 1:
        return
    articles = db.scalars(select(Article).where(Article.slug.in_([a["slug"] for a in EXAMPLE_ARTICLES]), Article.owner_user_id.is_(None), Article.source_type == "seed").order_by(Article.id)).all()
    if len(articles) != len(EXAMPLE_ARTICLES):
        return
    for article in articles:
        for position in (1, len(article.sentences)):
            sentence = article.sentences[position - 1]
            item = create_bookmark(db, user, BookmarkCreate(text=sentence.text, translation=sentence.translation, article_id=article.id, note="示例收藏：可以编辑笔记、询问 AI，或删除这条收藏。", tags=["示例", "实用表达"]), commit=False)
            item.is_example = True
    user.example_content_version = 1
    db.flush()
