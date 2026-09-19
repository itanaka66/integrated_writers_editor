import logging
import json
import re
from fastapi import FastAPI,Depends,HTTPException,Response,UploadFile,File,Form,Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from .db import get_db,SessionLocal
from .config import settings
from .models import *
from .schemas import *
from .providers import generate, generate_stream, ProviderError
from .rag import index,search,search_all_projects
from .context import build
from .auth import AuthMiddleware
from .cors import DynamicCORSMiddleware
from . import export as export_mod
from . import runtime_config as rc
from . import file_sync
from .revisions import snapshot_revision
import asyncio
from .importer import run_import_job, running as import_running
from . import narou_import as ni
from . import connection_test
from . import backup as backup_mod
from . import materials
from editor_common.users import (
 ensure_bootstrap_user,list_users,create_user,change_password,set_active,delete_user,
 UsernameTakenError,UserNotFoundError,get_or_create_oauth_user,
)
from editor_common.oauth import google_provider,github_provider,register_oauth_routes
logging.basicConfig(level=logging.INFO)
logger=logging.getLogger(__name__)
if settings.admin_password=='writers-studio-change-me':
 logger.warning('ADMIN_PASSWORD is not set; using the insecure default. Set ADMIN_USERNAME/ADMIN_PASSWORD before exposing this service.')
app=FastAPI(title='Integrated writers Editor (INE) API',version='0.5.0')
# Starlette wraps middleware in reverse of add order (last added = outermost),
# so AuthMiddleware is added first: CORS must stay outermost or a 401
# response never gets CORS headers and the browser reports an opaque network
# error instead of a readable 401.
app.add_middleware(AuthMiddleware)
app.add_middleware(DynamicCORSMiddleware,allow_methods=['*'],allow_headers=['*'],allow_credentials=True)

# OAuth2 "Sign in with..." login (Google/GitHub), alongside HTTP Basic Auth
# (see app/auth.py) rather than replacing it. Entirely opt-in: only mounted
# when a session_secret AND at least one provider's client_id+secret are
# configured — most deployments won't have this set up.
_oauth_providers={}
if settings.google_client_id and settings.google_client_secret:
 _oauth_providers['google']=(settings.google_client_id,settings.google_client_secret)
if settings.github_client_id and settings.github_client_secret:
 _oauth_providers['github']=(settings.github_client_id,settings.github_client_secret)
if _oauth_providers and not settings.session_secret:
 logger.warning('GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID is set but SESSION_SECRET is not; OAuth2 login will stay disabled until SESSION_SECRET is also configured.')
elif _oauth_providers and settings.session_secret:
 if not settings.public_base_url:
  logger.warning('OAuth2 login is configured but PUBLIC_BASE_URL is not set; provider redirect URIs will be wrong. OAuth2 login is disabled until PUBLIC_BASE_URL is set.')
 else:
  base=settings.public_base_url.rstrip('/')
  def _get_or_create_user(email,name):
   db=SessionLocal()
   try:
    return get_or_create_oauth_user(db,User,email,display_name=name)
   finally:
    db.close()
  providers={}
  if 'google' in _oauth_providers:
   cid,secret=_oauth_providers['google']
   providers['google']=google_provider(cid,secret,redirect_uri=f'{base}/api/v1/auth/callback/google')
  if 'github' in _oauth_providers:
   cid,secret=_oauth_providers['github']
   providers['github']=github_provider(cid,secret,redirect_uri=f'{base}/api/v1/auth/callback/github')
  register_oauth_routes(
   app,
   providers=providers,
   session_secret=settings.session_secret,
   get_or_create_user=_get_or_create_user,
   prefix='/api/v1/auth',
   session_max_age_seconds=2592000,
   on_login_redirect='/',
   on_logout_redirect='/',
   secure_cookies=settings.secure_cookies,
  )
