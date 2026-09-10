"""add memos and sources tables

Revision ID: 8a3c2e1f4b6d
Revises: 5f2a1c9d7b3e
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a3c2e1f4b6d'
down_revision: Union[str, None] = '5f2a1c9d7b3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('memos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('category', sa.String(length=100), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_memos_project_id'), 'memos', ['project_id'], unique=False)
    op.create_table('sources',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('episode_id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('url', sa.String(length=1000), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['episode_id'], ['episodes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sources_episode_id'), 'sources', ['episode_id'], unique=False)
    op.create_index(op.f('ix_sources_project_id'), 'sources', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sources_project_id'), table_name='sources')
    op.drop_index(op.f('ix_sources_episode_id'), table_name='sources')
    op.drop_table('sources')
    op.drop_index(op.f('ix_memos_project_id'), table_name='memos')
    op.drop_table('memos')
