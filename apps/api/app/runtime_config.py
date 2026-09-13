"""Resolves the connection settings actually in effect right now.

Qdrant and the Ollama endpoint can be overridden live from the 設定 →
接続設定 screen, stored in the single-row
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
    ai_provider: str = 'ollama'
    anthropic_api_key: str = ''
    anthropic_model: str = ''
    openai_api_key: str = ''
    openai_model: str = ''
    google_api_key: str = ''
    google_model: str = ''
    cors_origins: str = ''


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
        ai_provider=_pick(row.ai_provider if row else None, env_settings.ai_provider),
        anthropic_api_key=_pick(row.anthropic_api_key if row else None, env_settings.anthropic_api_key),
        anthropic_model=_pick(row.anthropic_model if row else None, env_settings.anthropic_model),
        openai_api_key=_pick(row.openai_api_key if row else None, env_settings.openai_api_key),
        openai_model=_pick(row.openai_model if row else None, env_settings.openai_model),
        google_api_key=_pick(row.google_api_key if row else None, env_settings.google_api_key),
        google_model=_pick(row.google_model if row else None, env_settings.google_model),
        cors_origins=_pick(row.cors_origins if row else None, env_settings.cors_origins),
    )


def _parse_origins(raw: str) -> list[str]:
    # A trailing slash is an easy, easy-to-miss mistake when typing an
    # origin into the Settings screen or .env (e.g. "https://example.com/"
    # instead of "https://example.com") — the browser's Origin header never
    # has one, so an un-normalized value would silently never match and
    # every request would look like a CORS failure with no obvious cause.
    return [o.strip().rstrip('/') for o in raw.split(',') if o.strip()]


# CORSMiddleware (see app/cors.py) checks the allowed-origins list on every
# request, so it reads this in-memory cache rather than hitting the database
# each time — refreshed at app startup and whenever the Settings screen
# changes the CORS_ORIGINS override (system_settings_put in main.py).
_cors_cache: list[str] | None = None


def refresh_cors_cache(db=None) -> list[str]:
    global _cors_cache
    cfg = get_effective_config(db)
    _cors_cache = _parse_origins(cfg.cors_origins)
    return _cors_cache


def get_cors_origins() -> list[str]:
    # Falls back to the env var directly, without touching the database, if
    # the cache was never primed (startup's refresh_cors_cache() failed or
    # hasn't run yet, e.g. in tests) — CORS must keep working even when the
    # database is briefly unreachable, since it's unrelated to this app's
    # actual data.
    if _cors_cache is None:
        return _parse_origins(env_settings.cors_origins)
    return _cors_cache


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
