"""Initial Zhixian schema.

Revision ID: 0001
Revises:
Create Date: 2026-08-12

The initial revision uses the SQLAlchemy definitions for the phase-one tables,
but keeps an explicit table list so later models cannot leak into this
historical baseline. Subsequent schema changes use explicit Alembic operations.
"""

from alembic import op

from app.db.base import Base
from app.models import *  # noqa: F403

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

INITIAL_TABLE_NAMES = (
    "users",
    "words",
    "wordbooks",
    "wordbook_words",
    "user_word_progress",
    "study_reviews",
    "vocabulary_items",
    "articles",
    "article_sentences",
    "sentence_bookmarks",
)


def initial_tables():
    return [Base.metadata.tables[name] for name in INITIAL_TABLE_NAMES]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=initial_tables())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=initial_tables())
