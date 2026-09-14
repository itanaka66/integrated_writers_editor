import asyncio

import httpx
import pytest
from editor_common import ollama as common_ollama

from app import ollama
from app.runtime_config import EffectiveConfig

# generate()/embed() resolve their defaults via get_effective_config(), which
# (with no `db` passed) opens its own session against the app's configured
# database — real Postgres in a normal deployment, unreachable in this test
# environment. These are unit tests of the HTTP retry logic only, so stub it
# out rather than needing a real database up. The retry loop itself lives in
# editor_common.ollama now (app.ollama is a thin wrapper resolving model/url
# defaults), so that's what gets patched below.
_FAKE_CONFIG = EffectiveConfig(
    qdrant_url="http://qdrant:6333",
    ollama_url="http://ollama:11434",
    ollama_model="stub-writer-model",
    ollama_embed_model="stub-embed-model",
)


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class _FlakyClient:
    """Fails with a TransportError the first `fail_times` calls, then succeeds."""

    calls = {"count": 0}

    def __init__(self, fail_times, payload, **kwargs):
        self.fail_times = fail_times
        self.payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, json):
        _FlakyClient.calls["count"] += 1
        if _FlakyClient.calls["count"] <= self.fail_times:
            raise httpx.ConnectError("connection refused")
        return _FakeResponse(self.payload)


def test_generate_retries_transient_failures_then_succeeds(monkeypatch):
    _FlakyClient.calls["count"] = 0
    monkeypatch.setattr(common_ollama, "RETRY_BACKOFF_SECONDS", 0)
    monkeypatch.setattr(ollama, "get_effective_config", lambda *a, **kw: _FAKE_CONFIG)
    monkeypatch.setattr(common_ollama.httpx, "AsyncClient", lambda **kw: _FlakyClient(fail_times=1, payload={"response": "ok"}, **kw))

    text, model = asyncio.run(ollama.generate("hello", model="test-model"))
    assert text == "ok"
    assert model == "test-model"
    assert _FlakyClient.calls["count"] == 2


def test_generate_gives_up_after_max_attempts(monkeypatch):
    _FlakyClient.calls["count"] = 0
    monkeypatch.setattr(common_ollama, "RETRY_BACKOFF_SECONDS", 0)
    monkeypatch.setattr(ollama, "get_effective_config", lambda *a, **kw: _FAKE_CONFIG)
    monkeypatch.setattr(common_ollama.httpx, "AsyncClient", lambda **kw: _FlakyClient(fail_times=99, payload={}, **kw))

    with pytest.raises(httpx.ConnectError):
        asyncio.run(ollama.generate("hello", model="test-model"))
    assert _FlakyClient.calls["count"] == common_ollama.MAX_ATTEMPTS
