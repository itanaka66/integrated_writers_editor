from fastapi.testclient import TestClient

from app.main import app


def test_health_is_public():
    c = TestClient(app)
    r = c.get("/api/v1/health")
    assert r.status_code == 200


def test_projects_requires_auth():
    c = TestClient(app)
    r = c.get("/api/v1/projects")
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Basic"


def test_projects_rejects_wrong_credentials():
    c = TestClient(app)
    c.auth = ("admin", "wrong-password")
    r = c.get("/api/v1/projects")
    assert r.status_code == 401


def test_projects_accepts_correct_credentials(client):
    r = client.get("/api/v1/projects")
    assert r.status_code == 200


def test_repeated_failed_logins_are_rate_limited():
    from app.auth import MAX_FAILURES

    c = TestClient(app)
    c.auth = ("admin", "wrong-password")
    for _ in range(MAX_FAILURES):
        r = c.get("/api/v1/projects")
        assert r.status_code == 401

    r = c.get("/api/v1/projects")
    assert r.status_code == 429
    assert "Retry-After" in r.headers

    # Even the *correct* password is rejected while locked out — the guard
    # blocks by IP before credentials are even checked.
    c.auth = ("admin", "writers-studio-change-me")
    r = c.get("/api/v1/projects")
    assert r.status_code == 429