elif settings.session_secret and not _oauth_providers:
 logger.warning('SESSION_SECRET is set but no OAuth provider (GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID) is configured; OAuth2 login stays unavailable.')

@app.get('/api/v1/auth/providers')
def auth_providers():
 return {
  'google':bool(settings.google_client_id and settings.google_client_secret and settings.session_secret and settings.public_base_url),
  'github':bool(settings.github_client_id and settings.github_client_secret and settings.session_secret and settings.public_base_url),
 }
_background_tasks=set() # strong refs so asyncio doesn't GC in-flight background tasks (autosync loop)
def chunks(e):
 s=e.content or ''; out=[]; start=0;i=0
 while start<len(s):
  t=s[start:start+1400];out.append({'id':e.id*100000+i,'project_id':e.project_id,'episode_id':e.id,'title':e.title,'source_type':'episode','text':t});i+=1;start+=1200
 return out
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
 try:
  rc.refresh_cors_cache()
 except Exception:
  logger.warning('Could not read the CORS_ORIGINS override from the database at startup; falling back to the environment-variable value until the Settings screen is saved.')
 with SessionLocal() as d:
  # Multi-user login (see app/auth.py) checks a User table instead of a
  # single fixed ADMIN_USERNAME/ADMIN_PASSWORD pair — on a fresh database
  # with no accounts yet, create one from those settings so a new
  # deployment isn't locked out before anyone has run a user-management
  # command. No-op once at least one account exists.
  ensure_bootstrap_user(d,User,settings.admin_username,settings.admin_password)
  if not d.scalar(select(Project).limit(1)):
   p=Project(name='記事作成 DEMO',description='サンプル記事プロジェクト');d.add(p);d.flush()
   d.add_all([Episode(project_id=p.id,number=1,title='はじめに',summary='サンプル記事',content='これはサンプル記事の本文です。'),Episode(project_id=p.id,number=2,title='2本目の記事',summary='サンプル記事',content='ここに本文を書きます。')]);d.commit()
  cleanup_stale_import_jobs(d)
 _background_tasks.add(asyncio.create_task(file_sync.autosync_loop()))
 _background_tasks.add(asyncio.create_task(backup_mod.backup_loop()))
@app.get('/api/v1/health')
def health():return {'status':'ok','version':'0.5.0','features':[]}
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
# Broad style-guide categories a user picks from before generating one (see
# SettingsPanel.tsx's category picker) — each maps to guidance appended to
# the generation prompt so the result actually fits the intended use case,
# rather than one generic "readable Japanese" style guide for everyone.
STYLE_GUIDE_CATEGORY_GUIDANCE={
 'translation':'この文書は複数の翻訳者が関わる翻訳文書・ローカライズ文書です。訳語・言い回しを翻訳者間で統一するための用語集的なルール、一貫した文体（です・ます調かである調か）、一貫した敬語レベルを特に重視してください。',
 'technical':'この文書はWebサイト・マニュアル・技術文書（テクニカルライティング）です。読者が迷わないよう、専門用語の扱い方の統一、簡潔で明確な表現、見出し・箇条書きなどレイアウトの一貫性を特に重視してください。',
 'academic':'この文書は学術論文・研究レポートです。引用の形式や文献リストの書き方は{detail}に統一し、客観的で厳密な文体、専門用語の正確な使用を特に重視してください。',
 'pr':'この文書は広報・ニュース・プレスリリースです。企業イメージや媒体としての信頼性を保つため、用字用語のルール（記者ハンドブック的な統一基準）と、簡潔かつ正確に事実を伝える文体を特に重視してください。',
}
@app.post('/api/v1/projects/{pid}/style-guide/generate',response_model=StyleGuideOut)
async def style_guide_generate(pid:int,x:StyleGuideGenerateRequest=StyleGuideGenerateRequest(),db:Session=Depends(get_db)):
 p=crud_get_or_404(db,Project,pid,'Project')
 eps=db.scalars(select(Episode).where(Episode.project_id==pid).order_by(Episode.number)).all()
 sample='\n\n'.join(e.content for e in eps[:5] if e.content).strip()[:6000]
 guidance=STYLE_GUIDE_CATEGORY_GUIDANCE.get(x.category,'')
 if guidance:guidance=guidance.format(detail=x.detail or 'APA形式')+'\n'
 prompt=f'''あなたは日本語の編集者です。以下は記事プロジェクト「{p.name}」の既存本文サンプルです。この文章の文体・表記に沿ったスタイルガイドを、次の観点を含めて箇条書きで作成してください：文体（である調/ですます調）、語彙・言い回しの傾向、句読点の使い方、表記ゆれ（漢字/ひらがな/カタカナの使い分けなど）、避けるべき表現。
{guidance}スタイルガイド本文のみを出力し、前置きや締めの言葉は不要です。

本文サンプル:
{sample or "（まだ本文がありません。一般的で読みやすい日本語のスタイルガイドを提案してください。）"}'''
 try:t,m=await generate(prompt,pid)
 except ProviderError as ex:raise HTTPException(400,str(ex))
 except Exception as ex:raise HTTPException(503,f'AI provider error: {ex}')
 return StyleGuideOut(style_guide=t.strip())
