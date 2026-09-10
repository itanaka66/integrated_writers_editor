from app import backup


def test_backups_status_reports_config_and_list(client, monkeypatch):
    monkeypatch.setattr(backup, "list_backups", lambda: [
        {"timestamp": "20260101-000000", "has_postgres": True, "has_qdrant": False, "size_bytes": 100},
    ])
    r = client.get("/api/v1/backups")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False  # default (opt-in)
    assert len(body["backups"]) == 1
    assert body["backups"][0]["timestamp"] == "20260101-000000"


def test_backups_run_triggers_a_backup_and_returns_the_result(client, monkeypatch):
    monkeypatch.setattr(backup, "run_backup", lambda: {
        "timestamp": "20260101-000000", "postgres_ok": True, "postgres_error": "",
        "qdrant_ok": False, "qdrant_error": "skipped (nothing indexed yet)", "duration_seconds": 1.2,
    })
    r = client.post("/api/v1/backups/run")
    assert r.status_code == 200
    body = r.json()
    assert body["postgres_ok"] is True
    assert body["qdrant_error"] == "skipped (nothing indexed yet)"
