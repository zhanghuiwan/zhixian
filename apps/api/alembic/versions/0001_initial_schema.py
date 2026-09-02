"""Initial Zhixian phase-one schema.

Revision ID: 0001
Revises:
Create Date: 2026-08-12

This historical revision is intentionally explicit. Importing live ORM
metadata here would make newly added columns leak into a fresh 0001 database.
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(),
        server_default=sa.text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "words",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("term", sa.String(length=100), nullable=False),
        sa.Column("phonetic", sa.String(length=120), server_default="", nullable=False),
        sa.Column("part_of_speech", sa.String(length=30), server_default="", nullable=False),
        sa.Column("translation", sa.String(length=500), nullable=False),
        sa.Column("definitions", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("example", sa.Text(), server_default="", nullable=False),
        sa.Column("example_translation", sa.Text(), server_default="", nullable=False),
        sa.UniqueConstraint("term"),
    )
    op.create_index("ix_words_term", "words", ["term"], unique=True)
    op.create_table(
        "wordbooks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("level", sa.String(length=30), nullable=False),
        sa.Column("cover_color", sa.String(length=30), server_default="#345C4B", nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default=sa.true(), nullable=False),
        _created_at(),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("nickname", sa.String(length=80), nullable=False),
        sa.Column("level", sa.String(length=20), server_default="B1", nullable=False),
        sa.Column("daily_new_words", sa.Integer(), server_default="10", nullable=False),
        sa.Column(
            "selected_wordbook_id", sa.Integer(), sa.ForeignKey("wordbooks.id"), nullable=True
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        _created_at(),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "wordbook_words",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "wordbook_id",
            sa.Integer(),
            sa.ForeignKey("wordbooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "word_id",
            sa.Integer(),
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("wordbook_id", "word_id"),
    )
    op.create_table(
        "user_word_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "word_id",
            sa.Integer(),
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=20), server_default="learning", nullable=False),
        sa.Column("repetitions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("interval_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ease_factor", sa.Float(), server_default="2.5", nullable=False),
        sa.Column("mastery_score", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "next_review_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("last_reviewed_at", sa.DateTime(), nullable=True),
        _created_at(),
        sa.UniqueConstraint("user_id", "word_id"),
    )
    op.create_index(
        "ix_progress_due", "user_word_progress", ["user_id", "next_review_at"]
    )
    op.create_index("ix_user_word_progress_user_id", "user_word_progress", ["user_id"])
    op.create_index("ix_user_word_progress_word_id", "user_word_progress", ["word_id"])
    op.create_table(
        "study_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "word_id",
            sa.Integer(),
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.String(length=20), nullable=False),
        sa.Column("previous_interval", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_interval", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "reviewed_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index("ix_reviews_user_time", "study_reviews", ["user_id", "reviewed_at"])
    op.create_table(
        "vocabulary_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "word_id",
            sa.Integer(),
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(length=30), server_default="manual", nullable=False),
        sa.Column("source_ref", sa.String(length=120), nullable=True),
        sa.Column("note", sa.String(length=500), server_default="", nullable=False),
        _created_at(),
        sa.UniqueConstraint("user_id", "word_id"),
    )
    op.create_index("ix_vocabulary_items_user_id", "vocabulary_items", ["user_id"])
    op.create_index("ix_vocabulary_items_word_id", "vocabulary_items", ["word_id"])
    op.create_table(
        "articles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=250), nullable=False),
        sa.Column("title_zh", sa.String(length=250), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("topic", sa.String(length=50), nullable=False),
        sa.Column("read_minutes", sa.Integer(), server_default="5", nullable=False),
        sa.Column("cover_gradient", sa.String(length=120), server_default="forest", nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default=sa.true(), nullable=False),
        _created_at(),
    )
    op.create_table(
        "article_sentences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id",
            sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("translation", sa.Text(), nullable=False),
        sa.UniqueConstraint("article_id", "position"),
    )
    op.create_table(
        "sentence_bookmarks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sentence_id",
            sa.Integer(),
            sa.ForeignKey("article_sentences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        _created_at(),
        sa.UniqueConstraint("user_id", "sentence_id"),
    )
    op.create_index("ix_sentence_bookmarks_user_id", "sentence_bookmarks", ["user_id"])
    op.create_index(
        "ix_sentence_bookmarks_sentence_id", "sentence_bookmarks", ["sentence_id"]
    )


def downgrade() -> None:
    op.drop_table("sentence_bookmarks")
    op.drop_table("article_sentences")
    op.drop_table("articles")
    op.drop_table("vocabulary_items")
    op.drop_table("study_reviews")
    op.drop_table("user_word_progress")
    op.drop_table("wordbook_words")
    op.drop_table("users")
    op.drop_table("wordbooks")
    op.drop_table("words")
