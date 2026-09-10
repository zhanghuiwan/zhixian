"""Add user-owned custom dictionary words.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "words",
        sa.Column(
            "dictionary_source",
            sa.String(20),
            nullable=False,
            server_default="system",
        ),
    )
    op.create_table(
        "user_custom_words",
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
        sa.Column(
            "created_by",
            sa.String(30),
            nullable=False,
            server_default="ai_agent",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("user_id", "word_id", name="uq_user_custom_word"),
    )
    op.create_index(
        "ix_user_custom_words_user_id", "user_custom_words", ["user_id"]
    )
    op.create_index(
        "ix_user_custom_words_word_id", "user_custom_words", ["word_id"]
    )
    op.create_index(
        "ix_user_custom_words_user_created",
        "user_custom_words",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    raise RuntimeError(
        "0006 保存了用户自定义词的所有权；请使用升级前备份恢复，禁止有损降级。"
    )
