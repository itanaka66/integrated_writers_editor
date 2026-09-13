from editor_common.qdrant_service import QdrantSceneStore

from .config import settings

_store = QdrantSceneStore(settings.qdrant_url, collection="writers_scenes")

client = _store.client
ensure_collection = _store.ensure_collection
vectorize = _store.vectorize
upsert_scene = _store.upsert_scene
search = _store.search
