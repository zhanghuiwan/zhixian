"""Persist completed grouped study sessions and per-word attempt history.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_session_id", sa.String(64), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("source_kind", sa.String(20), nullable=False, server_default="all"),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("source_name", sa.String(120), nullable=False, server_default="综合学习"),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("repeated_words", sa.Integer(), nullable=False),
        sa.Column("round_count", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column(
            "completed_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("result_snapshot", sa.JSON(), nullable=False),
        sa.UniqueConstraint("user_id", "client_session_id", name="uq_study_session_client"),
    )
    op.create_index("ix_study_sessions_user_id", "study_sessions", ["user_id"])
    op.create_index(
        "ix_study_sessions_user_completed",
        "study_sessions",
        ["user_id", "completed_at"],
    )

    with op.batch_alter_table("study_reviews") as batch:
        batch.add_column(sa.Column("session_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("familiarity_score", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1")
        )
        batch.add_column(
            sa.Column("forgotten_count", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(
            sa.Column("fuzzy_count", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(
            sa.Column("round_count", sa.Integer(), nullable=False, server_default="1")
        )
        batch.add_column(sa.Column("score_history", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("attempt_history", sa.JSON(), nullable=True))
        batch.add_column(
            sa.Column("revealed_count", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(
            sa.Column("response_ms_total", sa.Integer(), nullable=False, server_default="0")
        )
        batch.create_foreign_key(
            "fk_study_reviews_session",
            "study_sessions",
            ["session_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_unique_constraint(
            "uq_review_session_word", ["session_id", "word_id"]
        )
        batch.create_index("ix_study_reviews_session_id", ["session_id"])


def downgrade() -> None:
    raise RuntimeError(
        "0008 保存了组学习会话和逐词答题轨迹；请使用升级前备份恢复，禁止有损降级。"
    )
