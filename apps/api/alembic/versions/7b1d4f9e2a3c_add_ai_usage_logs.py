"""add ai_usage_logs table

Revision ID: 7b1d4f9e2a3c
Revises: 3f8e2c6a9b1d
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b1d4f9e2a3c'
down_revision: Union[str, None] = '3f8e2c6a9b1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('ai_usage_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=True),
    sa.Column('provider', sa.String(length=20), nullable=False),
    sa.Column('model', sa.String(length=150), nullable=False),
    sa.Column('input_tokens', sa.Integer(), nullable=True),
    sa.Column('output_tokens', sa.Integer(), nullable=True),
    sa.Column('estimated_cost_usd', sa.Float(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_usage_logs_project_id'), 'ai_usage_logs', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ai_usage_logs_project_id'), table_name='ai_usage_logs')
    op.drop_table('ai_usage_logs')
