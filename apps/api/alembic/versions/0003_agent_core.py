"""Add Phase 2 Agent data model.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-02
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        )
    ]


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "timezone",
                sa.String(length=64),
                server_default="Asia/Shanghai",
                nullable=False,
            )
        )
    with op.batch_alter_table("articles") as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("source_type", sa.String(length=30), server_default="seed", nullable=False)
        )
        batch_op.add_column(
            sa.Column(
                "generation_metadata", sa.JSON(), server_default=sa.text("'{}'"), nullable=False
            )
        )
        batch_op.create_foreign_key(
            "fk_articles_owner_user",
            "users",
            ["owner_user_id"],
            ["id"],
            ondelete="CASCADE",
        )
    op.create_index("ix_articles_owner_user_id", "articles", ["owner_user_id"])

    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(length=120), server_default="新对话", nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("summary", sa.Text(), server_default="", nullable=False),
        *_timestamps(),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_ai_conversations_user_updated", "ai_conversations", ["user_id", "updated_at"]
    )
    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), server_default="", nullable=False),
        sa.Column("tool_call_id", sa.String(length=160), nullable=True),
        sa.Column("tool_calls", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("provider_metadata", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("completion_tokens", sa.Integer(), server_default="0", nullable=False),
        *_timestamps(),
    )
    op.create_index(
        "ix_ai_messages_conversation_created", "ai_messages", ["conversation_id", "created_at"]
    )
    op.create_table(
        "ai_tool_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("tool_call_id", sa.String(length=160), nullable=False),
        sa.Column("tool_name", sa.String(length=100), nullable=False),
        sa.Column("arguments", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="running", nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("result_summary", sa.String(length=500), server_default="", nullable=False),
        sa.Column(
            "requires_confirmation", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        *_timestamps(),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("idempotency_key", name="uq_ai_tool_runs_idempotency"),
    )
    op.create_index(
        "ix_ai_tool_runs_conversation", "ai_tool_runs", ["conversation_id", "created_at"]
    )
    op.create_table(
        "ai_user_memories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("value", sa.String(length=500), nullable=False),
        sa.Column("source", sa.String(length=40), server_default="explicit", nullable=False),
        *_timestamps(),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "key", name="uq_ai_user_memory_key"),
    )
    op.create_table(
        "vocabulary_collections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=300), server_default="", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        *_timestamps(),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "name", name="uq_vocabulary_collection_user_name"),
    )
    op.create_index(
        "ix_vocabulary_collections_user", "vocabulary_collections", ["user_id"]
    )
    op.create_table(
        "vocabulary_collection_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "collection_id",
            sa.Integer(),
            sa.ForeignKey("vocabulary_collections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vocabulary_item_id",
            sa.Integer(),
            sa.ForeignKey("vocabulary_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        *_timestamps(),
        sa.UniqueConstraint(
            "collection_id", "vocabulary_item_id", name="uq_vocabulary_collection_item"
        ),
    )
    op.create_index(
        "ix_vocabulary_collection_items_collection_id",
        "vocabulary_collection_items",
        ["collection_id"],
    )
    op.create_index(
        "ix_vocabulary_collection_items_vocabulary_item_id",
        "vocabulary_collection_items",
        ["vocabulary_item_id"],
    )
    op.create_table(
        "daily_study_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("algorithm_version", sa.String(length=30), server_default="v1", nullable=False),
        sa.Column("is_forecast", sa.Boolean(), server_default=sa.false(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "plan_date", name="uq_daily_study_plan_user_date"),
    )
    op.create_index(
        "ix_daily_study_plan_user_date", "daily_study_plans", ["user_id", "plan_date"]
    )
    op.create_table(
        "daily_study_plan_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "plan_id",
            sa.Integer(),
            sa.ForeignKey("daily_study_plans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "word_id", sa.Integer(), sa.ForeignKey("words.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("plan_id", "word_id", "item_type", name="uq_daily_plan_word_type"),
    )
    op.create_index("ix_daily_study_plan_items_plan_id", "daily_study_plan_items", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_daily_study_plan_items_plan_id", table_name="daily_study_plan_items")
    op.drop_table("daily_study_plan_items")
    op.drop_index("ix_daily_study_plan_user_date", table_name="daily_study_plans")
    op.drop_table("daily_study_plans")
    op.drop_index(
        "ix_vocabulary_collection_items_vocabulary_item_id",
        table_name="vocabulary_collection_items",
    )
    op.drop_index(
        "ix_vocabulary_collection_items_collection_id",
        table_name="vocabulary_collection_items",
    )
    op.drop_table("vocabulary_collection_items")
    op.drop_index("ix_vocabulary_collections_user", table_name="vocabulary_collections")
    op.drop_table("vocabulary_collections")
    op.drop_table("ai_user_memories")
    op.drop_index("ix_ai_tool_runs_conversation", table_name="ai_tool_runs")
    op.drop_table("ai_tool_runs")
    op.drop_index("ix_ai_messages_conversation_created", table_name="ai_messages")
    op.drop_table("ai_messages")
    op.drop_index("ix_ai_conversations_user_updated", table_name="ai_conversations")
    op.drop_table("ai_conversations")
    op.drop_index("ix_articles_owner_user_id", table_name="articles")
    with op.batch_alter_table("articles") as batch_op:
        batch_op.drop_constraint("fk_articles_owner_user", type_="foreignkey")
        batch_op.drop_column("generation_metadata")
        batch_op.drop_column("source_type")
        batch_op.drop_column("owner_user_id")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("timezone")
