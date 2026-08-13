from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models import Article, ArticleSentence, User, VocabularyItem, Word, Wordbook, WordbookWord

WORDS = [
    ("serendipity", "/ˌserənˈdɪpəti/", "n.", "意外发现美好事物的运气", "Finding that quiet café was pure serendipity.", "发现那家安静的咖啡馆纯属美好的偶遇。"),
    ("tranquil", "/ˈtræŋkwɪl/", "adj.", "宁静的；平静的", "The lake was tranquil in the early morning.", "清晨的湖面十分宁静。"),
    ("wander", "/ˈwɒndə(r)/", "v.", "漫步；徘徊", "We wandered through the old streets without a map.", "我们没有地图，漫步在老街中。"),
    ("glimpse", "/ɡlɪmps/", "n./v.", "一瞥；短暂看见", "She caught a glimpse of the sea between the houses.", "她从房屋之间瞥见了大海。"),
    ("subtle", "/ˈsʌtl/", "adj.", "细微的；巧妙的", "The tea has a subtle floral taste.", "这种茶带有淡淡的花香。"),
    ("resilient", "/rɪˈzɪliənt/", "adj.", "有韧性的；能恢复的", "Resilient people learn from difficult moments.", "有韧性的人会从艰难时刻中学习。"),
    ("curiosity", "/ˌkjʊəriˈɒsəti/", "n.", "好奇心", "Curiosity often leads us to unexpected ideas.", "好奇心常常把我们带向意想不到的想法。"),
    ("deliberate", "/dɪˈlɪbərət/", "adj.", "深思熟虑的；有意的", "She made a deliberate choice to slow down.", "她经过深思熟虑，选择放慢脚步。"),
    ("savor", "/ˈseɪvə(r)/", "v.", "细细品味；享受", "Take a moment to savor the first sip of coffee.", "花一点时间细细品味第一口咖啡。"),
    ("perspective", "/pəˈspektɪv/", "n.", "视角；观点", "Travel can change your perspective on daily life.", "旅行可以改变你看待日常生活的视角。"),
    ("rhythm", "/ˈrɪðəm/", "n.", "节奏；规律", "The town moves at a gentler rhythm on Sundays.", "星期日的小镇以更舒缓的节奏运转。"),
    ("meaningful", "/ˈmiːnɪŋfl/", "adj.", "有意义的", "Small conversations can become meaningful memories.", "短暂的交谈也能成为有意义的回忆。"),
    ("observe", "/əbˈzɜːv/", "v.", "观察；注意到", "Sit quietly and observe how the light changes.", "静静坐着，观察光线如何变化。"),
    ("habit", "/ˈhæbɪt/", "n.", "习惯", "A tiny habit is easier to repeat every day.", "微小的习惯更容易每天重复。"),
    ("restore", "/rɪˈstɔː(r)/", "v.", "恢复；修复", "A short walk can restore your attention.", "短暂散步可以恢复你的注意力。"),
    ("conscious", "/ˈkɒnʃəs/", "adj.", "有意识的；清醒的", "Be conscious of the words you choose.", "要有意识地选择你使用的词语。"),
    ("breathe", "/briːð/", "v.", "呼吸", "Pause and breathe before answering.", "回答前停一下，做个呼吸。"),
    ("landscape", "/ˈlændskeɪp/", "n.", "风景；景观", "Rain transformed the dry landscape.", "雨水改变了干燥的景观。"),
    ("ordinary", "/ˈɔːdnri/", "adj.", "普通的；平常的", "An ordinary afternoon can still feel special.", "一个普通的下午仍然可以很特别。"),
    ("encounter", "/ɪnˈkaʊntə(r)/", "n./v.", "相遇；遇到", "Every encounter offers a chance to listen.", "每一次相遇都提供了倾听的机会。"),
    ("gradual", "/ˈɡrædʒuəl/", "adj.", "逐渐的", "Language growth is usually gradual.", "语言能力的增长通常是逐渐的。"),
    ("reflect", "/rɪˈflekt/", "v.", "反思；映照", "The evening is a good time to reflect.", "夜晚是反思的好时候。"),
    ("intentional", "/ɪnˈtenʃənl/", "adj.", "有意图的；刻意的", "Intentional practice makes learning clearer.", "有意识的练习让学习更清晰。"),
    ("pause", "/pɔːz/", "n./v.", "暂停；停顿", "A brief pause can make a sentence stronger.", "短暂的停顿可以让一句话更有力量。"),
]

