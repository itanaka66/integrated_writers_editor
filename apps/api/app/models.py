from datetime import datetime
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from editor_common.users import UserMixin
from .db import Base

class Project(Base):
    __tablename__='projects'
    id:Mapped[int]=mapped_column(primary_key=True); name:Mapped[str]=mapped_column(String(200)); description:Mapped[str]=mapped_column(Text,default=''); genre:Mapped[str]=mapped_column(String(100),default=''); rules:Mapped[str]=mapped_column(Text,default=''); episode_goal:Mapped[int]=mapped_column(Integer,default=500); style_guide:Mapped[str]=mapped_column(Text,default='')
    episodes=relationship('Episode',back_populates='project',cascade='all, delete-orphan')
class Episode(Base):
    __tablename__='episodes'
    id:Mapped[int]=mapped_column(primary_key=True); project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True); number:Mapped[int]=mapped_column(Integer); title:Mapped[str]=mapped_column(String(300)); summary:Mapped[str]=mapped_column(Text,default=''); content:Mapped[str]=mapped_column(Text,default=''); updated_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
    project=relationship('Project',back_populates='episodes')

class ImportJob(Base):
    __tablename__='import_jobs'
    id:Mapped[int]=mapped_column(primary_key=True)
    # project_id starts NULL for a 'writers' import (the project doesn't exist
    # yet — the job creates it) and is filled in once that happens; an
    # 'episodes' import into an existing project has it set from the start.
    project_id:Mapped[int|None]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True,nullable=True)
    mode:Mapped[str]=mapped_column(String(20)) # 'writers' | 'episodes'
    source_filename:Mapped[str]=mapped_column(String(300),default='')
    status:Mapped[str]=mapped_column(String(30),default='queued') # queued|running|completed|error
    total_episodes:Mapped[int]=mapped_column(Integer,default=0)
    processed_episodes:Mapped[int]=mapped_column(Integer,default=0)
    created_episodes:Mapped[int]=mapped_column(Integer,default=0)
    updated_episodes:Mapped[int]=mapped_column(Integer,default=0)
    last_message:Mapped[str]=mapped_column(Text,default='')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
    updated_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)

class EpisodeRevision(Base):
    __tablename__='episode_revisions'
    id:Mapped[int]=mapped_column(primary_key=True)
    episode_id:Mapped[int]=mapped_column(ForeignKey('episodes.id',ondelete='CASCADE'),index=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    title:Mapped[str]=mapped_column(String(300),default='')
    summary:Mapped[str]=mapped_column(Text,default='')
    content:Mapped[str]=mapped_column(Text,default='')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class ChatMessage(Base):
    __tablename__='chat_messages'
    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    role:Mapped[str]=mapped_column(String(20))
    content:Mapped[str]=mapped_column(Text,default='')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class Memo(Base):
    __tablename__='memos'
    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    category:Mapped[str]=mapped_column(String(100),default='')
    title:Mapped[str]=mapped_column(String(300),default='')
    content:Mapped[str]=mapped_column(Text,default='')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class Source(Base):
    __tablename__='sources'
    id:Mapped[int]=mapped_column(primary_key=True)
    episode_id:Mapped[int]=mapped_column(ForeignKey('episodes.id',ondelete='CASCADE'),index=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    title:Mapped[str]=mapped_column(String(300),default='')
    url:Mapped[str]=mapped_column(String(1000),default='')
    note:Mapped[str]=mapped_column(Text,default='')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class Template(Base):
    __tablename__='templates'
    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    name:Mapped[str]=mapped_column(String(300),default='')
    structure:Mapped[str]=mapped_column(Text,default='')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class AiUsageLog(Base):
    __tablename__='ai_usage_logs'
    id:Mapped[int]=mapped_column(primary_key=True)
    project_id:Mapped[int|None]=mapped_column(ForeignKey('projects.id',ondelete='SET NULL'),index=True,nullable=True)
    provider:Mapped[str]=mapped_column(String(20))
    model:Mapped[str]=mapped_column(String(150),default='')
    input_tokens:Mapped[int|None]=mapped_column(Integer,nullable=True)
    output_tokens:Mapped[int|None]=mapped_column(Integer,nullable=True)
    estimated_cost_usd:Mapped[float|None]=mapped_column(nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class RuntimeConfig(Base):
    """A single-row table of live-editable connection settings.

    NULL means "no override; use the ADMIN_* / OLLAMA_* / QDRANT_*
    environment variable". DATABASE_URL deliberately has no column here —
    hot-swapping the connection an already-running process uses to read
    this very table is unsafe, so it stays env/restart-only. See
    docs/user-guide.md#connection-settings.
    """
    __tablename__='runtime_config'
    id:Mapped[int]=mapped_column(primary_key=True,default=1)
    qdrant_url:Mapped[str|None]=mapped_column(String(500),nullable=True)
    ollama_url:Mapped[str|None]=mapped_column(String(500),nullable=True)
    ollama_model:Mapped[str|None]=mapped_column(String(150),nullable=True)
    ollama_embed_model:Mapped[str|None]=mapped_column(String(150),nullable=True)
    ai_provider:Mapped[str|None]=mapped_column(String(20),nullable=True)
    anthropic_api_key:Mapped[str|None]=mapped_column(String(300),nullable=True)
    anthropic_model:Mapped[str|None]=mapped_column(String(150),nullable=True)
    openai_api_key:Mapped[str|None]=mapped_column(String(300),nullable=True)
    openai_model:Mapped[str|None]=mapped_column(String(150),nullable=True)
    google_api_key:Mapped[str|None]=mapped_column(String(300),nullable=True)
    google_model:Mapped[str|None]=mapped_column(String(150),nullable=True)
    cors_origins:Mapped[str|None]=mapped_column(String(1000),nullable=True)
    updated_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)

class User(Base, UserMixin):
    """Login account for HTTP Basic Auth (see app/auth.py). Multiple rows
    replace the old single ADMIN_USERNAME/ADMIN_PASSWORD pair."""
    __tablename__='users'
