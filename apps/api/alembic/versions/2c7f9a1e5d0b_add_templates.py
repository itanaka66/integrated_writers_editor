"""add templates table

Revision ID: 2c7f9a1e5d0b
Revises: 8a3c2e1f4b6d
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c7f9a1e5d0b'
down_revision: Union[str, None] = '8a3c2e1f4b6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('templates',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('structure', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_templates_project_id'), 'templates', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_templates_project_id'), table_name='templates')
    op.drop_table('templates')
