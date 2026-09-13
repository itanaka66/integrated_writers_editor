from editor_common.rag import RagStore

from .ollama import embed
from .runtime_config import get_effective_config

_store = RagStore(
    get_qdrant_url=lambda: get_effective_config().qdrant_url,
    embed=embed,
    collection="writers_story_memory",
)

client = _store.client
ensure = _store.ensure
index = _store.index
search = _store.search
search_all_projects = _store.search_all_projects
