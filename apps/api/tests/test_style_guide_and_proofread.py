import json

from app import main as main_module


def test_style_guide_generate(client, project, monkeypatch):
    async def fake_generate(prompt, project_id=None):
        assert project["name"] in prompt
        return "・である調で統一する\n・句読点は全角を使う", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(f"/api/v1/projects/{project['id']}/style-guide/generate")
    assert r.status_code == 200, r.text
    assert "である調" in r.json()["style_guide"]


def test_style_guide_generate_with_category_adds_guidance(client, project, monkeypatch):
    async def fake_generate(prompt, project_id=None):
        assert "翻訳文書・ローカライズ" in prompt
        assert "用語集的なルール" in prompt
        return "・訳語を統一する", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(f"/api/v1/projects/{project['id']}/style-guide/generate", json={"category": "translation"})
    assert r.status_code == 200, r.text
    assert r.json()["style_guide"] == "・訳語を統一する"


def test_style_guide_generate_academic_category_uses_citation_detail(client, project, monkeypatch):
    async def fake_generate(prompt, project_id=None):
        assert "MLA" in prompt
        assert "APA" not in prompt
        return "・MLA形式で統一する", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(
        f"/api/v1/projects/{project['id']}/style-guide/generate",
        json={"category": "academic", "detail": "MLA"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["style_guide"] == "・MLA形式で統一する"


def test_style_guide_generate_academic_category_defaults_to_apa(client, project, monkeypatch):
    async def fake_generate(prompt, project_id=None):
        assert "APA形式" in prompt
        return "ok", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(f"/api/v1/projects/{project['id']}/style-guide/generate", json={"category": "academic"})
    assert r.status_code == 200, r.text


def test_style_guide_generate_unknown_category_is_ignored(client, project, monkeypatch):
    async def fake_generate(prompt, project_id=None):
        return "ok", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(f"/api/v1/projects/{project['id']}/style-guide/generate", json={"category": "nonsense"})
    assert r.status_code == 200, r.text


def test_proofread_requires_style_guide(client, project):
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "t", "content": "本文です。"})
    episode = r.json()

    r = client.post(f"/api/v1/episodes/{episode['id']}/proofread")
    assert r.status_code == 400


def test_proofread_returns_diffs_matching_content(client, project, monkeypatch):
    client.put(f"/api/v1/projects/{project['id']}", json={"style_guide": "である調で統一する"})
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "t", "content": "今日は良い天気です。"})
    episode = r.json()

    async def fake_generate(prompt, project_id=None):
        assert "である調で統一する" in prompt
        assert "今日は良い天気です。" in prompt
        return (
            '[{"original": "です。", "suggested": "である。", "reason": "である調に統一"},'
            '{"original": "存在しない文字列", "suggested": "x", "reason": "本文に無いので除外されるはず"}]',
            "test-model",
        )

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(f"/api/v1/episodes/{episode['id']}/proofread")
    assert r.status_code == 200, r.text
    diffs = r.json()["diffs"]
    assert len(diffs) == 1
    assert diffs[0]["original"] == "です。"
    assert diffs[0]["suggested"] == "である。"


def test_proofread_checks_unsaved_content_when_provided(client, project, monkeypatch):
    # The write screen sends its current (possibly-unsaved) textarea value
    # as `content` — the endpoint must check that instead of whatever's in
    # the database, so 校正 reflects what's on screen even before 保存.
    client.put(f"/api/v1/projects/{project['id']}", json={"style_guide": "である調で統一する"})
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "t", "content": "保存済みの本文です。"})
    episode = r.json()

    async def fake_generate(prompt, project_id=None):
        assert "保存済み" not in prompt
        assert "未保存の編集中の本文です。" in prompt
        return '[{"original": "未保存", "suggested": "編集中", "reason": "r"}]', "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(f"/api/v1/episodes/{episode['id']}/proofread", json={"content": "未保存の編集中の本文です。"})
    assert r.status_code == 200, r.text
    assert r.json()["diffs"][0]["original"] == "未保存"


def test_proofread_empty_diffs_when_no_changes_needed(client, project, monkeypatch):
    client.put(f"/api/v1/projects/{project['id']}", json={"style_guide": "である調で統一する"})
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "t", "content": "本文である。"})
    episode = r.json()

    async def fake_generate(prompt, project_id=None):
        return "[]", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post(f"/api/v1/episodes/{episode['id']}/proofread")
    assert r.status_code == 200, r.text
    assert r.json()["diffs"] == []


def test_proofread_stream_sends_deltas_then_diffs(client, project, monkeypatch):
    # A slow, buffered proofread response was observed to trip an
    # intermediate proxy's idle timeout (Cloudflare Tunnel returning a 504
    # before the model finished) — streaming keeps bytes flowing
    # throughout generation instead of going silent until the whole
    # response is ready.
    client.put(f"/api/v1/projects/{project['id']}", json={"style_guide": "である調で統一する"})
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "t", "content": "今日は良い天気です。"})
    episode = r.json()

    async def fake_generate_stream(prompt, project_id=None):
        assert "である調で統一する" in prompt
        yield {"delta": '[{"original": "です。", '}
        yield {"delta": '"suggested": "である。", "reason": "である調に統一"}]'}
        yield {"done": True, "model": "stub-model"}

    monkeypatch.setattr(main_module, "generate_stream", fake_generate_stream)

    with client.stream("POST", f"/api/v1/episodes/{episode['id']}/proofread/stream", json={}) as r:
        assert r.status_code == 200
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]

    assert events[0] == {"delta": '[{"original": "です。", '}
    assert events[1] == {"delta": '"suggested": "である。", "reason": "である調に統一"}]'}
    assert events[2]["done"] is True
    assert events[2]["diffs"] == [{"original": "です。", "suggested": "である。", "reason": "である調に統一"}]


def test_proofread_stream_reports_provider_errors_as_an_event(client, project):
    from app.providers import ProviderError

    client.put(f"/api/v1/projects/{project['id']}", json={"style_guide": "である調で統一する"})
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "t", "content": "本文"})
    episode = r.json()

    async def fake_generate_stream(prompt, project_id=None):
        raise ProviderError("APIキーが未設定です")
        yield  # pragma: no cover - unreachable, keeps this an async generator

    orig = main_module.generate_stream
    main_module.generate_stream = fake_generate_stream
    try:
        with client.stream("POST", f"/api/v1/episodes/{episode['id']}/proofread/stream", json={}) as r:
            assert r.status_code == 200
            events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    finally:
        main_module.generate_stream = orig

    assert events == [{"error": "APIキーが未設定です"}]


def test_proofread_stream_requires_style_guide(client, project):
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "t", "content": "本文"})
    episode = r.json()

    r = client.post(f"/api/v1/episodes/{episode['id']}/proofread/stream", json={})
    assert r.status_code == 400
