import json
from app.ollama import controller_generate
from .utils import parse_json

PROMPT = '''あなたは10話単位のMini Arc Plannerです。
上位のSeries/Arc計画とStory Digital Twinを参照し、指定Mini Arcを10個のEpisode Planへ分解してください。

【Series】{series}
【Arc】{arc}
【Mini Arc】{mini}
【Story Digital Twin】{state}

JSONのみ：
{{"mini_arc_number":{number},"episodes":[
{{"episode_number":1,"title":"","objective":"","summary":"","key_events":[],"characters":[],"locations":[],"character_changes":[],"world_changes":[],"foreshadowing":[],"continuity_constraints":[]}}
]}}'''

async def plan(series, arc, mini, state):
    text, model = await controller_generate(PROMPT.format(series=json.dumps(series, ensure_ascii=False), arc=json.dumps(arc, ensure_ascii=False), mini=json.dumps(mini, ensure_ascii=False), state=json.dumps(state, ensure_ascii=False), number=mini.get('mini_arc_number', 1)))
    return parse_json(text), model