ARTICLES = [
    {
        "title": "The Quiet Art of Wandering",
        "title_zh": "漫步的安静艺术",
        "summary": "在没有明确目的地的散步中，重新发现城市里被忽略的细节。",
        "level": "B1",
        "topic": "生活方式",
        "read_minutes": 4,
        "cover_gradient": "forest",
        "sentences": [
            ("Modern life often asks us to move with a clear purpose and a fixed destination.", "现代生活常常要求我们带着明确目的和固定终点前行。"),
            ("Yet there is a quiet pleasure in choosing to wander without a map.", "然而，不带地图随意漫步，也有一种安静的乐趣。"),
            ("When we slow down, we begin to observe the subtle details of an ordinary street.", "当我们放慢脚步，就会开始观察普通街道上的细微之处。"),
            ("A glimpse of sunlight on an old wall or a brief encounter with a stranger can become meaningful.", "旧墙上的一缕阳光，或与陌生人的短暂相遇，都可能变得意义非凡。"),
            ("This kind of deliberate wandering restores curiosity and gives us a fresh perspective.", "这种有意识的漫步恢复了好奇心，也给我们带来新的视角。"),
            ("We return home with no great achievement, only a more tranquil mind.", "我们回到家，没有伟大的成就，只有一颗更加平静的心。"),
        ],
    },
    {
        "title": "Small Habits, Lasting Change",
        "title_zh": "微小习惯，长久改变",
        "summary": "为什么轻松重复的小行动，比雄心勃勃却短暂的计划更有力量。",
        "level": "A2",
        "topic": "个人成长",
        "read_minutes": 3,
        "cover_gradient": "sunrise",
        "sentences": [
            ("A new habit does not need to begin with a dramatic promise.", "一个新习惯不需要从宏大的承诺开始。"),
            ("The most resilient routines are often small enough to repeat on a difficult day.", "最有韧性的日常习惯，往往小到即使在困难的一天也能重复。"),
            ("Reading one page or learning three words may feel ordinary, but the effect is gradual.", "读一页书或学三个单词也许看似普通，但效果会逐渐显现。"),
            ("Each repetition builds a rhythm that requires less effort over time.", "每一次重复都会建立一种节奏，并随着时间推移需要更少的努力。"),
            ("Pause each week to reflect, then adjust the habit with conscious care.", "每周停下来反思，再有意识地调整习惯。"),
        ],
    },
    {
        "title": "Why Our Minds Need Empty Space",
        "title_zh": "为什么大脑需要留白",
        "summary": "短暂的无所事事如何帮助注意力恢复，并孕育新的想法。",
        "level": "B2",
        "topic": "心理与认知",
        "read_minutes": 5,
        "cover_gradient": "mist",
        "sentences": [
            ("We often treat every pause as an empty space that should be filled.", "我们常把每次停顿都视为应该被填满的空白。"),
            ("However, the mind needs quiet intervals to restore its ability to focus.", "然而，大脑需要安静的间隔来恢复专注能力。"),
            ("Without constant input, thoughts can wander across a wider mental landscape.", "没有持续的信息输入，思绪便能在更广阔的精神景观中漫游。"),
            ("Unexpected connections may appear through a kind of intellectual serendipity.", "意想不到的联系可能通过一种思想上的机缘巧合出现。"),
            ("Choosing to breathe and do nothing for a moment is therefore an intentional act, not wasted time.", "因此，选择呼吸片刻、什么也不做，是一种有意识的行为，而不是浪费时间。"),
        ],
    },
]


def seed_database() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if (db.scalar(select(func.count()).select_from(Word)) or 0) == 0:
            for term, phonetic, pos, translation, example, example_zh in WORDS:
                db.add(
                    Word(
                        term=term,
                        phonetic=phonetic,
                        part_of_speech=pos,
                        translation=translation,
                        definitions=[{"part_of_speech": pos, "meaning": translation}],
                        example=example,
                        example_translation=example_zh,
                    )
                )
            db.flush()

        if (db.scalar(select(func.count()).select_from(Wordbook)) or 0) == 0:
            words = db.scalars(select(Word).order_by(Word.id)).all()
            wordbooks = [
                Wordbook(name="知闲 · 核心词汇", description="从阅读与日常表达中精选的基础核心词", level="A2–B1", cover_color="#345C4B"),
                Wordbook(name="阅读进阶词汇", description="帮助理解长文章与抽象表达的进阶词汇", level="B1–B2", cover_color="#C66B46"),
            ]
            db.add_all(wordbooks)
            db.flush()
            for index, word in enumerate(words[:16], 1):
                db.add(WordbookWord(wordbook_id=wordbooks[0].id, word_id=word.id, position=index))
            for index, word in enumerate(words[8:], 1):
                db.add(WordbookWord(wordbook_id=wordbooks[1].id, word_id=word.id, position=index))

        if (db.scalar(select(func.count()).select_from(Article)) or 0) == 0:
            for source in ARTICLES:
                item = source.copy()
                sentences = item.pop("sentences")
                article = Article(**item)
                db.add(article)
                db.flush()
                for position, (text, translation) in enumerate(sentences, 1):
                    db.add(ArticleSentence(article_id=article.id, position=position, text=text, translation=translation))

        settings = get_settings()
        demo = db.scalar(select(User).where(User.email == "demo@zhixian.app"))
        if settings.create_demo_user and demo is None:
            selected = db.scalar(select(Wordbook).order_by(Wordbook.id))
            demo = User(
                email="demo@zhixian.app",
                nickname="知闲同学",
                password_hash=hash_password("Demo1234!"),
                level="B1",
                daily_new_words=10,
                selected_wordbook_id=selected.id if selected else None,
            )
            db.add(demo)
            db.flush()
            first_word = db.scalar(select(Word).where(Word.term == "serendipity"))
            if first_word:
                db.add(VocabularyItem(user_id=demo.id, word_id=first_word.id, source_type="article", source_ref="1"))
        db.commit()


if __name__ == "__main__":
    seed_database()
    print("Zhixian seed data is ready.")
