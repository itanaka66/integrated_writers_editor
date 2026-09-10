import logging
import json
import re
from fastapi import FastAPI,Depends,HTTPException,Response,UploadFile,File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from .db import get_db,SessionLocal
from .config import settings
from .models import *
from .schemas import *
from .ollama import generate
from .rag import index,search,search_all_projects
from .context import build
from .continuity import update_character_states, check_continuity
from .auth import BasicAuthMiddleware
from . import export as export_mod
from . import runtime_config as rc
from . import file_sync
from .revisions import snapshot_revision
import asyncio
from .auto_writer import run_job, running as auto_write_running
from .importer import run_import_job, running as import_running
from . import narou_import as ni
from . import connection_test
from . import backup as backup_mod
logging.basicConfig(level=logging.INFO)
logger=logging.getLogger(__name__)
if settings.admin_password=='writers-studio-change-me':
 logger.warning('ADMIN_PASSWORD is not set; using the insecure default. Set ADMIN_USERNAME/ADMIN_PASSWORD before exposing this service.')
app=FastAPI(title='Integrated writers Editor (INE) API',version='0.5.0')
# Starlette wraps middleware in reverse of add order (last added = outermost),
# so BasicAuthMiddleware is added first: CORS must stay outermost or a 401
# response never gets CORS headers and the browser reports an opaque network
# error instead of a readable 401.
app.add_middleware(BasicAuthMiddleware)
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(',')],allow_methods=['*'],allow_headers=['*'],allow_credentials=True)
_background_tasks=set() # strong refs so asyncio doesn't GC in-flight background tasks (autosync loop)
def chunks(e):
 s=e.content or ''; out=[]; start=0;i=0
 while start<len(s):
  t=s[start:start+1400];out.append({'id':e.id*100000+i,'project_id':e.project_id,'episode_id':e.id,'title':e.title,'source_type':'episode','text':t});i+=1;start+=1200
 return out
def cleanup_stale_auto_write_jobs(d):
 # auto_write_running is an in-memory dict, so any job left 'queued'/'running'/
 # 'stopping' from before a restart has no task actually driving it anymore —
 # it would otherwise sit there forever looking active. Mark those as errored.
 stale=d.scalars(select(AutoWriteJob).where(AutoWriteJob.status.in_(['queued','running','stopping']))).all()
 for job in stale:
  job.status='error'; job.last_message='サーバー再起動により中断されました。再度開始してください。'
 if stale: d.commit()
 return len(stale)
def cleanup_stale_import_jobs(d):
 stale=d.scalars(select(ImportJob).where(ImportJob.status.in_(['queued','running']))).all()
 for job in stale:
  job.status='error'; job.last_message='サーバー再起動により中断されました。再度インポートしてください。'
 if stale: d.commit()
 return len(stale)
@app.on_event('startup')
def init():
 # Schema is owned by Alembic migrations (see apps/api/alembic/); run
 # `alembic upgrade head` before starting the app. We only seed demo data
 # here, on top of whatever schema migrations have already applied.
 with SessionLocal() as d:
  if not d.scalar(select(Project).limit(1)):
   p=Project(name='恐竜時代文明開拓記 DEMO',description='現代知識で恐竜時代に文明を築く',genre='SF / 文明開拓',rules='魔法なし。現代知識は実験と失敗を経て再現する。');d.add(p);d.flush()
   d.add_all([Character(project_id=p.id,name='田中',role='主人公',personality='慎重だが好奇心旺盛',speech_style='現代日本語',goal='文明を安全に発展させる'),Character(project_id=p.id,name='リナ',role='仲間',personality='行動派',speech_style='短く率直',goal='集落を守る')])
   d.add_all([WorldEntity(project_id=p.id,name='最初の集落',entity_type='location',description='森の近くの集落',location='大河東岸'),WorldEntity(project_id=p.id,name='鉄器',entity_type='technology',description='まだ存在しない重要技術',rules='鉱石→炉→燃料の順に確立')])
   d.add(Plot(project_id=p.id,title='文明開拓編',plot_type='main_arc',status='active',start_episode=1,end_episode=100,objective='安全な集落を作る',conflict='自然災害と恐竜'))
   d.add(Foreshadowing(project_id=p.id,title='地下の鉱脈',description='集落近くの岩場に金属資源がある',setup_episode=3))
   d.add_all([Episode(project_id=p.id,number=1,title='転移',summary='少年が恐竜時代で目を覚ます',content='少年は見知らぬ森で目を覚ました。遠くから巨大な咆哮が聞こえる。'),Episode(project_id=p.id,number=2,title='最初の火',summary='火を安定利用する',content='乾いた枝を集め、火を起こす方法を試した。何度も失敗した。'),Episode(project_id=p.id,number=3,title='最初の仲間',summary='集落と出会う',content='森を抜けると小さな集落が見えた。')]);d.commit()
  cleanup_stale_auto_write_jobs(d)
  cleanup_stale_import_jobs(d)
 _background_tasks.add(asyncio.create_task(file_sync.autosync_loop()))
 _background_tasks.add(asyncio.create_task(backup_mod.backup_loop()))
@app.get('/api/v1/health')
def health():return {'status':'ok','version':'0.5.0','features':['continuity-checker','character-state-auto-update','story-digital-twin']}
MAX_PAGE_SIZE=500
def clamp_limit(limit):return max(1,min(limit,MAX_PAGE_SIZE))
def crud_list(db,model,pid,limit=200,offset=0):return list(db.scalars(select(model).where(model.project_id==pid).order_by(model.id).limit(clamp_limit(limit)).offset(max(0,offset))).all())
def crud_get_or_404(db,model,oid,label):
 o=db.get(model,oid)
 if not o:raise HTTPException(404,f'{label} not found')
 return o