def _proofread_prompt(style_guide,content):
 return f'''あなたは日本語の校正者です。以下のスタイルガイドに従って本文を校正し、修正すべき箇所だけを列挙してください。

スタイルガイド:
{style_guide}

本文:
{content}

出力は必ず次のJSON配列のみとし、他の説明文は一切含めないでください。修正不要なら空配列 [] を返してください。
[{{"original": "本文中に完全一致する修正対象の原文", "suggested": "修正後の文字列", "reason": "修正理由（簡潔に）"}}]'''
def _parse_proofread_diffs(t,content):
 match=re.search(r'\[.*\]',t,re.DOTALL)
 try:raw=json.loads(match.group(0) if match else t)
 except Exception:raw=[]
 return [{'original':d.get('original',''),'suggested':d.get('suggested',''),'reason':d.get('reason','')}
         for d in raw if isinstance(d,dict) and d.get('original') and d.get('original') in content]
def _proofread_setup(eid,x,db):
 e=crud_get_or_404(db,Episode,eid,'Episode')
 p=db.get(Project,e.project_id)
 if not (p.style_guide or '').strip():raise HTTPException(400,'スタイルガイドが設定されていません。先に「スタイルガイド生成」で作成してください。')
 content=x.content if x.content is not None else e.content
 return e,p,content
@app.post('/api/v1/episodes/{eid}/proofread',response_model=ProofreadResult)
async def episode_proofread(eid:int,x:ProofreadRequest=ProofreadRequest(),db:Session=Depends(get_db)):
 e,p,content=_proofread_setup(eid,x,db)
 try:t,m=await generate(_proofread_prompt(p.style_guide,content),e.project_id)
 except ProviderError as ex:raise HTTPException(400,str(ex))
 except Exception as ex:raise HTTPException(503,f'AI provider error: {ex}')
 return ProofreadResult(diffs=[ProofreadDiff(**d) for d in _parse_proofread_diffs(t,content)])
