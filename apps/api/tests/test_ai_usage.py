from app.usage import log_usage


def test_usage_summary_starts_empty(client):
    r = client.get("/api/v1/ai-usage/summary")
    assert r.status_code == 200
    body = r.json()
    assert body["rows"] == []
    assert body["total_calls"] == 0
    assert body["total_estimated_cost_usd"] is None


def test_usage_summary_aggregates_by_provider_and_model(client, db_session_factory, monkeypatch):
    monkeypatch.setattr("app.usage.SessionLocal", db_session_factory)

    log_usage(None, "anthropic", "claude-sonnet-4-5", 1000, 500)
    log_usage(None, "anthropic", "claude-sonnet-4-5", 2000, 1000)
    log_usage(None, "ollama", "qwen3.8:27b", 500, 500)

    r = client.get("/api/v1/ai-usage/summary")
    body = r.json()
    assert body["total_calls"] == 3
    assert body["total_input_tokens"] == 3500
    assert body["total_output_tokens"] == 2000

    claude_row = next(row for row in body["rows"] if row["provider"] == "anthropic")
    assert claude_row["calls"] == 2
    assert claude_row["input_tokens"] == 3000
    assert claude_row["output_tokens"] == 1500
    assert claude_row["estimated_cost_usd"] is not None

    ollama_row = next(row for row in body["rows"] if row["provider"] == "ollama")
    assert ollama_row["estimated_cost_usd"] == 0.0


def test_usage_summary_cost_unknown_when_model_not_priced(client, db_session_factory, monkeypatch):
    monkeypatch.setattr("app.usage.SessionLocal", db_session_factory)
    log_usage(None, "anthropic", "some-future-model", 100, 100)

    r = client.get("/api/v1/ai-usage/summary")
    body = r.json()
    assert body["rows"][0]["estimated_cost_usd"] is None
    assert body["total_estimated_cost_usd"] is None


def test_usage_recent_lists_newest_first(client, db_session_factory, monkeypatch):
    monkeypatch.setattr("app.usage.SessionLocal", db_session_factory)
    log_usage(1, "openai", "gpt-4o-mini", 10, 20)
    log_usage(1, "openai", "gpt-4o-mini", 30, 40)

    r = client.get("/api/v1/ai-usage/recent")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    assert rows[0]["input_tokens"] == 30
    assert rows[1]["input_tokens"] == 10
