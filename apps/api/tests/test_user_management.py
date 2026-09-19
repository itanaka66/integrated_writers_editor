from app.config import settings


def test_non_admin_cannot_list_users(client, db_session_factory):
    from app.models import User
    from editor_common.users import create_user

    db = db_session_factory()
    create_user(db, User, "member", "member-pw", is_admin=False)
    db.close()

    client.auth = ("member", "member-pw")
    r = client.get("/api/v1/users")
    assert r.status_code == 403


def test_admin_can_list_users(client):
    r = client.get("/api/v1/users")
    assert r.status_code == 200, r.text
    usernames = [u["username"] for u in r.json()]
    assert settings.admin_username in usernames


def test_admin_creates_a_new_user(client):
    r = client.post("/api/v1/users", json={"username": "editor2", "password": "s3cret-pw"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["username"] == "editor2"
    assert body["is_admin"] is False
    assert body["is_active"] is True

    client.auth = ("editor2", "s3cret-pw")
    r = client.get("/api/v1/projects")
    assert r.status_code == 200


def test_creating_a_duplicate_username_conflicts(client):
    client.post("/api/v1/users", json={"username": "dup", "password": "pw12345"})
    r = client.post("/api/v1/users", json={"username": "dup", "password": "pw-other"})
    assert r.status_code == 409


def test_admin_deactivates_another_user(client):
    client.post("/api/v1/users", json={"username": "toggle-me", "password": "pw12345"})
    r = client.put("/api/v1/users/toggle-me", json={"is_active": False})
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False

    saved_auth = client.auth
    client.auth = ("toggle-me", "pw12345")
    r = client.get("/api/v1/projects")
    assert r.status_code == 401
    client.auth = saved_auth


def test_cannot_demote_the_only_admin(client):
    r = client.put(f"/api/v1/users/{settings.admin_username}", json={"is_admin": False})
    assert r.status_code == 400


def test_cannot_deactivate_the_only_admin(client):
    r = client.put(f"/api/v1/users/{settings.admin_username}", json={"is_active": False})
    assert r.status_code == 400


def test_admin_can_demote_self_if_another_admin_remains(client):
    client.post("/api/v1/users", json={"username": "second-admin", "password": "pw12345", "is_admin": True})
    r = client.put(f"/api/v1/users/{settings.admin_username}", json={"is_admin": False})
    assert r.status_code == 200, r.text


def test_admin_resets_another_users_password(client):
    client.post("/api/v1/users", json={"username": "reset-me", "password": "old-password"})
    r = client.post("/api/v1/users/reset-me/password", json={"new_password": "new-password"})
    assert r.status_code == 200, r.text

    saved_auth = client.auth
    client.auth = ("reset-me", "new-password")
    r = client.get("/api/v1/projects")
    assert r.status_code == 200
    client.auth = saved_auth


def test_cannot_delete_self(client):
    r = client.delete(f"/api/v1/users/{settings.admin_username}")
    assert r.status_code == 400


def test_admin_deletes_another_user(client):
    client.post("/api/v1/users", json={"username": "delete-me", "password": "pw12345"})
    r = client.delete("/api/v1/users/delete-me")
    assert r.status_code == 204

    r = client.get("/api/v1/users")
    assert "delete-me" not in [u["username"] for u in r.json()]


def test_deleting_an_unknown_user_404s(client):
    r = client.delete("/api/v1/users/no-such-user")
    assert r.status_code == 404
