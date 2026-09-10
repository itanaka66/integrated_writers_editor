import logging
from sqlalchemy import select
from .models import Project,Character,WorldEntity,Plot,Foreshadowing,TimelineEvent
from .rag import search
logger=logging.getLogger(__name__)
async def build(db,pid,episode,limit=6):
 p=db.get(Project,pid); cs=db.scalars(select(Character).where(Character.project_id==pid)).all(); ws=db.scalars(select(WorldEntity).where(WorldEntity.project_id==pid)).all(); ps=db.scalars(select(Plot).where(Plot.project_id==pid)).all(); fs=db.scalars(select(Foreshadowing).where(Foreshadowing.project_id==pid,Foreshadowing.status=='open')).all(); ts=db.scalars(select(TimelineEvent).where(TimelineEvent.project_id==pid).order_by(TimelineEvent.episode_number).limit(30)).all();
 try:r=await search(pid,episode.content if episode else p.description,limit)
 except Exception:
  logger.exception('RAG search failed while building context for project %s; continuing without RAG results',pid)
  r=[]
 return {'project':{'name':p.name,'genre':p.genre,'rules':p.rules,'description':p.description},'episode':None if not episode else {'number':episode.number,'title':episode.title,'summary':episode.summary,'content':episode.content},'characters':[{'name':c.name,'role':c.role,'personality':c.personality,'speech_style':c.speech_style,'goal':c.goal,'status':c.status} for c in cs],'world':[{'name':w.name,'type':w.entity_type,'description':w.description,'rules':w.rules,'location':w.location,'era':w.era} for w in ws],'plots':[{'title':x.title,'type':x.plot_type,'status':x.status,'objective':x.objective,'conflict':x.conflict,'resolution':x.resolution,'start':x.start_episode,'end':x.end_episode} for x in ps],'foreshadowings':[{'title':f.title,'description':f.description,'setup':f.setup_episode,'payoff':f.payoff_episode} for f in fs],'timeline':[{'episode':t.episode_number,'title':t.title,'world_time':t.world_time,'description':t.description} for t in ts],'rag':r}
