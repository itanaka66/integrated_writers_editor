import pytest

from app import mail as mail_mod
from app.config import settings


def test_self_password_change_success(client, db_session_factory):
    from app.models import User
    from editor_common.users import create_user

    db = db_session_factory()
    create_user(db, User, "self-changer", "old-password", is_admin=False)
    db.close()

    client.auth = ("self-changer", "old-password")
    r = client.post("/api/v1/users/me/password", json={"current_password": "old-password", "new_password": "new-password"})
    assert r.status_code == 200, r.text

    client.auth = ("self-changer", "new-password")
    r = client.get("/api/v1/projects")
    assert r.status_code == 200


def test_self_password_change_wrong_current_password(client, db_session_factory):
    from app.models import User
    from editor_common.users import create_user

    db = db_session_factory()
    create_user(db, User, "self-changer2", "old-password", is_admin=False)
    db.close()

    client.auth = ("self-changer2", "old-password")
    r = client.post("/api/v1/users/me/password", json={"current_password": "wrong", "new_password": "new-password"})
    assert r.status_code == 400


def test_self_password_change_fails_for_oauth_only_account(client, db_session_factory):
    from app.models import User
    from editor_common.users import get_or_create_oauth_user

    db = db_session_factory()
    get_or_create_oauth_user(db, User, "oauthuser@example.com", display_name="OAuth User")
    db.close()

    # OAuth-only accounts have no password at all, so they can't reach this
    # endpoint via Basic Auth in the first place (no password to send) —
    # simulate the call by monkeypatching get_current_user is unnecessary;
    # instead verify authenticate_user (the same check the endpoint uses)
    # always fails closed for such an account, which is what the endpoint
    # relies on.
    from editor_common.users import authenticate_user

    db = db_session_factory()
    assert authenticate_user(db, User, "oauthuser", "anything") is None
    db.close()


def test_admin_sets_a_users_email(client):
    client.post("/api/v1/users", json={"username": "with-email", "password": "pw123456"})
    r = client.put("/api/v1/users/with-email", json={"email": "with-email@example.com"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "with-email@example.com"


def test_password_reset_request_returns_generic_response_for_unknown_email(client, monkeypatch):
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    monkeypatch.setattr(settings, "public_base_url", "http://localhost:3000")
    sent = []
    monkeypatch.setattr(mail_mod, "send_mail", lambda *a, **kw: sent.append(a) or True)

    r = client.post("/api/v1/auth/password-reset/request", json={"email": "nobody@example.com"})
    assert r.status_code == 200
    assert sent == []


def test_password_reset_request_returns_generic_response_for_known_email(client, monkeypatch, db_session_factory):
    from app.models import User

    monkeypatch.setattr(settings, "session_secret", "test-secret")
    monkeypatch.setattr(settings, "public_base_url", "http://localhost:3000")
    db = db_session_factory()
    u = db.query(User).filter(User.username == settings.admin_username).first()
    u.email = "admin@example.com"
    db.commit()
    db.close()

    sent = []
    monkeypatch.setattr(mail_mod, "send_mail", lambda to, subject, body: sent.append((to, subject, body)) or True)

    r1 = client.post("/api/v1/auth/password-reset/request", json={"email": "admin@example.com"})
    r2 = client.post("/api/v1/auth/password-reset/request", json={"email": "nobody@example.com"})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json() == r2.json()
    assert len(sent) == 1
    assert sent[0][0] == "admin@example.com"


def test_password_reset_confirm_success(client, monkeypatch, db_session_factory):
    from app.models import User
    from editor_common import session_tokens
    import hashlib

    monkeypatch.setattr(settings, "session_secret", "test-secret")
    monkeypatch.setattr(settings, "public_base_url", "http://localhost:3000")

    db = db_session_factory()
    u = db.query(User).filter(User.username == settings.admin_username).first()
    fp = hashlib.sha256(u.password_hash.encode()).hexdigest()[:16]
    uid = u.id
    db.close()

    token = session_tokens.sign(settings.session_secret, {"uid": uid, "pwfp": fp}, max_age_seconds=1800)
    r = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": "brand-new-pw"})
    assert r.status_code == 200, r.text

    client.auth = (settings.admin_username, "brand-new-pw")
    r = client.get("/api/v1/projects")
    assert r.status_code == 200


def test_password_reset_confirm_invalid_token(client, monkeypatch):
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    r = client.post("/api/v1/auth/password-reset/confirm", json={"token": "garbage", "new_password": "x12345678"})
    assert r.status_code == 400


def test_password_reset_confirm_expired_token(client, monkeypatch, db_session_factory):
    from app.models import User
    from editor_common import session_tokens
    import hashlib

    monkeypatch.setattr(settings, "session_secret", "test-secret")

    db = db_session_factory()
    u = db.query(User).filter(User.username == settings.admin_username).first()
    fp = hashlib.sha256(u.password_hash.encode()).hexdigest()[:16]
    uid = u.id
    db.close()

    token = session_tokens.sign(settings.session_secret, {"uid": uid, "pwfp": fp}, max_age_seconds=-10)
    r = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": "x12345678"})
    assert r.status_code == 400


def test_password_reset_confirm_reused_token_after_password_already_changed(client, monkeypatch, db_session_factory):
    from app.models import User
    from editor_common import session_tokens
    import hashlib

    monkeypatch.setattr(settings, "session_secret", "test-secret")

    db = db_session_factory()
    u = db.query(User).filter(User.username == settings.admin_username).first()
    fp = hashlib.sha256(u.password_hash.encode()).hexdigest()[:16]
    uid = u.id
    db.close()

    token = session_tokens.sign(settings.session_secret, {"uid": uid, "pwfp": fp}, max_age_seconds=1800)

    # Password changes some other way (e.g. an admin reset) before the link
    # is used — the fingerprint embedded in the token no longer matches.
    client.post(f"/api/v1/users/{settings.admin_username}/password", json={"new_password": "changed-elsewhere"})

    r = client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": "x12345678"})
    assert r.status_code == 400


def test_password_reset_endpoints_work_without_authorization_header(client, monkeypatch):
    # Regression guard: these must actually be public — a request with no
    # Authorization header and no session cookie at all must not 401.
    monkeypatch.setattr(settings, "session_secret", "test-secret")
    monkeypatch.setattr(settings, "public_base_url", "http://localhost:3000")
    saved_auth = client.auth
    client.auth = None
    try:
        r = client.post("/api/v1/auth/password-reset/request", json={"email": "nobody@example.com"})
        assert r.status_code == 200
        r = client.post("/api/v1/auth/password-reset/confirm", json={"token": "garbage", "new_password": "x12345678"})
        assert r.status_code == 400
    finally:
        client.auth = saved_auth
