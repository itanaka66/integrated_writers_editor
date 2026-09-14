"""drop project episode_goal

Revision ID: b2d5f8a1c3e6
Revises: a9c3e7f1b2d4
Create Date: 2026-09-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d5f8a1c3e6'
down_revision: Union[str, None] = 'a9c3e7f1b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('projects', 'episode_goal')


def downgrade() -> None:
    op.add_column('projects', sa.Column('episode_goal', sa.Integer(), nullable=False, server_default='500'))
