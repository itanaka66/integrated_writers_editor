from editor_common import connection_test as common_connection_test

from app import connection_test


def test_database_success_with_working_session(monkeypatch, db_session_factory):
    monkeypatch.setattr(connection_test, "SessionLocal", db_session_factory)
    ok, msg, ms = connection_test.test_database()
    assert ok is True
    assert "成功" in msg
    assert ms >= 0


def test_database_failure_when_session_creation_raises(monkeypatch):
    def broken():
        raise RuntimeError("no such host")

    monkeypatch.setattr(connection_test, "SessionLocal", broken)
    ok, msg, ms = connection_test.test_database()
    assert ok is False
    assert "no such host" in msg


def test_qdrant_failure_on_unreachable_url():
    ok, msg, ms = connection_test.test_qdrant("http://localhost:1")
    assert ok is False
    assert msg


def test_ollama_failure_on_unreachable_url():
    ok, msg, ms = connection_test.test_ollama("http://localhost:1")
    assert ok is False
    assert msg


def test_ollama_reports_model_missing(monkeypatch):
    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"models": [{"name": "other-model:latest"}]}

    def fake_get(url, timeout):
        return _FakeResponse()

    monkeypatch.setattr(common_connection_test.httpx, "get", fake_get)
    ok, msg, ms = connection_test.test_ollama("http://ollama:11434", "missing-model")
    assert ok is True  # connection itself succeeded
    assert "見つかりません" in msg


def test_ollama_reports_model_present(monkeypatch):
    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"models": [{"name": "qwen3:8b"}]}

    def fake_get(url, timeout):
        return _FakeResponse()

    monkeypatch.setattr(common_connection_test.httpx, "get", fake_get)
    ok, msg, ms = connection_test.test_ollama("http://ollama:11434", "qwen3:8b")
    assert ok is True
    assert "成功" in msg
