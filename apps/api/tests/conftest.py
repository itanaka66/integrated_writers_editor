import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.config import settings
from app.db import Base, get_db
from app.main import app
from app import auth as auth_module


@pytest.fixture(autouse=True)
def isolate_writers_storage_dir(tmp_path, monkeypatch):
    # Episode add/update/delete now mirror to settings.writers_storage_dir on
    # every call — without this, every test in the suite would write real
    # files under the repo's default "./writers_storage".
    monkeypatch.setattr(settings, "writers_storage_dir", str(tmp_path / "writers_storage"))


@pytest.fixture(autouse=True)
def reset_login_rate_limit():
    # The brute-force guard in app.auth keeps its failure counts in a
    # module-level dict, keyed by client IP — Starlette's TestClient always
    # reports the same IP ("testclient"), so failures from one test would
    # otherwise bleed into the next and make unrelated tests flaky.
    auth_module._failures.clear()
    yield
    auth_module._failures.clear()


@pytest.fixture()
def db_session_factory():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    yield TestingSessionLocal
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session_factory):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    # Note: TestClient only runs FastAPI's startup/shutdown events when used
    # as a context manager. We deliberately avoid that here, since the app's
    # startup handler connects to the real (Postgres) database configured by
    # app.config.settings, which isn't available in the test environment.
    app.dependency_overrides[get_db] = override_get_db
    c = TestClient(app)
    c.auth = (settings.admin_username, settings.admin_password)
    yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def project(client):
    r = client.post("/api/v1/projects", json={"name": "テスト作品", "description": "d", "genre": "g", "rules": "r"})
    assert r.status_code == 200
    return r.json()
