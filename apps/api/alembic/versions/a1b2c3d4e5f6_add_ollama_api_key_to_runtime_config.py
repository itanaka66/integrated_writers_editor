"""add ollama_api_key to runtime_config

Revision ID: a1b2c3d4e5f6
Revises: c8f3a2e1b4d7
Create Date: 2026-09-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c8f3a2e1b4d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runtime_config', sa.Column('ollama_api_key', sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column('runtime_config', 'ollama_api_key')