def crud_update(db,model,oid,x,label):
 o=crud_get_or_404(db,model,oid,label)
 for k,v in x.model_dump(exclude_unset=True).items():setattr(o,k,v)
 db.commit();db.refresh(o)
 return o
def crud_delete(db,model,oid,label):
 o=crud_get_or_404(db,model,oid,label)
 db.delete(o);db.commit()
@app.get('/api/v1/projects',response_model=list[ProjectOut])
def projects(limit:int=200,offset:int=0,db:Session=Depends(get_db)):return list(db.scalars(select(Project).order_by(Project.id.desc()).limit(clamp_limit(limit)).offset(max(0,offset))).all())
@app.get('/api/v1/projects/{pid}',response_model=ProjectOut)
def project(pid:int,db:Session=Depends(get_db)):
 p=db.get(Project,pid)
 if not p:raise HTTPException(404,'Project not found')
 return p
@app.post('/api/v1/projects',response_model=ProjectOut)
def project_add(x:ProjectCreate,db:Session=Depends(get_db)):p=Project(**x.model_dump());db.add(p);db.commit();db.refresh(p);return p
@app.put('/api/v1/projects/{pid}',response_model=ProjectOut)
def project_put(pid:int,x:ProjectUpdate,db:Session=Depends(get_db)):return crud_update(db,Project,pid,x,'Project')
def content_disposition(filename,ext):
 # filename=... must be latin-1 (the title is almost always non-ASCII
 # Japanese), so give ASCII-only clients a safe fallback name and encode
 # the real one as filename* per RFC 5987/6266.
 from urllib.parse import quote
 return f'attachment; filename="export.{ext}"; filename*=UTF-8\'\'{quote(filename)}.{ext}'
@app.get('/api/v1/projects/{pid}/export')
def project_export(pid:int,format:str='txt',db:Session=Depends(get_db)):
 p=crud_get_or_404(db,Project,pid,'Project')
 eps=db.scalars(select(Episode).where(Episode.project_id==pid).order_by(Episode.number)).all()
 name=p.name or f'project-{pid}'
 if format=='txt':
  return Response(export_mod.build_text(p,eps),media_type='text/plain; charset=utf-8',headers={'Content-Disposition':content_disposition(name,'txt')})
 if format=='md':
  return Response(export_mod.build_markdown(p,eps),media_type='text/markdown; charset=utf-8',headers={'Content-Disposition':content_disposition(name,'md')})
 if format=='epub':
  return Response(export_mod.build_epub(p,eps),media_type='application/epub+zip',headers={'Content-Disposition':content_disposition(name,'epub')})
 raise HTTPException(400,'format must be one of: txt, md, epub')

def _system_settings_out(db):
 row=db.get(RuntimeConfig,rc.SINGLETON_ID)
 cfg=rc.get_effective_config(db)
 def override(v):return bool(v)
 return SystemSettingsOut(
  database_url_masked=rc.mask_database_url(settings.database_url),
  qdrant_url=cfg.qdrant_url,qdrant_url_is_override=override(row.qdrant_url if row else None),
  ollama_url=cfg.ollama_url,ollama_url_is_override=override(row.ollama_url if row else None),
  ollama_model=cfg.ollama_model,ollama_model_is_override=override(row.ollama_model if row else None),
  ollama_embed_model=cfg.ollama_embed_model,ollama_embed_model_is_override=override(row.ollama_embed_model if row else None),
  controller_ollama_url=cfg.controller_ollama_url,controller_ollama_url_is_override=override(row.controller_ollama_url if row else None),
  controller_ollama_model=cfg.controller_ollama_model,controller_ollama_model_is_override=override(row.controller_ollama_model if row else None),
  updated_at=row.updated_at if row else None,
 )
@app.get('/api/v1/system-settings',response_model=SystemSettingsOut)
def system_settings_get(db:Session=Depends(get_db)):return _system_settings_out(db)
@app.put('/api/v1/system-settings',response_model=SystemSettingsOut)
def system_settings_put(x:SystemSettingsUpdate,db:Session=Depends(get_db)):
 row=db.get(RuntimeConfig,rc.SINGLETON_ID)
 if not row:
  row=RuntimeConfig(id=rc.SINGLETON_ID);db.add(row)
 for k,v in x.model_dump(exclude_unset=True).items():setattr(row,k,v or None)
 db.commit();db.refresh(row)
 return _system_settings_out(db)
@app.get('/api/v1/backups',response_model=BackupStatusOut)
def backups_status():
 return BackupStatusOut(
  enabled=settings.backup_enabled,interval_seconds=settings.backup_interval_seconds,
  retention_count=settings.backup_retention_count,backup_dir=settings.backup_dir,
  backups=[BackupListEntry(**b) for b in backup_mod.list_backups()],
 )
@app.post('/api/v1/backups/run',response_model=BackupResult)
def backups_run():
 return BackupResult(**backup_mod.run_backup())
