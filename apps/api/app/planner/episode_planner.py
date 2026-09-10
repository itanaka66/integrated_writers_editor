import json
from app.ollama import controller_generate
from .utils import parse_json

PROMPT = '''あなたは1話単位のEpisode Plannerです。
Writer AIへ渡す最終Blueprintを作成してください。
上位計画よりStory Digital Twinの現在状態を優先し、矛盾する場合は「continuity_constraints」に明記します。

【Series】{series}
【Arc】{arc}
【Mini Arc】{mini}
【Episode候補】{episode}
【Story Digital Twin】{state}

JSONのみ：
{{"episode_number":{number},"title":"","purpose":"","summary":"","opening":"","middle":"","climax":"","ending":"","characters":[],"locations":[],"events":[],"dialogue_points":[],"character_state_changes":[],"world_state_changes":[],"foreshadowing":[],"continuity_constraints":[],"writer_instructions":""}}'''

async def plan(series, arc, mini, episode, state):
    text, model = await controller_generate(PROMPT.format(series=json.dumps(series, ensure_ascii=False), arc=json.dumps(arc, ensure_ascii=False), mini=json.dumps(mini, ensure_ascii=False), episode=json.dumps(episode, ensure_ascii=False), state=json.dumps(state, ensure_ascii=False), number=episode.get('episode_number', 1)))
    return parse_json(text), model
