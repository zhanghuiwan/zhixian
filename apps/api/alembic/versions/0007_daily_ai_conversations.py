"""Add explicit daily AI conversations.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("ai_conversations") as batch:
        batch.add_column(
            sa.Column(
                "conversation_type",
                sa.String(20),
                nullable=False,
                server_default="manual",
            )
        )
        batch.add_column(sa.Column("local_date", sa.Date(), nullable=True))
        batch.create_unique_constraint(
            "uq_ai_conversation_user_type_date",
            ["user_id", "conversation_type", "local_date"],
        )


def downgrade() -> None:
    raise RuntimeError(
        "0007 保存了每日会话身份；请使用升级前备份恢复，禁止有损降级。"
    )
