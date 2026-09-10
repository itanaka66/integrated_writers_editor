import hashlib
from qdrant_client import QdrantClient, models
from .config import settings

COLLECTION = "writers_scenes"

def client():
    return QdrantClient(url=settings.qdrant_url)

def ensure_collection():
    c = client()
    names = [x.name for x in c.get_collections().collections]
    if COLLECTION not in names:
        c.create_collection(
            collection_name=COLLECTION,
            vectors_config=models.VectorParams(size=32, distance=models.Distance.COSINE),
        )

def vectorize(text: str) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values = []
    for b in digest:
        values.append((b / 255.0) * 2.0 - 1.0)
    return (values * 2)[:32]

def upsert_scene(project_id: int, episode_id: int, text: str):
    try:
        ensure_collection()
        client().upsert(
            collection_name=COLLECTION,
            points=[
                models.PointStruct(
                    id=episode_id,
                    vector=vectorize(text),
                    payload={
                        "project_id": project_id,
                        "episode_id": episode_id,
                        "text": text[:5000],
                    },
                )
            ],
        )
    except Exception:
        # Qdrant is optional for the basic MVP.
        pass

def search(project_id: int, query: str, limit: int = 5):
    try:
        ensure_collection()
        result = client().query_points(
            collection_name=COLLECTION,
            query=vectorize(query),
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="project_id",
                        match=models.MatchValue(value=project_id),
                    )
                ]
            ),
            limit=limit,
        )
        return [p.payload for p in result.points]
    except Exception:
        return []
