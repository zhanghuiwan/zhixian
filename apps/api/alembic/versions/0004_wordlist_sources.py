"""Add stable wordbook keys and auditable wordlist sources.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wordbooks", sa.Column("slug", sa.String(length=120), nullable=True))
    op.create_index("ix_wordbooks_slug", "wordbooks", ["slug"], unique=True)

    op.create_table(
        "wordlist_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_key", sa.String(length=160), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("repository_url", sa.String(length=500), nullable=False),
        sa.Column("repository_commit", sa.String(length=64), nullable=False),
        sa.Column("source_file", sa.String(length=500), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("declared_count", sa.Integer(), nullable=False),
        sa.Column("parsed_count", sa.Integer(), nullable=False),
        sa.Column("license_status", sa.String(length=40), nullable=False),
        sa.Column("transform_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "imported_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("source_key"),
    )
    op.create_index(
        "ix_wordlist_sources_source_key", "wordlist_sources", ["source_key"], unique=True
    )

    op.create_table(
        "wordlist_source_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "source_id",
            sa.Integer(),
            sa.ForeignKey("wordlist_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "word_id",
            sa.Integer(),
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("source_id", "word_id", name="uq_wordlist_source_word"),
    )
    op.create_index(
        "ix_wordlist_source_entries_source_id",
        "wordlist_source_entries",
        ["source_id"],
    )
    op.create_index(
        "ix_wordlist_source_entries_word_id",
        "wordlist_source_entries",
        ["word_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wordlist_source_entries_word_id", table_name="wordlist_source_entries"
    )
    op.drop_index(
        "ix_wordlist_source_entries_source_id", table_name="wordlist_source_entries"
    )
    op.drop_table("wordlist_source_entries")
    op.drop_index("ix_wordlist_sources_source_key", table_name="wordlist_sources")
    op.drop_table("wordlist_sources")
    op.drop_index("ix_wordbooks_slug", table_name="wordbooks")
    op.drop_column("wordbooks", "slug")
