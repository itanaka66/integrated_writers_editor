import asyncio, json, re
from sqlalchemy import select
from .db import SessionLocal
from .models import Project, Episode, AutoWriteJob, SeriesPlan, ArcPlan, MiniArcPlan, EpisodePlan
from .context import build
from .ollama import controller_generate, generate
from .continuity import update_character_states, check_continuity
from .rag import index
from .planner.planner_service import PlannerService

running = {}

def _json(text):
    text=(text or '').strip()
    m=re.search(r'\{.*\}', text, re.S)
    if not m: return {}
    try: return json.loads(m.group(0))
    except: return {}

def chunks(e):
    s=e.content or ''; out=[]; start=0; i=0
    while start<len(s):
        out.append({'id':e.id*100000+i,'project_id':e.project_id,'episode_id':e.id,'title':e.title,'source_type':'episode','text':s[start:start+1400]})
        i+=1; start+=1200
    return out

async def _controller_gate(project, ctx, series, arc, mini, plan, content):
    prompt=f'''あなたはA770上のStory Controller / Quality Gateです。
500話シリーズの上位計画を守り、本文を正本化する前に監査します。
担当は「時系列・人物状態・世界観・プロット」の4項目だけです。文章表現の評価はしません。

SERIES={json.dumps(series,ensure_ascii=False)}
ARC={json.dumps(arc,ensure_ascii=False)}
MINI_ARC={json.dumps(mini,ensure_ascii=False)}
EPISODE_PLAN={json.dumps(plan,ensure_ascii=False)}
STORY_TWIN={json.dumps(ctx,ensure_ascii=False)}
本文={content}

JSONのみ：{{"status":"PASS|WARN|BLOCK","checks":{{"timeline":"PASS|WARN|BLOCK","character":"PASS|WARN|BLOCK","world":"PASS|WARN|BLOCK","plot":"PASS|WARN|BLOCK"}},"issues":[{{"type":"timeline|character|world|plot","severity":"HIGH|MEDIUM|LOW","evidence":"","action":""}}]}}'''
    text,_=await controller_generate(prompt)
    return _json(text)