@app.post('/api/v1/episodes/{eid}/proofread/stream')
async def episode_proofread_stream(eid:int,x:ProofreadRequest=ProofreadRequest(),db:Session=Depends(get_db)):
 # Proofreading a full episode can take long enough for a slow local LLM
 # that a single buffered request sits idle past an intermediate proxy's
 # timeout (observed: Cloudflare Tunnel returning a 504 well before the
 # model finished) — streaming keeps bytes flowing throughout generation
 # so nothing in the path ever sees a silent, timeout-worthy gap. The
 # response shape mirrors /ai/generate/stream (delta/done/error events);
 # the final event additionally carries the parsed, filtered `diffs`, so
 # the client never has to parse JSON out of accumulated deltas itself.
 e,p,content=_proofread_setup(eid,x,db)
 prompt=_proofread_prompt(p.style_guide,content)
 async def gen():
  text=''
  try:
   async for event in generate_stream(prompt,e.project_id):
    if event.get('delta'):
     text+=event['delta']
     yield f'data: {json.dumps({"delta":event["delta"]},ensure_ascii=False)}\n\n'
    if event.get('done'):
     yield f'data: {json.dumps({"done":True,"diffs":_parse_proofread_diffs(text,content)},ensure_ascii=False)}\n\n'
  except ProviderError as ex:
   yield f'data: {json.dumps({"error":str(ex)},ensure_ascii=False)}\n\n'
  except Exception as ex:
   yield f'data: {json.dumps({"error":f"AI provider error: {ex}"},ensure_ascii=False)}\n\n'
 return StreamingResponse(gen(),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})
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
 sources_by_episode={}
 for s in db.scalars(select(Source).where(Source.project_id==pid)).all():
  sources_by_episode.setdefault(s.episode_id,[]).append(s)
 name=p.name or f'project-{pid}'
 if format=='txt':
  return Response(export_mod.build_text(p,eps,sources_by_episode),media_type='text/plain; charset=utf-8',headers={'Content-Disposition':content_disposition(name,'txt')})
 if format=='md':
  return Response(export_mod.build_markdown(p,eps,sources_by_episode),media_type='text/markdown; charset=utf-8',headers={'Content-Disposition':content_disposition(name,'md')})
 if format=='epub':
  return Response(export_mod.build_epub(p,eps,sources_by_episode),media_type='application/epub+zip',headers={'Content-Disposition':content_disposition(name,'epub')})
 raise HTTPException(400,'format must be one of: txt, md, epub')

def get_current_user(request:Request,db:Session=Depends(get_db))->User:
 # BasicAuthMiddleware (app/auth.py) sets this on every authenticated
 # request; a missing value here would mean the middleware let something
 # through without authenticating it, which should never happen.
 username=getattr(request.state,'username',None)
 user=db.scalar(select(User).where(User.username==username)) if username else None
 if user is None:raise HTTPException(401,'Not authenticated')
 return user
def require_admin(user:User=Depends(get_current_user))->User:
 if not user.is_admin:raise HTTPException(403,'管理者権限が必要です。')
 return user
def _user_out(u):return UserOut.model_validate(u)
@app.get('/api/v1/auth/me',response_model=UserOut)
def auth_me(user:User=Depends(get_current_user)):
 return _user_out(user)
def _other_active_admins_remain(db,excluding_username:str)->bool:
 return db.scalar(select(User.id).where(User.is_admin,User.is_active,User.username!=excluding_username).limit(1)) is not None
@app.get('/api/v1/users',response_model=list[UserOut])
def users_list(db:Session=Depends(get_db),_admin:User=Depends(require_admin)):
 return [_user_out(u) for u in list_users(db,User)]
@app.post('/api/v1/users',response_model=UserOut)
def users_create(x:UserCreateRequest,db:Session=Depends(get_db),_admin:User=Depends(require_admin)):
 try:
  u=create_user(db,User,x.username,x.password,is_admin=x.is_admin)
 except UsernameTakenError as e:
  raise HTTPException(409,str(e))
 except ValueError as e:
  raise HTTPException(400,str(e))
 return _user_out(u)
@app.put('/api/v1/users/{username}',response_model=UserOut)
def users_update(username:str,x:UserUpdateRequest,db:Session=Depends(get_db),admin:User=Depends(require_admin)):
 u=db.scalar(select(User).where(User.username==username))
 if u is None:raise HTTPException(404,'ユーザーが見つかりません。')
 demoting=x.is_admin is False and u.is_admin
 deactivating=x.is_active is False and u.is_active
 if (demoting or deactivating) and u.username==admin.username and not _other_active_admins_remain(db,u.username):
  raise HTTPException(400,'唯一の有効な管理者アカウントを降格・無効化することはできません。')
 if x.is_admin is not None:u.is_admin=x.is_admin
 if x.is_active is not None:u.is_active=x.is_active
 db.commit();db.refresh(u)
 return _user_out(u)
