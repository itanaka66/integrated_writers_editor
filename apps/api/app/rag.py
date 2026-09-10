import logging
from qdrant_client import QdrantClient,models
from .ollama import embed
from .runtime_config import get_effective_config
logger=logging.getLogger(__name__)
COL='writers_story_memory'
def client(): return QdrantClient(url=get_effective_config().qdrant_url)
def ensure(size):
 c=client()
 names=[x.name for x in c.get_collections().collections]
 if COL not in names:
  c.create_collection(collection_name=COL,vectors_config=models.VectorParams(size=size,distance=models.Distance.COSINE))
async def index(chunks):
 if not chunks:return 0
 vs=await embed([x['text'] for x in chunks]);ensure(len(vs[0])); c=client(); c.upsert(collection_name=COL,points=[models.PointStruct(id=x['id'],vector=v,payload=x) for x,v in zip(chunks,vs)]);return len(chunks)
async def search(project_id,q,limit=8):
 v=(await embed([q]))[0];ensure(len(v)); r=client().query_points(collection_name=COL,query=v,query_filter=models.Filter(must=[models.FieldCondition(key='project_id',match=models.MatchValue(value=project_id))]),with_payload=True,limit=limit);return [p.payload for p in r.points]
async def search_all_projects(q,limit=8):
 v=(await embed([q]))[0];ensure(len(v)); r=client().query_points(collection_name=COL,query=v,with_payload=True,limit=limit);return [p.payload for p in r.points]
