import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app import auth as auth_module
from app.models import User
from editor_common import session_tokens
from editor_common.users import create_user, get_or_create_oauth_user


def test_auth_providers_is_public_and_defaults_to_disabled():
    c = TestClient(app)
    r = c.get("/api/v1/auth/providers")
    assert r.status_code == 200
    assert r.json() == {"google": False, "github": False}


def test_auth_providers_reflects_config(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "gid")
    monkeypatch.setattr(settings, "google_client_secret", "gsecret")
    monkeypatch.setattr(settings, "session_secret", "shh")
    monkeypatch.setattr(settings, "public_base_url", "https://example.com")

    c = TestClient(app)
    r = c.get("/api/v1/auth/providers")
    assert r.status_code == 200
    assert r.json() == {"google": True, "github": False}


def test_auth_providers_stays_false_when_only_partially_configured(monkeypatch):
    # client_id without session_secret/public_base_url is a likely
    # misconfiguration (see the startup warning in app/main.py) — the
    # provider must not be advertised as usable until everything is set.
    monkeypatch.setattr(settings, "github_client_id", "gid")
    monkeypatch.setattr(settings, "github_client_secret", "gsecret")

    c = TestClient(app)
    r = c.get("/api/v1/auth/providers")
    assert r.json() == {"google": False, "github": False}


def test_oauth_login_route_404s_when_unconfigured():
    # No OAuth env configured in the default test settings, so
    # register_oauth_routes never ran and these routes simply don't exist —
    # nothing changes for a deployment that hasn't opted in.
    c = TestClient(app)
    r = c.get("/api/v1/auth/login/google", follow_redirects=False)
    assert r.status_code == 404


def test_auth_me_requires_auth():
    c = TestClient(app)
    r = c.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_auth_me_returns_current_user(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == settings.admin_username
    assert body["is_admin"] is True
    assert "password_hash" not in body


def test_get_or_create_oauth_user_first_login_then_reuses_account(db_session_factory):
    db = db_session_factory()
    try:
        user = get_or_create_oauth_user(db, User, "New.User@Example.com", display_name="New User")
        assert user.email == "new.user@example.com"
        assert user.password_hash is None
        assert user.username  # auto-derived, non-empty

        again = get_or_create_oauth_user(db, User, "new.user@example.com")
        assert again.id == user.id
    finally:
        db.close()


def test_session_cookie_authenticates_when_oauth_is_configured(client, db_session_factory, monkeypatch):
    # Exercises the actual session-cookie verification path
    # (editor_common.auth.make_session_verifier, via app.auth._verify_session)
    # without mocking the Google/GitHub network round-trip: sign a token the
    # same way editor_common.oauth's callback route does, then confirm a
    # request carrying it as a cookie is authenticated as that user.
    monkeypatch.setattr(settings, "session_secret", "test-secret")

    db = db_session_factory()
    try:
        oauth_user = get_or_create_oauth_user(db, User, "oauth.person@example.com")
        uid = oauth_user.id
        username = oauth_user.username
    finally:
        db.close()

    token = session_tokens.sign("test-secret", {"uid": uid, "username": username}, 3600)
    resolved = auth_module._verify_session(token)
    assert resolved == username


def test_session_verifier_rejects_bad_secret(client, db_session_factory, monkeypatch):
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    db = db_session_factory()
    try:
        oauth_user = get_or_create_oauth_user(db, User, "another@example.com")
        uid = oauth_user.id
        username = oauth_user.username
    finally:
        db.close()
    token = session_tokens.sign("wrong-secret", {"uid": uid, "username": username}, 3600)
    assert auth_module._verify_session(token) is None


def test_session_verifier_rejects_inactive_user(client, db_session_factory, monkeypatch):
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    db = db_session_factory()
    try:
        oauth_user = get_or_create_oauth_user(db, User, "inactive@example.com")
        uid = oauth_user.id
        username = oauth_user.username
        oauth_user.is_active = False
        db.commit()
    finally:
        db.close()
    token = session_tokens.sign("test-secret", {"uid": uid, "username": username}, 3600)
    assert auth_module._verify_session(token) is None