@app.post('/api/v1/users/{username}/password',response_model=UserOut)
def users_change_password(username:str,x:PasswordChangeRequest,db:Session=Depends(get_db),_admin:User=Depends(require_admin)):
 try:
  change_password(db,User,username,x.new_password)
 except UserNotFoundError as e:
  raise HTTPException(404,str(e))
 except ValueError as e:
  raise HTTPException(400,str(e))
 return _user_out(db.scalar(select(User).where(User.username==username)))
@app.delete('/api/v1/users/{username}',status_code=204)
def users_delete(username:str,db:Session=Depends(get_db),admin:User=Depends(require_admin)):
 u=db.scalar(select(User).where(User.username==username))
 if u is None:raise HTTPException(404,'ユーザーが見つかりません。')
 if u.username==admin.username:
  raise HTTPException(400,'自分自身のアカウントは削除できません。')
 delete_user(db,User,username)
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
  ai_provider=cfg.ai_provider,
  anthropic_api_key_is_set=bool(cfg.anthropic_api_key),anthropic_model=cfg.anthropic_model,
  openai_api_key_is_set=bool(cfg.openai_api_key),openai_model=cfg.openai_model,
  google_api_key_is_set=bool(cfg.google_api_key),google_model=cfg.google_model,
  cors_origins=cfg.cors_origins,cors_origins_is_override=override(row.cors_origins if row else None),
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
 rc.refresh_cors_cache(db)
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
 elif x.target=='ollama':
  if not x.url:raise HTTPException(400,'url is required')
  ok,msg,ms=connection_test.test_ollama(x.url,x.model)
 elif x.target=='anthropic':
  ok,msg,ms=connection_test.test_anthropic(x.api_key or '',x.model)
 elif x.target=='openai':
  ok,msg,ms=connection_test.test_openai(x.api_key or '',x.model)
 elif x.target=='google':
  ok,msg,ms=connection_test.test_google(x.api_key or '',x.model)
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
 memos_=list(db.scalars(select(Memo).where(Memo.project_id==pid).order_by(Memo.id)).all())
 memo_matches=[]
 for m in memos_:
  c=_count(m.content or '',query,case_sensitive)
  if c:memo_matches.append(MemoSearchMatch(memo_id=m.id,category=m.category,title=m.title,count=c,snippets=_snippets(m.content or '',query,case_sensitive)))
 return TextSearchResult(matches=matches,total_matches=sum(m.count for m in matches),memo_matches=memo_matches,total_memo_matches=sum(m.count for m in memo_matches))
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
 task={'continue':'本文の続きを書く','summary':'本文を要約する','proofread':'表現・誤字脱字を校正する'}.get(x.mode,'依頼を実行する')
 prompt=f'''あなたは記事編集AIです。既存の記事内容を最優先してください。\n作業:{task}\n\nContext:\n{json.dumps(c,ensure_ascii=False,indent=2)}\n\n指示:{x.instruction}\n日本語で出力してください。'''
 try:t,m=await generate(prompt,x.project_id)
 except ProviderError as ex:raise HTTPException(400,str(ex))
 except Exception as ex:raise HTTPException(503,f'AI provider error: {ex}')
 return {'text':t,'model':m,'context':{'rag':len(c['rag'])}}