async def run_job(job_id,premise='',overwrite=False):
    db=SessionLocal(); job=db.get(AutoWriteJob,job_id)
    if not job: db.close(); return
    try:
        job.status='running'; db.commit()
        planner=PlannerService()
        # Generate the 500-episode hierarchy once, then lazily refine it.
        job.last_message='Series Planner: EP.1～500 全体構成を確認中'; db.commit()
        series_obj=await planner.ensure_series(db,job.project_id,premise)
        for n in range(job.start_episode,job.end_episode+1):
            db.refresh(job)
            if job.status=='stopping': job.status='stopped'; db.commit(); return
            job.current_episode=n; job.last_message=f'EP.{n}: 階層Plannerを展開中'; db.commit()
            project=db.get(Project,job.project_id)
            existing=db.scalar(select(Episode).where(Episode.project_id==job.project_id,Episode.number==n))
            if existing and existing.content.strip() and not overwrite:
                job.last_message=f'EP.{n}: existing episode skipped'; db.commit(); continue
            ctx=await build(db,job.project_id,existing,8)

            # 500 -> 100 -> 10 -> 1
            arc_number=(n-1)//100+1
            mini_number=((n-1)%100)//10+1
            arc_obj=await planner.ensure_arc(db,job.project_id,arc_number,premise)
            mini_obj=await planner.ensure_mini(db,job.project_id,arc_number,mini_number,premise)
            ep_obj=await planner.ensure_episode(db,job.project_id,n,premise)
            series=json.loads(series_obj.content)
            arc=json.loads(arc_obj.content)
            mini=json.loads(mini_obj.content)
            plan=json.loads(ep_obj.content)

            # Controller-owned preflight
            job.last_message=f'EP.{n}: Controller preflight (timeline/character/world/plot)'; db.commit()
            preflight_prompt=f'''A770 Controllerです。EP.{n}の執筆前監査を行います。
担当は時系列・人物状態・世界観・プロット。文章品質は対象外。
Series={json.dumps(series,ensure_ascii=False)}\nArc={json.dumps(arc,ensure_ascii=False)}\nMiniArc={json.dumps(mini,ensure_ascii=False)}\nEpisode={json.dumps(plan,ensure_ascii=False)}\nStoryTwin={json.dumps(ctx,ensure_ascii=False)}
JSONのみ: {{"status":"PASS|WARN|BLOCK","issues":[],"constraints":[]}}'''
            pre_text,_=await controller_generate(preflight_prompt); preflight=_json(pre_text)
            if preflight.get('status')=='BLOCK':
                repair=f'''EP.{n}のEpisode Planを修正してください。上位計画とStory Digital Twinを正本とし、以下の監査指摘を解消します。JSONのみで返してください。監査={json.dumps(preflight,ensure_ascii=False)}\nPlan={json.dumps(plan,ensure_ascii=False)}\nTwin={json.dumps(ctx,ensure_ascii=False)}'''
                fixed,_=await controller_generate(repair); repaired=_json(fixed)
                if repaired: plan=repaired; ep_obj.content=json.dumps(plan,ensure_ascii=False); db.commit()

            # RTX3090 Writer
            job.last_message=f'EP.{n}: Writer ({job.writer_model})'; db.commit()
            writer_prompt=f'''あなたはRTX3090上のWriter AIです。EP.{n}の完成した日本語小説本文だけを出力してください。
Controllerが決めた計画とStory Digital Twinを厳守してください。
【Series】{json.dumps(series,ensure_ascii=False)}
【Arc】{json.dumps(arc,ensure_ascii=False)}
【Mini Arc】{json.dumps(mini,ensure_ascii=False)}
【Episode Blueprint】{json.dumps(plan,ensure_ascii=False)}
【Controller制約】{json.dumps(preflight,ensure_ascii=False)}
【Story Digital Twin】{json.dumps(ctx,ensure_ascii=False)}
【作品ルール】{project.rules}'''
            content,_=await generate(writer_prompt,job.writer_model)

            # Controller final gate
            job.last_message=f'EP.{n}: Controller final gate'; db.commit()
            gate=await _controller_gate(project,ctx,series,arc,mini,plan,content)
            if gate.get('status')=='BLOCK':
                job.last_message=f'EP.{n}: Controller BLOCK → Writer再執筆'; db.commit()
                revise=f'''EP.{n}本文を修正し、完成本文のみ出力してください。変更対象はControllerが指摘した時系列・人物状態・世界観・プロットの矛盾です。
監査={json.dumps(gate,ensure_ascii=False)}\nEpisode Blueprint={json.dumps(plan,ensure_ascii=False)}\n本文={content}'''
                content,_=await generate(revise,job.writer_model)
                gate=await _controller_gate(project,ctx,series,arc,mini,plan,content)

            if existing:
                existing.title=plan.get('title') or existing.title; existing.summary=plan.get('summary',''); existing.content=content; ep=existing
            else:
                ep=Episode(project_id=job.project_id,number=n,title=plan.get('title') or f'第{n}話',summary=plan.get('summary',''),content=content); db.add(ep)
            ep_obj.status='completed'; db.commit(); db.refresh(ep)
            try: await update_character_states(db,job.project_id,ep)
            except Exception: pass
            try: await index(chunks(ep))
            except Exception: pass
            if n%5==0:
                try: await check_continuity(db,job.project_id,ep.id)
                except Exception: pass
            job.last_message=f'EP.{n}: completed / gate={gate.get("status","UNKNOWN")}'; db.commit()
            await asyncio.sleep(0)
        job.status='completed'; job.last_message='全エピソード生成完了'; db.commit()
    except Exception as ex:
        job.status='error'; job.last_message=f'{type(ex).__name__}: {ex}'; db.commit()
    finally:
        running.pop(job_id,None); db.close()
