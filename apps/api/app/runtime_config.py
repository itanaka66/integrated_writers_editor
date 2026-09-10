"""Resolves the connection settings actually in effect right now.

Qdrant and both Ollama endpoints (Writer / Controller) can be overridden
live from the 設定 → 接続設定 screen, stored in the single-row
`runtime_config` table. DATABASE_URL is not — see models.RuntimeConfig's
docstring for why. Every AI/vector call in this app is already stateless
(a fresh client per call), so honoring an override here doesn't need a
restart or any connection-pool surgery — it just changes what the next
call constructs its client with.
"""
from dataclasses import dataclass

from .config import settings as env_settings
from .db import SessionLocal
from .models import RuntimeConfig

SINGLETON_ID = 1


@dataclass
class EffectiveConfig:
    qdrant_url: str
    ollama_url: str
    ollama_model: str
    ollama_embed_model: str
    controller_ollama_url: str
    controller_ollama_model: str


def _pick(override: str | None, fallback: str) -> str:
    return override if override else fallback


def get_effective_config(db=None) -> EffectiveConfig:
    """`db`, when given, must be a session bound to the same engine `get_db`
    hands out to request handlers — pass it whenever you have one (e.g. from
    a FastAPI endpoint) so this reads the same database those handlers do.
    Without it (e.g. from ollama.py/rag.py, which aren't request-scoped),
    this opens and closes its own short-lived session against the app's
    configured engine — fine as long as that's the same engine `get_db`
    uses, which it always is outside of tests (tests override `get_db` to
    an isolated in-memory database that this fallback path can't see).
    """
    owns_session = db is None
    if owns_session:
        db = SessionLocal()
    try:
        row = db.get(RuntimeConfig, SINGLETON_ID)
    finally:
        if owns_session:
            db.close()
    return EffectiveConfig(
        qdrant_url=_pick(row.qdrant_url if row else None, env_settings.qdrant_url),
        ollama_url=_pick(row.ollama_url if row else None, env_settings.ollama_url),
        ollama_model=_pick(row.ollama_model if row else None, env_settings.ollama_model),
        ollama_embed_model=_pick(row.ollama_embed_model if row else None, env_settings.ollama_embed_model),
        controller_ollama_url=_pick(row.controller_ollama_url if row else None, env_settings.controller_ollama_url),
        controller_ollama_model=_pick(row.controller_ollama_model if row else None, env_settings.controller_ollama_model),
    )


def mask_database_url(url: str) -> str:
    """postgresql+psycopg2://user:secret@host:5432/db -> user:***@host:5432/db"""
    if '@' not in url:
        return url
    scheme_and_creds, rest = url.rsplit('@', 1)
    if '://' not in scheme_and_creds:
        return url
    _, creds = scheme_and_creds.split('://', 1)
    user = creds.split(':', 1)[0] if ':' in creds else creds
    return f'{user}:***@{rest}'