@app.post('/api/v1/system-settings/test-connection',response_model=ConnectionTestResult)
def system_settings_test_connection(x:ConnectionTestRequest):
 if x.target=='database':
  ok,msg,ms=connection_test.test_database()
 elif x.target=='qdrant':
  if not x.url:raise HTTPException(400,'url is required')
  ok,msg,ms=connection_test.test_qdrant(x.url)
 elif x.target in ('ollama','controller_ollama'):
  if not x.url:raise HTTPException(400,'url is required')
  ok,msg,ms=connection_test.test_ollama(x.url,x.model)
 else:
  raise HTTPException(400,f'unknown target: {x.target}')
 return ConnectionTestResult(ok=ok,message=msg,latency_ms=ms)
def _snippets(text,query,case_sensitive,max_snippets=3,context=24):
 hay=text if case_sensitive else text.lower()
 needle=query if case_sensitive else query.lower()
 out=[];start=0
 while len(out)<max_snippets:
  i=hay.find(needle,start)
  if i<0:break
  s=max(0,i-context);e=min(len(text),i+len(query)+context)
  out.append(('…' if s>0 else '')+text[s:e]+('…' if e<len(text) else ''))
  start=i+len(needle)
 return out
def _count(text,query,case_sensitive):
 return (text if case_sensitive else text.lower()).count(query if case_sensitive else query.lower())
@app.get('/api/v1/projects/{pid}/text-search',response_model=TextSearchResult)
def project_text_search(pid:int,query:str,case_sensitive:bool=True,db:Session=Depends(get_db)):
 if not query:return TextSearchResult(matches=[],total_matches=0)
 eps=list(db.scalars(select(Episode).where(Episode.project_id==pid).order_by(Episode.number)).all())
 matches=[]
 for e in eps:
  c=_count(e.content or '',query,case_sensitive)
  if c:matches.append(TextSearchMatch(episode_id=e.id,number=e.number,title=e.title,count=c,snippets=_snippets(e.content or '',query,case_sensitive)))
 return TextSearchResult(matches=matches,total_matches=sum(m.count for m in matches))
@app.post('/api/v1/projects/{pid}/text-replace',response_model=TextReplaceResult)
async def project_text_replace(pid:int,x:TextReplaceRequest,db:Session=Depends(get_db)):
 if not x.query:raise HTTPException(400,'query must not be empty')
 q=select(Episode).where(Episode.project_id==pid)
 if x.episode_ids is not None:q=q.where(Episode.id.in_(x.episode_ids))
 eps=list(db.scalars(q.order_by(Episode.number)).all())
 results=[]
 for e in eps:
  content=e.content or ''
  n=_count(content,x.query,x.case_sensitive)
  if not n:continue
  snapshot_revision(db,e)
  if x.case_sensitive:
   e.content=content.replace(x.query,x.replacement)
  else:
   e.content=re.sub(re.escape(x.query),lambda m:x.replacement,content,flags=re.IGNORECASE)
  db.commit();db.refresh(e)
  file_sync.write_episode_file(e.project,e)
  try:await index(chunks(e))
  except Exception:logger.exception('RAG indexing failed for episode %s after text-replace',e.id)
  results.append(TextReplaceEpisodeResult(episode_id=e.id,number=e.number,title=e.title,replaced_count=n))
 return TextReplaceResult(episodes=results,total_replaced=sum(r.replaced_count for r in results))
def _import_job_out(job):
 pct=round(job.processed_episodes/job.total_episodes*100,1) if job.total_episodes else 0.0
 return ImportJobOut(**{c.name:getattr(job,c.name) for c in ImportJob.__table__.columns},progress_percent=pct)
async def _decode_upload(f:UploadFile)->str:
 raw=await f.read()
 for enc in ('utf-8-sig','cp932'):
  try:return raw.decode(enc)
  except UnicodeDecodeError:continue
 raise HTTPException(400,'テキストファイルの文字コードを認識できませんでした（UTF-8 / Shift-JISのみ対応）。')
@app.post('/api/v1/import/writers',response_model=ImportJobOut)
async def import_writers(file:UploadFile=File(...),db:Session=Depends(get_db)):
 text=await _decode_upload(file)
 if not ni.is_writers_export(text) and not ni.is_draft_episodes(text):
  raise HTTPException(400,'なろう形式のエピソード区切りが見つかりませんでした。')
 job=ImportJob(mode='writers',source_filename=file.filename or '',status='queued',last_message='キューに追加しました')
 db.add(job);db.commit();db.refresh(job)
 task=asyncio.create_task(run_import_job(job.id,text))
 import_running[job.id]=task
 return _import_job_out(job)
@app.post('/api/v1/projects/{pid}/import/episodes',response_model=ImportJobOut)
async def import_episodes(pid:int,file:UploadFile=File(...),db:Session=Depends(get_db)):
 crud_get_or_404(db,Project,pid,'Project')
 text=await _decode_upload(file)
 if not ni.is_writers_export(text) and not ni.is_draft_episodes(text):
  raise HTTPException(400,'なろう形式のエピソード区切りが見つかりませんでした。')
 job=ImportJob(project_id=pid,mode='episodes',source_filename=file.filename or '',status='queued',last_message='キューに追加しました')
 db.add(job);db.commit();db.refresh(job)
 task=asyncio.create_task(run_import_job(job.id,text))
 import_running[job.id]=task
 return _import_job_out(job)
@app.get('/api/v1/import-jobs/{job_id}',response_model=ImportJobOut)
def import_job_get(job_id:int,db:Session=Depends(get_db)):
 job=crud_get_or_404(db,ImportJob,job_id,'Import job')
 return _import_job_out(job)
