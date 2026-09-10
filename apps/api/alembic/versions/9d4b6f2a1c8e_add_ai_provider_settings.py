"""add ai provider settings to runtime_config

Revision ID: 9d4b6f2a1c8e
Revises: 2c7f9a1e5d0b
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d4b6f2a1c8e'
down_revision: Union[str, None] = '2c7f9a1e5d0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runtime_config', sa.Column('ai_provider', sa.String(length=20), nullable=True))
    op.add_column('runtime_config', sa.Column('anthropic_api_key', sa.String(length=300), nullable=True))
    op.add_column('runtime_config', sa.Column('anthropic_model', sa.String(length=150), nullable=True))
    op.add_column('runtime_config', sa.Column('openai_api_key', sa.String(length=300), nullable=True))
    op.add_column('runtime_config', sa.Column('openai_model', sa.String(length=150), nullable=True))
    op.add_column('runtime_config', sa.Column('google_api_key', sa.String(length=300), nullable=True))
    op.add_column('runtime_config', sa.Column('google_model', sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column('runtime_config', 'google_model')
    op.drop_column('runtime_config', 'google_api_key')
    op.drop_column('runtime_config', 'openai_model')
    op.drop_column('runtime_config', 'openai_api_key')
    op.drop_column('runtime_config', 'anthropic_model')
    op.drop_column('runtime_config', 'anthropic_api_key')
    op.drop_column('runtime_config', 'ai_provider')
