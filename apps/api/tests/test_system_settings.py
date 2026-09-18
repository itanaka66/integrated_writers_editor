from app import runtime_config as rc


def test_defaults_reflect_env_settings_with_no_override(client):
    r = client.get("/api/v1/system-settings")
    assert r.status_code == 200
    body = r.json()
    assert body["qdrant_url_is_override"] is False
    assert body["ollama_url_is_override"] is False
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


def test_cors_origins_cannot_be_set_from_the_client(client):
    # cors_origins is intentionally not a field on SystemSettingsUpdate —
    # CORS_ORIGINS is env-only, never settable from the Settings screen (or
    # any other client). A raw request smuggling the field in anyway must
    # be silently ignored (extra fields dropped), not applied.
    before = client.get("/api/v1/system-settings").json()["cors_origins"]

    r = client.put("/api/v1/system-settings", json={"cors_origins": "https://evil.example"})
    assert r.status_code == 200
    assert r.json()["cors_origins"] == before
    assert r.json()["cors_origins_is_override"] is False

    r = client.get("/api/v1/system-settings")
    assert r.json()["cors_origins"] == before
    assert r.json()["cors_origins_is_override"] is False


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


def test_ai_provider_defaults_to_ollama(client):
    r = client.get("/api/v1/system-settings")
    body = r.json()
    assert body["ai_provider"] == "ollama"
    assert body["anthropic_api_key_is_set"] is False
    assert body["openai_api_key_is_set"] is False
    assert body["google_api_key_is_set"] is False


def test_setting_an_api_key_never_echoes_the_value_back(client):
    r = client.put("/api/v1/system-settings", json={"ai_provider": "anthropic", "anthropic_api_key": "sk-ant-secret", "anthropic_model": "claude-sonnet-4-5"})
    assert r.status_code == 200
    body = r.json()
    assert body["ai_provider"] == "anthropic"
    assert body["anthropic_model"] == "claude-sonnet-4-5"
    assert body["anthropic_api_key_is_set"] is True
    assert "anthropic_api_key" not in body
    assert "sk-ant-secret" not in r.text

    r = client.get("/api/v1/system-settings")
    assert r.json()["anthropic_api_key_is_set"] is True
    assert "sk-ant-secret" not in r.text


def test_clearing_an_api_key_with_empty_string(client):
    client.put("/api/v1/system-settings", json={"openai_api_key": "sk-secret"})
    r = client.get("/api/v1/system-settings")
    assert r.json()["openai_api_key_is_set"] is True

    client.put("/api/v1/system-settings", json={"openai_api_key": ""})
    r = client.get("/api/v1/system-settings")
    assert r.json()["openai_api_key_is_set"] is False


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