@app.get('/api/v1/projects/{pid}/import-jobs',response_model=list[ImportJobOut])
def import_jobs_for_project(pid:int,db:Session=Depends(get_db)):
 jobs=db.scalars(select(ImportJob).where(ImportJob.project_id==pid).order_by(ImportJob.id.desc()).limit(20)).all()
 return [_import_job_out(j) for j in jobs]
@app.get('/api/v1/projects/{pid}/episodes',response_model=list[EpisodeOut])
def episodes(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)):return list(db.scalars(select(Episode).where(Episode.project_id==pid).order_by(Episode.number).limit(clamp_limit(limit)).offset(max(0,offset))).all())
@app.post('/api/v1/projects/{pid}/episodes',response_model=EpisodeOut)
def episode_add(pid:int,x:EpisodeCreate,db:Session=Depends(get_db)):
 e=Episode(project_id=pid,**x.model_dump());db.add(e);db.commit();db.refresh(e)
 file_sync.write_episode_file(e.project,e)
 return e
@app.put('/api/v1/episodes/{eid}',response_model=EpisodeSaveOut)
async def episode_put(eid:int,x:EpisodeUpdate,db:Session=Depends(get_db)):
 e=db.get(Episode,eid)
 if not e:raise HTTPException(404,'Episode not found')
 updates=x.model_dump(exclude_unset=True)
 if 'content' in updates and updates['content']!=e.content:snapshot_revision(db,e)
 for k,v in updates.items():setattr(e,k,v)
 db.commit();db.refresh(e)
 file_sync.write_episode_file(e.project,e)
 warnings=[]
 try:
  await index(chunks(e))
 except Exception:
  logger.exception('RAG indexing failed for episode %s',eid)
  warnings.append('RAG索引の更新に失敗しました。意味検索の結果が古いままの可能性があります。')
 try:
  await update_character_states(db,e.project_id,e)
 except Exception:
  logger.exception('Character-state auto-update failed for episode %s',eid)
  warnings.append('キャラクター状態の自動更新に失敗しました。AIサービスの状態を確認してください。')
 return EpisodeSaveOut(**EpisodeOut.model_validate(e).model_dump(),warnings=warnings)
@app.delete('/api/v1/episodes/{eid}',status_code=204)
def episode_delete(eid:int,db:Session=Depends(get_db)):
 e=crud_get_or_404(db,Episode,eid,'Episode')
 project=e.project
 file_sync.delete_episode_file(project,e)
 db.delete(e);db.commit()
@app.get('/api/v1/episodes/{eid}/revisions',response_model=list[EpisodeRevisionListOut])
def episode_revisions(eid:int,db:Session=Depends(get_db)):
 crud_get_or_404(db,Episode,eid,'Episode')
 return list(db.scalars(select(EpisodeRevision).where(EpisodeRevision.episode_id==eid).order_by(EpisodeRevision.id.desc())).all())
@app.get('/api/v1/episodes/{eid}/revisions/{rid}',response_model=EpisodeRevisionOut)
def episode_revision_get(eid:int,rid:int,db:Session=Depends(get_db)):
 r=db.get(EpisodeRevision,rid)
 if not r or r.episode_id!=eid:raise HTTPException(404,'Revision not found')
 return r
@app.post('/api/v1/episodes/{eid}/revisions/{rid}/restore',response_model=EpisodeOut)
def episode_revision_restore(eid:int,rid:int,db:Session=Depends(get_db)):
 e=crud_get_or_404(db,Episode,eid,'Episode')
 r=db.get(EpisodeRevision,rid)
 if not r or r.episode_id!=eid:raise HTTPException(404,'Revision not found')
 snapshot_revision(db,e)
 e.title=r.title;e.summary=r.summary;e.content=r.content
 db.commit();db.refresh(e)
 file_sync.write_episode_file(e.project,e)
 return e