@app.post('/api/v1/ai/generate/stream')
async def ai_stream(x:AIGenerate,db:Session=Depends(get_db)):
 e=db.get(Episode,x.episode_id) if x.episode_id else None;c=await build(db,x.project_id,e,x.rag_limit)
 task={'continue':'本文の続きを書く','summary':'本文を要約する','proofread':'表現・誤字脱字を校正する'}.get(x.mode,'依頼を実行する')
 prompt=f'''あなたは記事編集AIです。既存の記事内容を最優先してください。\n作業:{task}\n\nContext:\n{json.dumps(c,ensure_ascii=False,indent=2)}\n\n指示:{x.instruction}\n日本語で出力してください。'''
 async def gen():
  try:
   async for event in generate_stream(prompt,x.project_id):
    yield f'data: {json.dumps(event,ensure_ascii=False)}\n\n'
  except ProviderError as ex:
   yield f'data: {json.dumps({"error":str(ex)},ensure_ascii=False)}\n\n'
  except Exception as ex:
   yield f'data: {json.dumps({"error":f"AI provider error: {ex}"},ensure_ascii=False)}\n\n'
 return StreamingResponse(gen(),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})

@app.get('/api/v1/projects/{pid}/chat',response_model=list[ChatMessageOut])
def chat_history(pid:int,limit:int=200,db:Session=Depends(get_db)):
 return list(db.scalars(select(ChatMessage).where(ChatMessage.project_id==pid).order_by(ChatMessage.id).limit(clamp_limit(limit))).all())

@app.post('/api/v1/projects/{pid}/chat',response_model=list[ChatMessageOut])
async def chat_send(pid:int,x:ChatMessageCreate,db:Session=Depends(get_db)):
 crud_get_or_404(db,Project,pid,'Project')
 user_msg=ChatMessage(project_id=pid,role='user',content=x.content);db.add(user_msg);db.commit();db.refresh(user_msg)
 c=await build(db,pid,None,8)
 prompt=f'''あなたは記事作成のAIチャットアシスタントです。既存の記事内容を最優先してください。\n\nContext:\n{json.dumps(c,ensure_ascii=False,indent=2)}\n\n質問:{x.content}\n日本語で出力してください。'''
 try:
  t,_=await generate(prompt,pid)
 except Exception as ex:
  t=f'エラーが発生しました。AIサービスの状態を確認してください。（{ex}）'
 assistant_msg=ChatMessage(project_id=pid,role='assistant',content=t);db.add(assistant_msg);db.commit();db.refresh(assistant_msg)
 return [user_msg,assistant_msg]

@app.delete('/api/v1/projects/{pid}/chat',status_code=204)
def chat_clear(pid:int,db:Session=Depends(get_db)):
 for m in db.scalars(select(ChatMessage).where(ChatMessage.project_id==pid)).all():db.delete(m)
 db.commit()

