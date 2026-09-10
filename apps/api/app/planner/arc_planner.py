import json
from app.ollama import controller_generate
from .utils import parse_json

PROMPT = '''あなたは100話単位のArc Plannerです。
Series Plannerの大枠を守りながら、指定Arcを10個のMini Arcへ分解します。

【Series】{series}
【Arc】{arc}
【現在状態】{state}

各Mini Arcは10話です。各区間に目的、対立、決着、人物成長、世界変化、伏線を設定してください。
JSONのみ：
{{"arc_number":{arc_number},"mini_arcs":[
{{"mini_arc_number":1,"start_episode":1,"end_episode":10,"title":"","objective":"","conflict":"","resolution":"","character_development":[],"world_changes":[],"key_events":[],"foreshadowing":[]}}
]}}'''

async def plan(series, arc, state):
    text, model = await controller_generate(PROMPT.format(series=json.dumps(series, ensure_ascii=False), arc=json.dumps(arc, ensure_ascii=False), state=json.dumps(state, ensure_ascii=False), arc_number=arc.get('arc_number', 1)))
    return parse_json(text), model
