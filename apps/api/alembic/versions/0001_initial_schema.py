"""Initial Zhixian schema.

Revision ID: 0001
Revises:
Create Date: 2026-08-12

The initial revision intentionally derives tables from the same SQLAlchemy
metadata used by the application. Subsequent schema changes use explicit
Alembic operations generated from this baseline.
"""

from alembic import op

from app.db.base import Base
from app.models import *  # noqa: F403

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())

