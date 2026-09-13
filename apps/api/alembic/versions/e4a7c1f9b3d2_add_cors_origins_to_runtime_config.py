"""add cors_origins to runtime_config

Revision ID: e4a7c1f9b3d2
Revises: 7b1d4f9e2a3c
Create Date: 2026-09-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4a7c1f9b3d2'
down_revision: Union[str, None] = '7b1d4f9e2a3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runtime_config', sa.Column('cors_origins', sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column('runtime_config', 'cors_origins')
