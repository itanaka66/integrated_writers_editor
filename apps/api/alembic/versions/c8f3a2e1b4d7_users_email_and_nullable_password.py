"""add email column to users; make password_hash nullable (OAuth2 accounts)

editor_common's UserMixin gained an `email` column and made
`password_hash` nullable when OAuth2 login (Google/GitHub) was added
upstream — an account created via first OAuth2 login has no password to
check, so it authenticates via session cookie only. This repo's
original users-table migration predates that change.

Revision ID: c8f3a2e1b4d7
Revises: b2d5f8a1c3e6
Create Date: 2026-09-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8f3a2e1b4d7'
down_revision: Union[str, None] = 'b2d5f8a1c3e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('email', sa.String(length=255), nullable=True))
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.alter_column('users', 'password_hash', existing_type=sa.String(length=255), nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'password_hash', existing_type=sa.String(length=255), nullable=False)
    op.drop_index('ix_users_email', table_name='users')
    op.drop_column('users', 'email')
