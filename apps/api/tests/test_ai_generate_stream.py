import json

from app import main as main_module


def test_ai_generate_stream_sends_deltas_then_done(client, project):
    ep = client.post(
        f"/api/v1/projects/{project['id']}/episodes",
        json={"number": 1, "title": "第一話", "summary": "", "content": "本文"},
    ).json()

    async def fake_generate_stream(prompt, project_id=None):
        assert project_id == project["id"]
        yield {"delta": "こん"}
        yield {"delta": "にちは"}
        yield {"done": True, "model": "stub-model"}

    orig = main_module.generate_stream
    main_module.generate_stream = fake_generate_stream
    try:
        with client.stream(
            "POST", "/api/v1/ai/generate/stream",
            json={"project_id": project["id"], "episode_id": ep["id"], "instruction": "hi", "mode": "custom"},
        ) as r:
            assert r.status_code == 200
            events = []
            for line in r.iter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
    finally:
        main_module.generate_stream = orig

    assert events == [{"delta": "こん"}, {"delta": "にちは"}, {"done": True, "model": "stub-model"}]


def test_ai_generate_stream_reports_provider_errors_as_an_event(client, project):
    from app.providers import ProviderError

    async def fake_generate_stream(prompt, project_id=None):
        raise ProviderError("APIキーが未設定です")
        yield  # pragma: no cover - unreachable, keeps this an async generator

    orig = main_module.generate_stream
    main_module.generate_stream = fake_generate_stream
    try:
        with client.stream(
            "POST", "/api/v1/ai/generate/stream",
            json={"project_id": project["id"], "instruction": "hi", "mode": "custom"},
        ) as r:
            assert r.status_code == 200
            events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    finally:
        main_module.generate_stream = orig

    assert events == [{"error": "APIキーが未設定です"}]
