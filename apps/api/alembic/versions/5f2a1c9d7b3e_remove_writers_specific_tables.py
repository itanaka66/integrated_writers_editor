"""remove writers-specific tables

Revision ID: 5f2a1c9d7b3e
Revises: 1164a31f3283
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f2a1c9d7b3e'
down_revision: Union[str, None] = '1164a31f3283'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop child/leaf tables first (FK-safe order), then their parents.
    op.drop_table('episode_plans')
    op.drop_table('mini_arc_plans')
    op.drop_table('arc_plans')
    op.drop_table('series_plans')
    op.drop_table('auto_write_jobs')

    op.drop_index(op.f('ix_world_relations_project_id'), table_name='world_relations')
    op.drop_table('world_relations')
    op.drop_index(op.f('ix_character_states_project_id'), table_name='character_states')
    op.drop_index(op.f('ix_character_states_character_id'), table_name='character_states')
    op.drop_table('character_states')
    op.drop_index(op.f('ix_character_relations_project_id'), table_name='character_relations')
    op.drop_table('character_relations')
    op.drop_index(op.f('ix_world_entities_project_id'), table_name='world_entities')
    op.drop_table('world_entities')
    op.drop_index(op.f('ix_timeline_events_project_id'), table_name='timeline_events')
    op.drop_table('timeline_events')
    op.drop_index(op.f('ix_plots_project_id'), table_name='plots')
    op.drop_table('plots')
    op.drop_index(op.f('ix_foreshadowings_project_id'), table_name='foreshadowings')
    op.drop_table('foreshadowings')
    op.drop_index(op.f('ix_continuity_issues_project_id'), table_name='continuity_issues')
    op.drop_table('continuity_issues')
    op.drop_index(op.f('ix_characters_project_id'), table_name='characters')
    op.drop_table('characters')


def downgrade() -> None:
    op.create_table('characters',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('role', sa.String(length=100), nullable=False),
    sa.Column('personality', sa.Text(), nullable=False),
    sa.Column('speech_style', sa.Text(), nullable=False),
    sa.Column('goal', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_characters_project_id'), 'characters', ['project_id'], unique=False)
    op.create_table('continuity_issues',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('episode_number', sa.Integer(), nullable=True),
    sa.Column('issue_type', sa.String(length=50), nullable=False),
    sa.Column('severity', sa.String(length=20), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('evidence', sa.Text(), nullable=False),
    sa.Column('suggestion', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('model', sa.String(length=100), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_continuity_issues_project_id'), 'continuity_issues', ['project_id'], unique=False)
    op.create_table('foreshadowings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('setup_episode', sa.Integer(), nullable=True),
    sa.Column('payoff_episode', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_foreshadowings_project_id'), 'foreshadowings', ['project_id'], unique=False)
    op.create_table('plots',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('plot_type', sa.String(length=100), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('start_episode', sa.Integer(), nullable=True),
    sa.Column('end_episode', sa.Integer(), nullable=True),
    sa.Column('objective', sa.Text(), nullable=False),
    sa.Column('conflict', sa.Text(), nullable=False),
    sa.Column('resolution', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_plots_project_id'), 'plots', ['project_id'], unique=False)
    op.create_table('timeline_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('episode_number', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('world_time', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_timeline_events_project_id'), 'timeline_events', ['project_id'], unique=False)
    op.create_table('world_entities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('entity_type', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('rules', sa.Text(), nullable=False),
    sa.Column('location', sa.String(length=200), nullable=False),
    sa.Column('era', sa.String(length=200), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_world_entities_project_id'), 'world_entities', ['project_id'], unique=False)
    op.create_table('character_relations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('from_character_id', sa.Integer(), nullable=False),
    sa.Column('to_character_id', sa.Integer(), nullable=False),
    sa.Column('relation_type', sa.String(length=100), nullable=False),
    sa.Column('strength', sa.Integer(), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['from_character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['to_character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_character_relations_project_id'), 'character_relations', ['project_id'], unique=False)
    op.create_table('character_states',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('character_id', sa.Integer(), nullable=False),
    sa.Column('episode_id', sa.Integer(), nullable=True),
    sa.Column('episode_number', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('location', sa.String(length=300), nullable=False),
    sa.Column('emotion', sa.String(length=300), nullable=False),
    sa.Column('health', sa.String(length=300), nullable=False),
    sa.Column('goal', sa.Text(), nullable=False),
    sa.Column('knowledge', sa.Text(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['episode_id'], ['episodes.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_character_states_character_id'), 'character_states', ['character_id'], unique=False)
    op.create_index(op.f('ix_character_states_project_id'), 'character_states', ['project_id'], unique=False)
    op.create_table('world_relations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('from_world_id', sa.Integer(), nullable=False),
    sa.Column('to_world_id', sa.Integer(), nullable=False),
    sa.Column('relation_type', sa.String(length=100), nullable=False),
    sa.Column('strength', sa.Integer(), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['from_world_id'], ['world_entities.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['to_world_id'], ['world_entities.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_world_relations_project_id'), 'world_relations', ['project_id'], unique=False)

    op.create_table('auto_write_jobs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('start_episode', sa.Integer(), nullable=False),
    sa.Column('end_episode', sa.Integer(), nullable=False),
    sa.Column('current_episode', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('writer_model', sa.String(length=150), nullable=False),
    sa.Column('controller_model', sa.String(length=150), nullable=False),
    sa.Column('last_message', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('series_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('total_episodes', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('premise', sa.Text(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('model', sa.String(length=150), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('project_id')
    )
    op.create_table('arc_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_plan_id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('arc_number', sa.Integer(), nullable=False),
    sa.Column('start_episode', sa.Integer(), nullable=False),
    sa.Column('end_episode', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('model', sa.String(length=150), nullable=False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['series_plan_id'], ['series_plans.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('mini_arc_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('arc_plan_id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('mini_arc_number', sa.Integer(), nullable=False),
    sa.Column('start_episode', sa.Integer(), nullable=False),
    sa.Column('end_episode', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('model', sa.String(length=150), nullable=False),
    sa.ForeignKeyConstraint(['arc_plan_id'], ['arc_plans.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('episode_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('mini_arc_plan_id', sa.Integer(), nullable=False),
    sa.Column('project_id', sa.Integer(), nullable=False),
    sa.Column('episode_number', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('model', sa.String(length=150), nullable=False),
    sa.ForeignKeyConstraint(['mini_arc_plan_id'], ['mini_arc_plans.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
