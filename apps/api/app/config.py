from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
 model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')
 database_url:str='postgresql+psycopg2://writers:writers@localhost:5432/writers'; qdrant_url:str='http://localhost:6333'; ollama_url:str='http://localhost:11434'; ollama_model:str='qwen3.8:27b'; ollama_embed_model:str='nomic-embed-text'; cors_origins:str='*'
 admin_username:str='admin'; admin_password:str='writers-studio-change-me'
 # Which AI backend /ai/generate, chat, and material summarization use.
 # 'ollama' (default) keeps everything local; the others call out to the
 # respective vendor's REST API using the API key below. Embeddings (RAG
 # indexing/search) always go through Ollama regardless of this setting.
 ai_provider:str='ollama'
 anthropic_api_key:str=''; anthropic_model:str='claude-sonnet-4-5'
 openai_api_key:str=''; openai_model:str='gpt-4o-mini'
 google_api_key:str=''; google_model:str='gemini-2.0-flash'
 # Local-disk mirror of episode text, optionally auto-committed/pushed to a
 # git remote on a timer. git_remote_url takes a token embedded the way git
 # expects (https://<token>@host/owner/repo.git) or a plain URL if the
 # remote is otherwise authenticated (e.g. SSH agent, credential helper).
 writers_storage_dir:str='./writers_storage'
 git_remote_url:str=''; git_autosync_interval_seconds:int=300
 # Scheduled backups (PostgreSQL dump + Qdrant snapshot, mirroring what
 # scripts/backup.sh does manually). Off by default — opt in with
 # BACKUP_ENABLED=true so existing deployments don't suddenly start writing
 # to disk on a timer. Interval default is once a day; retention keeps the
 # N most recent backups and deletes older ones.
 backup_enabled:bool=False; backup_dir:str='./backups'; backup_interval_seconds:int=86400; backup_retention_count:int=7
 # OAuth2 "Sign in with..." login (Google/GitHub), layered alongside HTTP
 # Basic Auth rather than replacing it (see app/auth.py). Entirely opt-in:
 # wired up only when session_secret AND at least one provider's
 # client_id+client_secret are set. public_base_url is the externally
 # reachable origin the browser hits (e.g. https://writer.example.com) —
 # needed to build each provider's exact redirect_uri, since OAuth apps
 # require one registered ahead of time.
 google_client_id:str=''; google_client_secret:str=''
 github_client_id:str=''; github_client_secret:str=''
 session_secret:str=''; public_base_url:str=''
 # Only set this false for local http:// dev — session cookies are marked
 # Secure by default and browsers silently drop Secure cookies over plain
 # HTTP, which would make OAuth login look like it "does nothing".
 secure_cookies:bool=True
 # Outbound email for the "forgot password" flow (see app/mail.py). Entirely
 # opt-in: the password-reset request endpoint just logs a warning and skips
 # sending if smtp_host is unset. Also requires session_secret and
 # public_base_url (already defined above for OAuth2) to build/sign the
 # reset link.
 smtp_host:str=''; smtp_port:int=587
 smtp_username:str=''; smtp_password:str=''
 smtp_from:str=''; smtp_use_tls:bool=True
settings=Settings()