@app.get('/api/v1/projects/{pid}/characters',response_model=list[CharacterOut])
def chars(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)):return crud_list(db,Character,pid,limit,offset)
@app.post('/api/v1/projects/{pid}/characters',response_model=CharacterOut)
def char_add(pid:int,x:CharacterCreate,db:Session=Depends(get_db)):o=Character(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/characters/{cid}',response_model=CharacterOut)
def char_put(cid:int,x:CharacterUpdate,db:Session=Depends(get_db)):return crud_update(db,Character,cid,x,'Character')
@app.delete('/api/v1/characters/{cid}',status_code=204)
def char_delete(cid:int,db:Session=Depends(get_db)):crud_delete(db,Character,cid,'Character')
@app.get('/api/v1/projects/{pid}/world',response_model=list[WorldOut])
def worlds(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)):return crud_list(db,WorldEntity,pid,limit,offset)
@app.post('/api/v1/projects/{pid}/world',response_model=WorldOut)
def world_add(pid:int,x:WorldCreate,db:Session=Depends(get_db)):o=WorldEntity(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/world/{wid}',response_model=WorldOut)
def world_put(wid:int,x:WorldUpdate,db:Session=Depends(get_db)):return crud_update(db,WorldEntity,wid,x,'World entity')
@app.delete('/api/v1/world/{wid}',status_code=204)
def world_delete(wid:int,db:Session=Depends(get_db)):crud_delete(db,WorldEntity,wid,'World entity')
@app.get('/api/v1/projects/{pid}/plots',response_model=list[PlotOut])
def plots(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)):return crud_list(db,Plot,pid,limit,offset)
@app.post('/api/v1/projects/{pid}/plots',response_model=PlotOut)
def plot_add(pid:int,x:PlotCreate,db:Session=Depends(get_db)):o=Plot(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/plots/{pid}',response_model=PlotOut)
def plot_put(pid:int,x:PlotUpdate,db:Session=Depends(get_db)):return crud_update(db,Plot,pid,x,'Plot')
@app.delete('/api/v1/plots/{pid}',status_code=204)
def plot_delete(pid:int,db:Session=Depends(get_db)):crud_delete(db,Plot,pid,'Plot')
@app.get('/api/v1/projects/{pid}/foreshadowings',response_model=list[ForeshadowOut])
def fs(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)):return crud_list(db,Foreshadowing,pid,limit,offset)
@app.post('/api/v1/projects/{pid}/foreshadowings',response_model=ForeshadowOut)
def fs_add(pid:int,x:ForeshadowCreate,db:Session=Depends(get_db)):o=Foreshadowing(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/foreshadowings/{fid}',response_model=ForeshadowOut)
def fs_put(fid:int,x:ForeshadowUpdate,db:Session=Depends(get_db)):return crud_update(db,Foreshadowing,fid,x,'Foreshadowing')
@app.delete('/api/v1/foreshadowings/{fid}',status_code=204)
def fs_delete(fid:int,db:Session=Depends(get_db)):crud_delete(db,Foreshadowing,fid,'Foreshadowing')
@app.get('/api/v1/projects/{pid}/character-relations',response_model=list[CharacterRelationOut])
def char_relations(pid:int,db:Session=Depends(get_db)):return crud_list(db,CharacterRelation,pid)
@app.post('/api/v1/projects/{pid}/character-relations',response_model=CharacterRelationOut)
def char_relation_add(pid:int,x:CharacterRelationCreate,db:Session=Depends(get_db)):o=CharacterRelation(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.delete('/api/v1/character-relations/{rid}',status_code=204)
def char_relation_delete(rid:int,db:Session=Depends(get_db)):crud_delete(db,CharacterRelation,rid,'Character relation')
@app.get('/api/v1/projects/{pid}/world-relations',response_model=list[WorldRelationOut])
def world_relations(pid:int,db:Session=Depends(get_db)):return crud_list(db,WorldRelation,pid)
@app.post('/api/v1/projects/{pid}/world-relations',response_model=WorldRelationOut)
def world_relation_add(pid:int,x:WorldRelationCreate,db:Session=Depends(get_db)):o=WorldRelation(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.delete('/api/v1/world-relations/{rid}',status_code=204)
def world_relation_delete(rid:int,db:Session=Depends(get_db)):crud_delete(db,WorldRelation,rid,'World relation')
@app.post('/api/v1/rag/index')
async def rag_index(x:RagIndex,db:Session=Depends(get_db)):
 es=db.scalars(select(Episode).where(Episode.project_id==x.project_id)).all(); cs=[c for e in es for c in chunks(e)]
 try:
  return {'indexed':await index(cs)}
 except Exception as ex:
  logger.exception('RAG index rebuild failed for project %s',x.project_id)
  raise HTTPException(503,f'RAG index rebuild failed: {ex}') from ex
@app.post('/api/v1/rag/search')
async def rag_search(x:RagSearch,db:Session=Depends(get_db)):
 try:
  return {'source':'qdrant','results':await search(x.project_id,x.query,x.limit)}
 except Exception:
  logger.exception('Qdrant search failed for project %s; falling back to PostgreSQL ILIKE search',x.project_id)
  rows=db.scalars(select(Episode).where(Episode.project_id==x.project_id,Episode.content.ilike('%'+x.query+'%')).limit(x.limit)).all()
  return {'source':'postgresql','results':[{'episode_id':e.id,'title':e.title,'text':e.content} for e in rows]}
@app.post('/api/v1/rag/search-all')
async def rag_search_all(x:RagSearchAll,db:Session=Depends(get_db)):
 try:
  return {'source':'qdrant','results':await search_all_projects(x.query,x.limit)}
 except Exception:
  logger.exception('Cross-project Qdrant search failed; falling back to PostgreSQL ILIKE search')
  rows=db.scalars(select(Episode).where(Episode.content.ilike('%'+x.query+'%')).limit(x.limit)).all()
  projects={p.id:p.name for p in db.scalars(select(Project)).all()}
  return {'source':'postgresql','results':[{'episode_id':e.id,'project_id':e.project_id,'project_name':projects.get(e.project_id,''),'title':e.title,'text':e.content} for e in rows]}
@app.post('/api/v1/ai/generate')
async def ai(x:AIGenerate,db:Session=Depends(get_db)):
 e=db.get(Episode,x.episode_id) if x.episode_id else None;c=await build(db,x.project_id,e,x.rag_limit)
 task={'continue':'本文の続きを書く','summary':'本文を要約する','plot':'次の展開を提案する','proofread':'設定・表現・時系列を校正する'}.get(x.mode,'依頼を実行する')
 prompt=f'''あなたは長編小説の編集長AIです。作品の正本設定を最優先してください。\n作業:{task}\n\nContext:\n{json.dumps(c,ensure_ascii=False,indent=2)}\n\n指示:{x.instruction}\n日本語で出力してください。'''
 try:t,m=await generate(prompt)
 except Exception as ex:raise HTTPException(503,f'Ollama error: {ex}')
 return {'text':t,'model':m,'context':{'characters':len(c['characters']),'world':len(c['world']),'plots':len(c['plots']),'foreshadowings':len(c['foreshadowings']),'rag':len(c['rag'])}}

@app.get('/api/v1/projects/{pid}/chat',response_model=list[ChatMessageOut])
def chat_history(pid:int,limit:int=200,db:Session=Depends(get_db)):
 return list(db.scalars(select(ChatMessage).where(ChatMessage.project_id==pid).order_by(ChatMessage.id).limit(clamp_limit(limit))).all())

@app.post('/api/v1/projects/{pid}/chat',response_model=list[ChatMessageOut])
async def chat_send(pid:int,x:ChatMessageCreate,db:Session=Depends(get_db)):
 crud_get_or_404(db,Project,pid,'Project')
 user_msg=ChatMessage(project_id=pid,role='user',content=x.content);db.add(user_msg);db.commit();db.refresh(user_msg)
 c=await build(db,pid,None,8)
 prompt=f'''あなたは長編小説のAIチャットアシスタントです。作品の正本設定を最優先してください。\n\nContext:\n{json.dumps(c,ensure_ascii=False,indent=2)}\n\n質問:{x.content}\n日本語で出力してください。'''
 try:
  t,_=await generate(prompt)
 except Exception as ex:
  t=f'エラーが発生しました。AIサービスの状態を確認してください。（{ex}）'
 assistant_msg=ChatMessage(project_id=pid,role='assistant',content=t);db.add(assistant_msg);db.commit();db.refresh(assistant_msg)
 return [user_msg,assistant_msg]

@app.delete('/api/v1/projects/{pid}/chat',status_code=204)
def chat_clear(pid:int,db:Session=Depends(get_db)):
 for m in db.scalars(select(ChatMessage).where(ChatMessage.project_id==pid)).all():db.delete(m)
 db.commit()


@app.get('/api/v1/projects/{pid}/characters/{cid}/states',response_model=list[CharacterStateOut])
def character_states(pid:int,cid:int,db:Session=Depends(get_db)):
    return list(db.scalars(select(CharacterState).where(CharacterState.project_id==pid,CharacterState.character_id==cid).order_by(CharacterState.episode_number.desc())).all())

@app.get('/api/v1/projects/{pid}/continuity/issues',response_model=list[ContinuityIssueOut])
def continuity_issues(pid:int,db:Session=Depends(get_db)):
    return list(db.scalars(select(ContinuityIssue).where(ContinuityIssue.project_id==pid).order_by(ContinuityIssue.id.desc()).limit(100)).all())

@app.post('/api/v1/continuity/check')
async def continuity_check(x:ContinuityCheck,db:Session=Depends(get_db)):
    try:
        issues=await check_continuity(db,x.project_id,x.episode_id)
        return {'count':len(issues),'issues':[ContinuityIssueOut.model_validate(i).model_dump() for i in issues]}
    except Exception as ex: raise HTTPException(503,str(ex))

@app.post('/api/v1/episodes/{eid}/character-states')
async def character_state_update(eid:int,db:Session=Depends(get_db)):
    e=db.get(Episode,eid)
    if not e: raise HTTPException(404,'Episode not found')
    try:
        states=await update_character_states(db,e.project_id,e)
        return {'count':len(states),'states':[CharacterStateOut.model_validate(x).model_dump() for x in states]}
    except Exception as ex: raise HTTPException(503,str(ex))

@app.get('/api/v1/projects/{pid}/graphs/characters', response_model=GraphOut)
def character_graph(pid:int,db:Session=Depends(get_db)):
    chars=list(db.scalars(select(Character).where(Character.project_id==pid).order_by(Character.id)).all())
    nodes=[GraphNode(id=c.id,label=c.name,node_type='character',meta={'role':c.role,'status':c.status}) for c in chars]
    edges=[]
    rels=list(db.scalars(select(CharacterRelation).where(CharacterRelation.project_id==pid)).all())
    for r in rels: edges.append(GraphEdge(source=r.from_character_id,target=r.to_character_id,label=r.relation_type,weight=r.strength,meta={'description':r.description}))
    # Fallback/augmentation: co-occurrence in episode text creates weak semantic links.
    eps=list(db.scalars(select(Episode).where(Episode.project_id==pid)).all())
    for i,a in enumerate(chars):
        for b in chars[i+1:]:
            count=sum(1 for e in eps if a.name in (e.content or '') and b.name in (e.content or ''))
            if count and not any((x.source==a.id and x.target==b.id) or (x.source==b.id and x.target==a.id) for x in edges):
                edges.append(GraphEdge(source=a.id,target=b.id,label='共演',weight=min(count,5),meta={'episodes':count}))
    return GraphOut(nodes=nodes,edges=edges)

@app.get('/api/v1/projects/{pid}/graphs/world', response_model=GraphOut)
def world_graph(pid:int,db:Session=Depends(get_db)):
    worlds=list(db.scalars(select(WorldEntity).where(WorldEntity.project_id==pid).order_by(WorldEntity.id)).all())
    nodes=[GraphNode(id=w.id,label=w.name,node_type='world',meta={'type':w.entity_type,'location':w.location,'era':w.era}) for w in worlds]
    edges=[]
    rels=list(db.scalars(select(WorldRelation).where(WorldRelation.project_id==pid)).all())
    for r in rels: edges.append(GraphEdge(source=r.from_world_id,target=r.to_world_id,label=r.relation_type,weight=r.strength,meta={'description':r.description}))
    eps=list(db.scalars(select(Episode).where(Episode.project_id==pid)).all())
    for i,a in enumerate(worlds):
        for b in worlds[i+1:]:
            count=sum(1 for e in eps if a.name in (e.content or '') and b.name in (e.content or ''))
            if count and not any((x.source==a.id and x.target==b.id) or (x.source==b.id and x.target==a.id) for x in edges):
                edges.append(GraphEdge(source=a.id,target=b.id,label='共起',weight=min(count,5),meta={'episodes':count}))
    return GraphOut(nodes=nodes,edges=edges)

@app.get('/api/v1/projects/{pid}/graphs/timeline', response_model=GraphOut)
def timeline_graph(pid:int,db:Session=Depends(get_db)):
    eps=list(db.scalars(select(Episode).where(Episode.project_id==pid).order_by(Episode.number)).all())
    events=list(db.scalars(select(TimelineEvent).where(TimelineEvent.project_id==pid).order_by(TimelineEvent.episode_number,TimelineEvent.id)).all())
    nodes=[]
    for e in eps:
        nodes.append(GraphNode(id=1000000+e.id,label=f'EP.{e.number} {e.title}',node_type='episode',meta={'episode':e.number,'summary':e.summary}))
    for t in events:
        nodes.append(GraphNode(id=2000000+t.id,label=t.title,node_type='event',meta={'episode':t.episode_number,'world_time':t.world_time,'description':t.description}))
    edges=[]
    for a,b in zip(eps,eps[1:]): edges.append(GraphEdge(source=1000000+a.id,target=1000000+b.id,label='次話',weight=1))
    for t in events: edges.append(GraphEdge(source=1000000+next((e.id for e in eps if e.number==t.episode_number),0),target=2000000+t.id,label=t.world_time or '出来事',weight=1))
    return GraphOut(nodes=nodes,edges=edges)


@app.get('/api/v1/projects/{pid}/story-twin', response_model=TwinOut)
def story_twin(pid:int,db:Session=Depends(get_db)):
    p=db.get(Project,pid)
    if not p: raise HTTPException(404,'Project not found')
    # Build the Digital Twin from the authoritative relational model plus derived graph views.
    eps=list(db.scalars(select(Episode).where(Episode.project_id==pid).order_by(Episode.number)).all())
    chars=list(db.scalars(select(Character).where(Character.project_id==pid)).all())
    worlds=list(db.scalars(select(WorldEntity).where(WorldEntity.project_id==pid)).all())
    plots=list(db.scalars(select(Plot).where(Plot.project_id==pid)).all())
    fs=list(db.scalars(select(Foreshadowing).where(Foreshadowing.project_id==pid)).all())
    states=list(db.scalars(select(CharacterState).where(CharacterState.project_id==pid).order_by(CharacterState.episode_number.desc(),CharacterState.id.desc()).limit(50)).all())
    issues=list(db.scalars(select(ContinuityIssue).where(ContinuityIssue.project_id==pid,ContinuityIssue.status=='open')).all())
    cg=character_graph(pid,db); wg=world_graph(pid,db); tg=timeline_graph(pid,db)
    completed=sum(1 for e in eps if (e.content or '').strip())
    open_fs=sum(1 for f in fs if f.status=='open')
    high=sum(1 for i in issues if i.severity=='high')
    # Coverage is a practical quality signal, not an AI confidence score.
    coverage=round((completed/len(eps))*100) if eps else 0
    health_score=max(0,min(100,round(100 - high*15 - max(0,len(issues)-high)*4 + min(20,coverage*0.2))))
    health_label='healthy' if health_score>=85 else ('attention' if health_score>=60 else 'risk')
    recent=[CharacterStateOut.model_validate(x).model_dump() for x in states]
    return TwinOut(
      project={'id':p.id,'name':p.name,'genre':p.genre,'description':p.description},
      metrics={'episodes':len(eps),'characters':len(chars),'world_entities':len(worlds),'plots':len(plots),'foreshadowings':len(fs),'states':len(states),'continuity_open':len(issues),'continuity_high':high,'graph_nodes':len(cg.nodes)+len(wg.nodes)+len(tg.nodes),'graph_edges':len(cg.edges)+len(wg.edges)+len(tg.edges)},
      health={'score':health_score,'label':health_label,'episode_coverage':coverage,'explanation':'作品の構造化データ・状態履歴・未解決矛盾から算出した運用指標です。'},
      characters=cg,world=wg,timeline=tg,recent_states=recent,
      continuity={'open':len(issues),'high':high,'medium':sum(1 for i in issues if i.severity=='medium'),'low':sum(1 for i in issues if i.severity=='low')},
      active_plots=[{'id':x.id,'title':x.title,'status':x.status,'start_episode':x.start_episode,'end_episode':x.end_episode} for x in plots if x.status in ('active','planned')],
      open_foreshadowings=[{'id':x.id,'title':x.title,'setup_episode':x.setup_episode,'payoff_episode':x.payoff_episode,'status':x.status} for x in fs if x.status=='open']
    )

@app.get('/api/v1/projects/{pid}/timeline',response_model=list[TimelineOut])
def timeline(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)): return list(db.scalars(select(TimelineEvent).where(TimelineEvent.project_id==pid).order_by(TimelineEvent.episode_number,TimelineEvent.id).limit(clamp_limit(limit)).offset(max(0,offset))).all())
@app.post('/api/v1/projects/{pid}/timeline',response_model=TimelineOut)
def timeline_add(pid:int,x:TimelineCreate,db:Session=Depends(get_db)):
    o=TimelineEvent(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/timeline/{tid}',response_model=TimelineOut)
def timeline_put(tid:int,x:TimelineUpdate,db:Session=Depends(get_db)):return crud_update(db,TimelineEvent,tid,x,'Timeline event')
@app.delete('/api/v1/timeline/{tid}',status_code=204)
def timeline_delete(tid:int,db:Session=Depends(get_db)):crud_delete(db,TimelineEvent,tid,'Timeline event')

def _job_progress(job,db):
    """Derive display-friendly progress for an AutoWriteJob.

    Pure of side effects so it's cheap to unit test: takes the job row and a
    db session, and reads (never writes) the hierarchy tables to figure out
    how far the Series/Arc/Mini Arc/Episode planners and the Writer have
    actually gotten.
    """
    total_episodes=max(0,job.end_episode-job.start_episode+1)
    series_planned=bool(db.scalar(select(SeriesPlan.id).where(SeriesPlan.project_id==job.project_id)))
    arcs_planned=len(db.scalars(select(ArcPlan.id).where(ArcPlan.project_id==job.project_id)).all())
    mini_arcs_planned=len(db.scalars(select(MiniArcPlan.id).where(MiniArcPlan.project_id==job.project_id)).all())
    episodes_planned=len(db.scalars(select(EpisodePlan.id).where(EpisodePlan.project_id==job.project_id)).all())
    episodes_written=len(db.scalars(select(Episode.id).where(Episode.project_id==job.project_id,Episode.number>=job.start_episode,Episode.number<=job.end_episode,Episode.content!='')).all())

    msg=job.last_message or ''
    in_progress_completed=min(max(job.current_episode-1,0),total_episodes)
    if job.status=='completed':
        phase='completed'; completed=total_episodes
    elif job.status=='stopped':
        phase='stopped'; completed=in_progress_completed
    elif job.status=='error':
        phase='error'; completed=in_progress_completed
    elif not series_planned or 'Series Planner' in msg:
        phase='series_planner'; completed=0
    elif '階層Planner' in msg:
        phase='arc_planner'; completed=in_progress_completed
    elif 'Controller preflight' in msg:
        phase='controller_preflight'; completed=in_progress_completed
    elif 'Writer (' in msg:
        phase='writer'; completed=in_progress_completed
    elif 'Controller' in msg:
        phase='controller_gate'; completed=in_progress_completed
    else:
        phase='queued'; completed=in_progress_completed

    progress_percent=round(completed/total_episodes*100,1) if total_episodes else 0.0
    progress_percent=max(0.0,min(100.0,progress_percent))
    return {
        'progress_percent':progress_percent,'completed_episodes':completed,'total_episodes':total_episodes,
        'current_phase':phase,'series_planned':series_planned,'arcs_planned':arcs_planned,
        'mini_arcs_planned':mini_arcs_planned,'episodes_planned':episodes_planned,'episodes_written':episodes_written,
    }

def _job_out(job,db):
    return AutoWriteJobOut(**{c.name:getattr(job,c.name) for c in AutoWriteJob.__table__.columns},**_job_progress(job,db))

@app.post('/api/v1/auto-write/start',response_model=AutoWriteJobOut)
async def auto_write_start(x:AutoWriteStart,db:Session=Depends(get_db)):
    p=db.get(Project,x.project_id)
    if not p:raise HTTPException(404,'Project not found')
    job=AutoWriteJob(project_id=x.project_id,start_episode=x.start_episode,end_episode=x.end_episode,current_episode=x.start_episode,status='queued',last_message='キューに追加しました')
    if x.writer_model:job.writer_model=x.writer_model
    if x.controller_model:job.controller_model=x.controller_model
    db.add(job);db.commit();db.refresh(job)
    task=asyncio.create_task(run_job(job.id,x.premise,x.overwrite))
    auto_write_running[job.id]=task
    return _job_out(job,db)

@app.post('/api/v1/auto-write/{job_id}/stop',response_model=AutoWriteJobOut)
def auto_write_stop(job_id:int,db:Session=Depends(get_db)):
    job=crud_get_or_404(db,AutoWriteJob,job_id,'Auto-write job')
    if job.status=='running':job.status='stopping';job.last_message='停止要求を受け付けました';db.commit();db.refresh(job)
    return _job_out(job,db)

@app.get('/api/v1/auto-write/{job_id}',response_model=AutoWriteJobOut)
def auto_write_status(job_id:int,db:Session=Depends(get_db)):
    job=crud_get_or_404(db,AutoWriteJob,job_id,'Auto-write job')
    return _job_out(job,db)

@app.get('/api/v1/projects/{pid}/auto-write/jobs',response_model=list[AutoWriteJobOut])
def auto_write_jobs(pid:int,db:Session=Depends(get_db)):
    jobs=db.scalars(select(AutoWriteJob).where(AutoWriteJob.project_id==pid).order_by(AutoWriteJob.id.desc()).limit(20)).all()
    return [_job_out(j,db) for j in jobs]

ACTIVE_JOB_STATUSES=('queued','running','stopping')
@app.get('/api/v1/auto-write/{job_id}/stream')
async def auto_write_stream(job_id:int):
    async def gen():
        while True:
            d=SessionLocal()
            try:
                job=d.get(AutoWriteJob,job_id)
                if not job:
                    yield f'data: {json.dumps({"error":"not_found"})}\n\n'
                    return
                payload=_job_out(job,d).model_dump(mode='json')
                yield f'data: {json.dumps(payload,ensure_ascii=False)}\n\n'
                if job.status not in ACTIVE_JOB_STATUSES:
                    return
            finally:
                d.close()
            await asyncio.sleep(1.5)
    return StreamingResponse(gen(),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})
