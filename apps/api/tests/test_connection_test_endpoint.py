from app import connection_test


def _stub(monkeypatch, fn_name, result):
    def fake(*a, **kw):
        return result

    monkeypatch.setattr(connection_test, fn_name, fake)


def test_test_connection_database(client, monkeypatch):
    _stub(monkeypatch, "test_database", (True, "接続に成功しました。", 5))
    r = client.post("/api/v1/system-settings/test-connection", json={"target": "database"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["latency_ms"] == 5


def test_test_connection_qdrant_requires_url(client):
    r = client.post("/api/v1/system-settings/test-connection", json={"target": "qdrant"})
    assert r.status_code == 400


def test_test_connection_qdrant(client, monkeypatch):
    captured = {}

    def fake(url):
        captured["url"] = url
        return (True, "ok", 12)

    monkeypatch.setattr(connection_test, "test_qdrant", fake)
    r = client.post("/api/v1/system-settings/test-connection", json={"target": "qdrant", "url": "http://qdrant:6333"})
    assert r.status_code == 200
    assert captured["url"] == "http://qdrant:6333"


def test_test_connection_ollama_with_model(client, monkeypatch):
    captured = {}

    def fake(url, model=None):
        captured["url"] = url
        captured["model"] = model
        return (False, "モデルが見つかりません", 20)

    monkeypatch.setattr(connection_test, "test_ollama", fake)
    r = client.post("/api/v1/system-settings/test-connection", json={"target": "controller_ollama", "url": "http://ollama:11434", "model": "qwen3:14b"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert captured["model"] == "qwen3:14b"


def test_test_connection_unknown_target(client):
    r = client.post("/api/v1/system-settings/test-connection", json={"target": "bogus"})
    assert r.status_code == 400
