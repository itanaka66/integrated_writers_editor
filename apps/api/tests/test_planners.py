import asyncio
import json

from app.planner import series_planner, arc_planner, mini_arc_planner, episode_planner


def run(coro):
    return asyncio.run(coro)


def test_series_planner_parses_controller_json(monkeypatch):
    payload = {
        "title": "テスト作品",
        "theme": "成長",
        "arcs": [{"arc_number": 1, "start_episode": 1, "end_episode": 100}],
    }

    async def fake_controller(prompt):
        assert "EP001～EP500" in prompt
        return json.dumps(payload, ensure_ascii=False), "qwen3:14b"

    monkeypatch.setattr(series_planner, "controller_generate", fake_controller)
    result, model = run(series_planner.plan("作品", "SF", "魔法なし", "文明開拓", {}))

    assert result == payload
    assert model == "qwen3:14b"


def test_arc_planner_receives_series_and_arc(monkeypatch):
    payload = {"arc_number": 2, "mini_arcs": [{"mini_arc_number": 1}]}

    async def fake_controller(prompt):
        assert "mini_arcs" in prompt
        assert '"arc_number": 2' in prompt
        return json.dumps(payload), "qwen3:14b"

    monkeypatch.setattr(arc_planner, "controller_generate", fake_controller)
    result, model = run(arc_planner.plan({"title": "S"}, {"arc_number": 2}, {}))

    assert result["arc_number"] == 2
    assert len(result["mini_arcs"]) == 1
    assert model == "qwen3:14b"


def test_mini_arc_planner_creates_episode_plan_payload(monkeypatch):
    payload = {
        "mini_arc_number": 7,
        "episodes": [{"episode_number": 61, "title": "転機"}],
    }

    async def fake_controller(prompt):
        assert '"mini_arc_number": 7' in prompt
        return json.dumps(payload, ensure_ascii=False), "qwen3:14b"

    monkeypatch.setattr(mini_arc_planner, "controller_generate", fake_controller)
    result, _ = run(mini_arc_planner.plan({}, {}, {"mini_arc_number": 7}, {}))

    assert result["mini_arc_number"] == 7
    assert result["episodes"][0]["episode_number"] == 61


def test_episode_planner_creates_writer_blueprint(monkeypatch):
    payload = {
        "episode_number": 237,
        "title": "鉄鉱石との遭遇",
        "purpose": "文明発展",
        "continuity_constraints": ["まだ鉄器は量産できない"],
    }

    async def fake_controller(prompt):
        assert '"episode_number":237' in prompt
        assert "Story Digital Twin" in prompt
        return json.dumps(payload, ensure_ascii=False), "qwen3:14b"

    monkeypatch.setattr(episode_planner, "controller_generate", fake_controller)
    result, model = run(
        episode_planner.plan(
            {"title": "S"},
            {"arc_number": 3},
            {"mini_arc_number": 4},
            {"episode_number": 237},
            {"characters": []},
        )
    )

    assert result["episode_number"] == 237
    assert result["title"] == "鉄鉱石との遭遇"
    assert model == "qwen3:14b"
