import logging
from .models import Project
from .rag import search
logger=logging.getLogger(__name__)
async def build(db,pid,episode,limit=6):
 p=db.get(Project,pid)
 try:r=await search(pid,episode.content if episode else p.description,limit)
 except Exception:
  logger.exception('RAG search failed while building context for project %s; continuing without RAG results',pid)
  r=[]
 return {'project':{'name':p.name,'description':p.description},'episode':None if not episode else {'number':episode.number,'title':episode.title,'summary':episode.summary,'content':episode.content},'rag':r}
