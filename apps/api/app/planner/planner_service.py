import json
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Project, SeriesPlan, ArcPlan, MiniArcPlan, EpisodePlan
from app.context import build
from .series_planner import plan as series_plan
from .arc_planner import plan as arc_plan
from .mini_arc_planner import plan as mini_plan
from .episode_planner import plan as episode_plan

class PlannerService:
    async def ensure_series(self, db: Session, project_id: int, premise: str = ''):
        p = db.get(Project, project_id)
        if not p: raise ValueError('Project not found')
        obj = db.scalar(select(SeriesPlan).where(SeriesPlan.project_id==project_id))
        if obj: return obj
        state = await build(db, project_id, None, 8)
        data, model = await series_plan(p.name, p.genre, p.rules, premise, state)
        obj = SeriesPlan(project_id=project_id, total_episodes=500, title=data.get('title', p.name), premise=data.get('premise', premise), content=json.dumps(data, ensure_ascii=False), model=model, status='approved')
        db.add(obj); db.commit(); db.refresh(obj)
        for a in data.get('arcs', []):
            db.add(ArcPlan(series_plan_id=obj.id, project_id=project_id, arc_number=a.get('arc_number',1), start_episode=a.get('start_episode',1), end_episode=a.get('end_episode',100), title=a.get('title',''), content=json.dumps(a, ensure_ascii=False), status='planned', model=model))
        db.commit()
        return obj

    async def ensure_arc(self, db: Session, project_id: int, arc_number: int, premise: str = ''):
        series = await self.ensure_series(db, project_id, premise)
        obj = db.scalar(select(ArcPlan).where(ArcPlan.project_id==project_id, ArcPlan.arc_number==arc_number))
        if obj and obj.content: return obj
        arc_data = next((x for x in json.loads(series.content).get('arcs',[]) if x.get('arc_number')==arc_number), {'arc_number':arc_number,'start_episode':(arc_number-1)*100+1,'end_episode':arc_number*100})
        state = await build(db, project_id, None, 8)
        data, model = await arc_plan(json.loads(series.content), arc_data, state)
        if not obj:
            obj=ArcPlan(series_plan_id=series.id, project_id=project_id, arc_number=arc_number, start_episode=arc_data.get('start_episode'), end_episode=arc_data.get('end_episode'), title=arc_data.get('title',''), content=json.dumps(data, ensure_ascii=False), status='planned', model=model); db.add(obj)
        else: obj.content=json.dumps(data, ensure_ascii=False); obj.model=model
        db.commit(); db.refresh(obj)
        for m in data.get('mini_arcs', []):
            existing=db.scalar(select(MiniArcPlan).where(MiniArcPlan.arc_plan_id==obj.id, MiniArcPlan.mini_arc_number==m.get('mini_arc_number',1)))
            if not existing:
                db.add(MiniArcPlan(arc_plan_id=obj.id, project_id=project_id, mini_arc_number=m.get('mini_arc_number',1), start_episode=m.get('start_episode'), end_episode=m.get('end_episode'), title=m.get('title',''), content=json.dumps(m, ensure_ascii=False), status='planned', model=model))
        db.commit()
        return obj

    async def ensure_mini(self, db: Session, project_id: int, arc_number: int, mini_number: int, premise: str = ''):
        arc = await self.ensure_arc(db, project_id, arc_number, premise)
        obj = db.scalar(select(MiniArcPlan).where(MiniArcPlan.arc_plan_id==arc.id, MiniArcPlan.mini_arc_number==mini_number))
        series=db.scalar(select(SeriesPlan).where(SeriesPlan.project_id==project_id))
        arc_data=json.loads(arc.content)
        mini_data=next((x for x in arc_data.get('mini_arcs',[]) if x.get('mini_arc_number')==mini_number), {'mini_arc_number':mini_number,'start_episode':(arc_number-1)*100+(mini_number-1)*10+1,'end_episode':(arc_number-1)*100+mini_number*10})
        if obj and obj.content: return obj
        state=await build(db, project_id, None, 8)
        data, model=await mini_plan(json.loads(series.content), arc_data, mini_data, state)
        if not obj:
            obj=MiniArcPlan(arc_plan_id=arc.id,project_id=project_id,mini_arc_number=mini_number,start_episode=mini_data.get('start_episode'),end_episode=mini_data.get('end_episode'),title=mini_data.get('title',''),content=json.dumps(data,ensure_ascii=False),status='planned',model=model);db.add(obj)
        else: obj.content=json.dumps(data,ensure_ascii=False);obj.model=model
        db.commit();db.refresh(obj)
        for e in data.get('episodes',[]):
            existing=db.scalar(select(EpisodePlan).where(EpisodePlan.mini_arc_plan_id==obj.id,EpisodePlan.episode_number==e.get('episode_number',1)))
            if not existing:
                db.add(EpisodePlan(mini_arc_plan_id=obj.id,project_id=project_id,episode_number=e.get('episode_number',1),title=e.get('title',''),content=json.dumps(e,ensure_ascii=False),status='planned',model=model))
        db.commit()
        return obj

    async def ensure_episode(self, db: Session, project_id: int, episode_number: int, premise: str = ''):
        arc_number=(episode_number-1)//100+1
        mini_number=((episode_number-1)%100)//10+1
        mini=await self.ensure_mini(db, project_id, arc_number, mini_number, premise)
        obj=db.scalar(select(EpisodePlan).where(EpisodePlan.mini_arc_plan_id==mini.id,EpisodePlan.episode_number==episode_number))
        series=db.scalar(select(SeriesPlan).where(SeriesPlan.project_id==project_id))
        arc=db.scalar(select(ArcPlan).where(ArcPlan.project_id==project_id,ArcPlan.arc_number==arc_number))
        episode_data=json.loads(obj.content) if obj and obj.content else {'episode_number':episode_number}
        if obj and obj.status in ('approved','planned') and obj.content and obj.title: return obj
        state=await build(db,project_id,None,8)
        data,model=await episode_plan(json.loads(series.content),json.loads(arc.content),json.loads(mini.content),episode_data,state)
        if not obj:
            obj=EpisodePlan(mini_arc_plan_id=mini.id,project_id=project_id,episode_number=episode_number,title=data.get('title',''),content=json.dumps(data,ensure_ascii=False),status='approved',model=model);db.add(obj)
        else: obj.title=data.get('title','');obj.content=json.dumps(data,ensure_ascii=False);obj.status='approved';obj.model=model
        db.commit();db.refresh(obj)
        return obj
