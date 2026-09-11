"""remove unused controller ollama settings

Revision ID: 3f8e2c6a9b1d
Revises: 9d4b6f2a1c8e
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f8e2c6a9b1d'
down_revision: Union[str, None] = '9d4b6f2a1c8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('runtime_config', 'controller_ollama_model')
    op.drop_column('runtime_config', 'controller_ollama_url')


def downgrade() -> None:
    op.add_column('runtime_config', sa.Column('controller_ollama_url', sa.String(length=500), nullable=True))
    op.add_column('runtime_config', sa.Column('controller_ollama_model', sa.String(length=150), nullable=True))
