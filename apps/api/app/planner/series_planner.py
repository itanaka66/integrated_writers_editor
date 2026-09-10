import json
from app.ollama import controller_generate
from .utils import parse_json

PROMPT = '''あなたは500話長編小説のSeries Plannerです。
作品全体の「変えてはいけない大枠」を設計します。

【作品名】{name}
【ジャンル】{genre}
【ルール】{rules}
【追加方針】{premise}
【Story Digital Twin】{state}

EP001～EP500を5つの100話Arcに分けてください。
物語の開始、主要な転換点、人物成長、世界発展、伏線、最終到達点を設計します。
未来の細部を固定しすぎず、下位Plannerが調整できる余白を残してください。

JSONのみ：
{{
 "title":"",
 "theme":"",
 "premise":"",
 "main_conflict":"",
 "ending":"",
 "global_rules":[],
 "character_evolution":[],
 "world_evolution":[],
 "foreshadowing_strategy":[],
 "arcs":[
   {{"arc_number":1,"start_episode":1,"end_episode":100,"title":"","objective":"","conflict":"","turning_point":"","resolution":"","key_events":[]}},
   {{"arc_number":2,"start_episode":101,"end_episode":200,"title":"","objective":"","conflict":"","turning_point":"","resolution":"","key_events":[]}},
   {{"arc_number":3,"start_episode":201,"end_episode":300,"title":"","objective":"","conflict":"","turning_point":"","resolution":"","key_events":[]}},
   {{"arc_number":4,"start_episode":301,"end_episode":400,"title":"","objective":"","conflict":"","turning_point":"","resolution":"","key_events":[]}},
   {{"arc_number":5,"start_episode":401,"end_episode":500,"title":"","objective":"","conflict":"","turning_point":"","resolution":"","key_events":[]}}
 ]
}}'''

async def plan(name, genre, rules, premise, state):
    text, model = await controller_generate(PROMPT.format(name=name, genre=genre, rules=rules, premise=premise, state=json.dumps(state, ensure_ascii=False)))
    return parse_json(text), model
