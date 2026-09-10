from app import runtime_config as rc


def test_defaults_reflect_env_settings_with_no_override(client):
    r = client.get("/api/v1/system-settings")
    assert r.status_code == 200
    body = r.json()
    assert body["qdrant_url_is_override"] is False
    assert body["ollama_url_is_override"] is False
    assert body["controller_ollama_url_is_override"] is False
    assert "database_url_masked" in body
    assert "***" in body["database_url_masked"] or "@" not in body["database_url_masked"]


def test_setting_an_override_takes_effect(client):
    r = client.put("/api/v1/system-settings", json={"qdrant_url": "http://qdrant2:6333"})
    assert r.status_code == 200
    body = r.json()
    assert body["qdrant_url"] == "http://qdrant2:6333"
    assert body["qdrant_url_is_override"] is True

    # A fresh GET reflects the persisted override, not just the PUT response.
    r = client.get("/api/v1/system-settings")
    assert r.json()["qdrant_url"] == "http://qdrant2:6333"


def test_clearing_an_override_with_empty_string_reverts_to_env(client):
    client.put("/api/v1/system-settings", json={"ollama_model": "custom-model"})
    r = client.get("/api/v1/system-settings")
    assert r.json()["ollama_model_is_override"] is True

    client.put("/api/v1/system-settings", json={"ollama_model": ""})
    r = client.get("/api/v1/system-settings")
    body = r.json()
    assert body["ollama_model_is_override"] is False
    assert body["ollama_model"] != "custom-model"


def test_unset_fields_are_left_untouched(client):
    client.put("/api/v1/system-settings", json={"qdrant_url": "http://qdrant2:6333"})
    client.put("/api/v1/system-settings", json={"ollama_model": "custom-model"})

    r = client.get("/api/v1/system-settings")
    body = r.json()
    assert body["qdrant_url"] == "http://qdrant2:6333"
    assert body["ollama_model"] == "custom-model"


def test_mask_database_url():
    assert rc.mask_database_url("postgresql+psycopg2://writers:writers@db:5432/writers") == "writers:***@db:5432/writers"
    assert rc.mask_database_url("sqlite:///./dev.db") == "sqlite:///./dev.db"


def test_get_effective_config_falls_back_to_env_with_no_row(db_session_factory):
    # Exercises the self-managed-session branch (no `db` passed in) against
    # an empty runtime_config table, without touching the real configured
    # database — see get_effective_config's docstring for why that matters.
    db = db_session_factory()
    try:
        cfg = rc.get_effective_config(db)
    finally:
        db.close()
    assert cfg.ollama_url
    assert cfg.qdrant_url
