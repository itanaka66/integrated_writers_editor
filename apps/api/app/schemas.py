from pydantic import BaseModel,ConfigDict
class ProjectCreate(BaseModel): name:str; description:str=''; genre:str=''; rules:str=''; style_guide:str=''
class ProjectOut(ProjectCreate): id:int; model_config=ConfigDict(from_attributes=True)
class ProjectUpdate(BaseModel): name:str|None=None; description:str|None=None; genre:str|None=None; rules:str|None=None; style_guide:str|None=None
class StyleGuideOut(BaseModel): style_guide:str
class ProofreadDiff(BaseModel): original:str; suggested:str; reason:str=''
class ProofreadResult(BaseModel): diffs:list[ProofreadDiff]
class EpisodeCreate(BaseModel): number:int; title:str; summary:str=''; content:str=''
class EpisodeOut(EpisodeCreate): id:int; project_id:int; updated_at:object; model_config=ConfigDict(from_attributes=True)
class EpisodeUpdate(BaseModel): title:str|None=None; summary:str|None=None; content:str|None=None
class EpisodeSaveOut(EpisodeOut): warnings:list[str]=[]
class AIGenerate(BaseModel): project_id:int; episode_id:int|None=None; instruction:str=''; mode:str='continue'; rag_limit:int=6
class RagIndex(BaseModel): project_id:int
class RagSearch(BaseModel): project_id:int; query:str; limit:int=8
class RagSearchAll(BaseModel): query:str; limit:int=8

class MemoCreate(BaseModel): category:str=''; title:str=''; content:str=''
class MemoOut(MemoCreate): id:int; project_id:int; created_at:object; model_config=ConfigDict(from_attributes=True)
class MemoUpdate(BaseModel): category:str|None=None; title:str|None=None; content:str|None=None

class SourceCreate(BaseModel): title:str=''; url:str=''; note:str=''
class SourceOut(SourceCreate): id:int; episode_id:int; project_id:int; created_at:object; model_config=ConfigDict(from_attributes=True)
class SourceUpdate(BaseModel): title:str|None=None; url:str|None=None; note:str|None=None

class MaterialSummarizeOut(BaseModel): summary:str; model:str

class AiUsageSummaryRow(BaseModel):
    provider:str; model:str; calls:int
    input_tokens:int; output_tokens:int; estimated_cost_usd:float|None

class AiUsageSummaryOut(BaseModel):
    rows:list[AiUsageSummaryRow]
    total_calls:int; total_input_tokens:int; total_output_tokens:int; total_estimated_cost_usd:float|None

class AiUsageLogOut(BaseModel):
    id:int; project_id:int|None; provider:str; model:str
    input_tokens:int|None; output_tokens:int|None; estimated_cost_usd:float|None; created_at:object
    model_config=ConfigDict(from_attributes=True)

class TemplateCreate(BaseModel): name:str=''; structure:str=''
class TemplateOut(TemplateCreate): id:int; project_id:int; created_at:object; model_config=ConfigDict(from_attributes=True)
class TemplateUpdate(BaseModel): name:str|None=None; structure:str|None=None

class EpisodeRevisionListOut(BaseModel):
    id:int; title:str; summary:str; created_at:object
    model_config=ConfigDict(from_attributes=True)

class EpisodeRevisionOut(EpisodeRevisionListOut):
    content:str

class ChatMessageCreate(BaseModel): content:str
class ChatMessageOut(BaseModel):
    id:int; project_id:int; role:str; content:str; created_at:object
    model_config=ConfigDict(from_attributes=True)

class ImportJobOut(BaseModel):
    id:int; project_id:int|None; mode:str; source_filename:str; status:str
    total_episodes:int; processed_episodes:int; created_episodes:int; updated_episodes:int
    last_message:str; created_at:object; updated_at:object
    progress_percent:float=0
    model_config=ConfigDict(from_attributes=True)

class ConnectionTestRequest(BaseModel):
    target:str # 'database' | 'qdrant' | 'ollama' | 'anthropic' | 'openai' | 'google'
    url:str|None=None # ignored for 'database'; tests whatever value the form currently holds, saved or not
    model:str|None=None # checks the model is available, not just reachable (all targets except 'database'/'qdrant')
    api_key:str|None=None # 'anthropic' / 'openai' / 'google' only

class ConnectionTestResult(BaseModel):
    ok:bool; message:str; latency_ms:int

class BackupResult(BaseModel):
    timestamp:str
    postgres_ok:bool; postgres_error:str
    qdrant_ok:bool; qdrant_error:str
    duration_seconds:float

class BackupListEntry(BaseModel):
    timestamp:str; has_postgres:bool; has_qdrant:bool; size_bytes:int

class BackupStatusOut(BaseModel):
    enabled:bool; interval_seconds:int; retention_count:int; backup_dir:str
    backups:list[BackupListEntry]

class SystemSettingsOut(BaseModel):
    database_url_masked:str
    qdrant_url:str; qdrant_url_is_override:bool
    ollama_url:str; ollama_url_is_override:bool
    ollama_model:str; ollama_model_is_override:bool
    ollama_embed_model:str; ollama_embed_model_is_override:bool
    ai_provider:str
    anthropic_api_key_is_set:bool; anthropic_model:str
    openai_api_key_is_set:bool; openai_model:str
    google_api_key_is_set:bool; google_model:str
    cors_origins:str; cors_origins_is_override:bool
    updated_at:object|None=None

class TextSearchMatch(BaseModel):
    episode_id:int; number:int; title:str; count:int; snippets:list[str]

class MemoSearchMatch(BaseModel):
    memo_id:int; category:str; title:str; count:int; snippets:list[str]

class TextSearchResult(BaseModel):
    matches:list[TextSearchMatch]; total_matches:int
    memo_matches:list[MemoSearchMatch]=[]; total_memo_matches:int=0

class TextReplaceRequest(BaseModel):
    query:str; replacement:str; case_sensitive:bool=True
    episode_ids:list[int]|None=None # None = every episode in the project

class TextReplaceEpisodeResult(BaseModel):
    episode_id:int; number:int; title:str; replaced_count:int

class TextReplaceResult(BaseModel):
    episodes:list[TextReplaceEpisodeResult]; total_replaced:int

class SystemSettingsUpdate(BaseModel):
    # Empty string clears the override (reverts to the env var). Omitted
    # (unset) fields are left untouched.
    qdrant_url:str|None=None
    ollama_url:str|None=None
    ollama_model:str|None=None
    ollama_embed_model:str|None=None
    ai_provider:str|None=None
    anthropic_api_key:str|None=None
    anthropic_model:str|None=None
    openai_api_key:str|None=None
    openai_model:str|None=None
    google_api_key:str|None=None
    google_model:str|None=None
    # cors_origins is deliberately NOT here — it's env-only
    # (CORS_ORIGINS), never settable from the client. See main.py's
    # system_settings_put for the corresponding server-side guard.