@app.get('/api/v1/projects/{pid}/memos',response_model=list[MemoOut])
def memos(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)):return crud_list(db,Memo,pid,limit,offset)
@app.post('/api/v1/projects/{pid}/memos',response_model=MemoOut)
def memo_add(pid:int,x:MemoCreate,db:Session=Depends(get_db)):o=Memo(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/memos/{mid}',response_model=MemoOut)
def memo_put(mid:int,x:MemoUpdate,db:Session=Depends(get_db)):return crud_update(db,Memo,mid,x,'Memo')
@app.delete('/api/v1/memos/{mid}',status_code=204)
def memo_delete(mid:int,db:Session=Depends(get_db)):crud_delete(db,Memo,mid,'Memo')

@app.get('/api/v1/episodes/{eid}/sources',response_model=list[SourceOut])
def sources(eid:int,db:Session=Depends(get_db)):
 crud_get_or_404(db,Episode,eid,'Episode')
 return list(db.scalars(select(Source).where(Source.episode_id==eid).order_by(Source.id)).all())
@app.post('/api/v1/episodes/{eid}/sources',response_model=SourceOut)
def source_add(eid:int,x:SourceCreate,db:Session=Depends(get_db)):
 e=crud_get_or_404(db,Episode,eid,'Episode')
 o=Source(episode_id=eid,project_id=e.project_id,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/sources/{sid}',response_model=SourceOut)
def source_put(sid:int,x:SourceUpdate,db:Session=Depends(get_db)):return crud_update(db,Source,sid,x,'Source')
@app.delete('/api/v1/sources/{sid}',status_code=204)
def source_delete(sid:int,db:Session=Depends(get_db)):crud_delete(db,Source,sid,'Source')

@app.post('/api/v1/tools/summarize-material',response_model=MaterialSummarizeOut)
async def summarize_material(file:UploadFile|None=File(None),text:str|None=Form(None)):
 if file is not None:
  data=await file.read()
  content=materials.extract_text_from_pdf(data)
 else:
  content=text or ''
 if not content.strip():raise HTTPException(400,'file または text のいずれかを指定してください。')
 prompt=materials.build_summarize_prompt(content)
 try:t,m=await generate(prompt)
 except ProviderError as ex:raise HTTPException(400,str(ex))
 except Exception as ex:raise HTTPException(503,f'AI provider error: {ex}')
 return MaterialSummarizeOut(summary=t,model=m)

@app.get('/api/v1/projects/{pid}/templates',response_model=list[TemplateOut])
def templates(pid:int,limit:int=200,offset:int=0,db:Session=Depends(get_db)):return crud_list(db,Template,pid,limit,offset)
@app.post('/api/v1/projects/{pid}/templates',response_model=TemplateOut)
def template_add(pid:int,x:TemplateCreate,db:Session=Depends(get_db)):o=Template(project_id=pid,**x.model_dump());db.add(o);db.commit();db.refresh(o);return o
@app.put('/api/v1/templates/{tid}',response_model=TemplateOut)
def template_put(tid:int,x:TemplateUpdate,db:Session=Depends(get_db)):return crud_update(db,Template,tid,x,'Template')
@app.delete('/api/v1/templates/{tid}',status_code=204)
def template_delete(tid:int,db:Session=Depends(get_db)):crud_delete(db,Template,tid,'Template')

@app.get('/api/v1/ai-usage/summary',response_model=AiUsageSummaryOut)
def ai_usage_summary(db:Session=Depends(get_db)):
 rows=list(db.scalars(select(AiUsageLog)).all())
 grouped={}
 for r in rows:
  key=(r.provider,r.model)
  g=grouped.setdefault(key,{'calls':0,'input_tokens':0,'output_tokens':0,'estimated_cost_usd':0.0,'cost_known':True})
  g['calls']+=1
  g['input_tokens']+=r.input_tokens or 0
  g['output_tokens']+=r.output_tokens or 0
  if r.estimated_cost_usd is None:g['cost_known']=False
  else:g['estimated_cost_usd']+=r.estimated_cost_usd
 summary_rows=[AiUsageSummaryRow(provider=p,model=m,calls=g['calls'],input_tokens=g['input_tokens'],output_tokens=g['output_tokens'],estimated_cost_usd=round(g['estimated_cost_usd'],6) if g['cost_known'] else None) for (p,m),g in grouped.items()]
 total_cost_known=all(r.estimated_cost_usd is not None for r in summary_rows) if summary_rows else True
 return AiUsageSummaryOut(
  rows=summary_rows,
  total_calls=sum(r.calls for r in summary_rows),
  total_input_tokens=sum(r.input_tokens for r in summary_rows),
  total_output_tokens=sum(r.output_tokens for r in summary_rows),
  total_estimated_cost_usd=round(sum(r.estimated_cost_usd for r in summary_rows),6) if total_cost_known and summary_rows else None,
 )
@app.get('/api/v1/ai-usage/recent',response_model=list[AiUsageLogOut])
def ai_usage_recent(limit:int=50,db:Session=Depends(get_db)):
 return list(db.scalars(select(AiUsageLog).order_by(AiUsageLog.id.desc()).limit(clamp_limit(limit))).all())

