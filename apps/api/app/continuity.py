import json, re, logging
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Episode, Character, CharacterState, ContinuityIssue
from .ollama import generate

logger = logging.getLogger(__name__)

def extract_json(text: str):
    m = re.search(r'\{.*\}', text, re.S)
    if not m: return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        logger.warning('Failed to parse JSON from AI response: %r', text[:500])
        return {}

async def update_character_states(db: Session, project_id: int, episode: Episode):
    chars = db.scalars(select(Character).where(Character.project_id == project_id).order_by(Character.id)).all()
    if not chars or not episode.content.strip(): return []
    roster = [{"id":c.id,"name":c.name,"status":c.status,"personality":c.personality,"goal":c.goal} for c in chars]
    prompt = f'''あなたは長編小説のキャラクター状態管理AIです。エピソード本文から、登場人物の「今回の変化」を抽出してください。
キャラクター一覧:
{json.dumps(roster,ensure_ascii=False)}
エピソード #{episode.number} {episode.title}:
{episode.content}

JSONのみで回答。形式:
{{"states":[{{"character_id":1,"status":"alive","location":"","emotion":"","health":"","goal":"","knowledge":"","notes":"今回の変化"}}]}}
本文に根拠がない項目は空文字。推測で新事実を作らない。'''
    try:
        text,_=await generate(prompt)
    except Exception as ex:
        raise RuntimeError(f'character-state update AI error: {ex}') from ex
    data=extract_json(text)
    results=[]
    for s in data.get('states',[]):
        c=next((x for x in chars if x.id==s.get('character_id')),None)
        if not c: continue
        state=CharacterState(project_id=project_id,character_id=c.id,episode_id=episode.id,episode_number=episode.number,
            status=s.get('status','') or c.status,location=s.get('location',''),emotion=s.get('emotion',''),health=s.get('health',''),goal=s.get('goal','') or c.goal,knowledge=s.get('knowledge',''),notes=s.get('notes',''))
        db.add(state)
        if s.get('status'): c.status=s['status']
        results.append(state)
    db.commit()
    return results

async def check_continuity(db: Session, project_id: int, episode_id: int | None = None):
    eps=db.scalars(select(Episode).where(Episode.project_id==project_id).order_by(Episode.number)).all()
    chars=db.scalars(select(Character).where(Character.project_id==project_id)).all()
    if episode_id:
        target=db.get(Episode,episode_id)
        eps=[e for e in eps if e.number <= (target.number if target else 10)]
    corpus=[{"number":e.number,"title":e.title,"summary":e.summary,"content":e.content[-7000:]} for e in eps[-20:]]
    roster=[{"id":c.id,"name":c.name,"status":c.status,"personality":c.personality,"goal":c.goal,"description":c.description} for c in chars]
    prompt=f'''あなたは小説の連続性監査AIです。設定の正本と本文を比較し、矛盾・不自然な時系列・人物状態の食い違いだけを検出します。
人物正本:
{json.dumps(roster,ensure_ascii=False)}
直近本文:
{json.dumps(corpus,ensure_ascii=False)}

JSONのみで回答:
{{"issues":[{{"type":"character|timeline|world|ability|foreshadowing|other","severity":"high|medium|low","episode_number":1,"message":"短い説明","evidence":"根拠","suggestion":"修正案"}}]}}
創作上あり得る変化は矛盾としない。根拠のない指摘は禁止。'''
    try:
        text,model=await generate(prompt)
        data=extract_json(text)
    except Exception as ex:
        raise RuntimeError(f'continuity AI error: {ex}') from ex
    # Keep latest run; unresolved issues remain historical until manually resolved.
    issues=[]
    for x in data.get('issues',[]):
        if not x.get('message'): continue
        issue=ContinuityIssue(project_id=project_id,episode_number=x.get('episode_number'),issue_type=x.get('type','other'),severity=x.get('severity','medium'),message=x['message'],evidence=x.get('evidence',''),suggestion=x.get('suggestion',''),status='open',model=model)
        db.add(issue); issues.append(issue)
    db.commit()
    return issues
