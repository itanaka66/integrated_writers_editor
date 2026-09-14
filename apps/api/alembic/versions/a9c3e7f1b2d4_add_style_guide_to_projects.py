"""add style_guide to projects

Revision ID: a9c3e7f1b2d4
Revises: f1a2b3c4d5e6
Create Date: 2026-09-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9c3e7f1b2d4'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('style_guide', sa.Text(), nullable=False, server_default=''))


def downgrade() -> None:
    op.drop_column('projects', 'style_guide')
