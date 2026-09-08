"""Learning sources, reading history and durable sentence collections.

Revision ID: 0005
Revises: 0004
"""

import hashlib

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("selected_collection_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("example_content_version", sa.Integer(), nullable=False, server_default="0"))
    with op.batch_alter_table("articles") as batch:
        batch.add_column(sa.Column("slug", sa.String(120), nullable=True))
        batch.create_unique_constraint("uq_articles_slug", ["slug"])
    with op.batch_alter_table("study_reviews") as batch:
        batch.add_column(sa.Column("source_kind", sa.String(20), nullable=False, server_default="legacy"))
        batch.add_column(sa.Column("source_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("source_name", sa.String(120), nullable=False, server_default="来源未记录"))
        batch.add_column(sa.Column("mode", sa.String(20), nullable=False, server_default="legacy"))
        batch.add_column(sa.Column("request_id", sa.String(64), nullable=True))
        batch.add_column(sa.Column("result_snapshot", sa.JSON(), nullable=True))
        batch.create_unique_constraint("uq_review_request", ["user_id", "request_id"])

    bind = op.get_bind()
    foreign_keys = sa.inspect(bind).get_foreign_keys("sentence_bookmarks")
    sentence_fk = next(item for item in foreign_keys if item["constrained_columns"] == ["sentence_id"])
    convention = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
    with op.batch_alter_table("sentence_bookmarks", naming_convention=convention) as batch:
        batch.drop_constraint(sentence_fk["name"] or "fk_sentence_bookmarks_sentence_id_article_sentences", type_="foreignkey")
        batch.alter_column("sentence_id", existing_type=sa.Integer(), nullable=True)
        batch.create_foreign_key("fk_bookmark_sentence", "article_sentences", ["sentence_id"], ["id"], ondelete="SET NULL")
        batch.add_column(sa.Column("article_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_bookmark_article",
            "articles",
            ["article_id"],
            ["id"],
            ondelete="SET NULL",
        )
        for name, type_, default in [
            ("text", sa.Text(), ""), ("translation", sa.Text(), ""),
            ("source_type", sa.String(20), "article"), ("source_title", sa.String(250), ""),
            ("note", sa.Text(), ""),
        ]:
            batch.add_column(sa.Column(name, type_, nullable=False, server_default=default))
        batch.add_column(sa.Column("source_ref", sa.String(120), nullable=True))
        batch.add_column(sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
        batch.add_column(sa.Column("is_example", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("dedup_key", sa.String(64), nullable=True))
        batch.create_unique_constraint("uq_bookmark_user_key", ["user_id", "dedup_key"])
    rows = bind.execute(sa.text(
        "SELECT b.id, s.id AS sentence_id, s.article_id, s.text, s.translation, a.title "
        "FROM sentence_bookmarks b JOIN article_sentences s ON s.id=b.sentence_id "
        "JOIN articles a ON a.id=s.article_id"
    )).mappings().all()
    for row in rows:
        bind.execute(sa.text(
            "UPDATE sentence_bookmarks SET article_id=:article_id, text=:text, "
            "translation=:translation, source_title=:title, source_ref=:ref, dedup_key=:key "
            "WHERE id=:id"
        ), {**row, "ref": str(row["article_id"]), "key": hashlib.sha256(f"article:{row['article_id']}:{' '.join(row['text'].split())}".encode()).hexdigest()})

    for table in ["reading_progress", "reading_activity"]:
        columns = [
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("article_id", sa.Integer(), sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False),
            sa.Column("percent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        ]
        if table == "reading_progress":
            columns += [sa.Column("position", sa.Integer(), nullable=False, server_default="1"), sa.Column("completed_at", sa.DateTime(), nullable=True), sa.UniqueConstraint("user_id", "article_id")]
        else:
            columns += [sa.Column("day", sa.Date(), nullable=False), sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()), sa.UniqueConstraint("user_id", "article_id", "day")]
        op.create_table(table, *columns)
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
    op.create_index("ix_reading_activity_day", "reading_activity", ["day"])


def downgrade() -> None:
    raise RuntimeError("0005 保存了新的个人收藏和阅读历史；请使用升级前备份恢复，禁止有损降级。")
