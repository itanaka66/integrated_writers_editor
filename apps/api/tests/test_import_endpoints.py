import asyncio
import io

writers_EXPORT = """\
【タイトル】
エンドポイント作品

【あらすじ】
あらすじ。

【ジャンル】
ファンタジー

------------------------- エピソード1開始 -------------------------
【エピソードタイトル】
第1話 「開始」

【本文】
本文です。
"""


def _fake_run_import_job(monkeypatch):
    # These tests are about the HTTP wiring (routes, status codes, request
    # validation) — the actual import logic is covered by test_importer.py
    # against a stubbed AI stack. Swap in a no-op so no background asyncio
    # task lingers past the test.
    async def fake(job_id, text):
        await asyncio.sleep(0)

    monkeypatch.setattr("app.main.run_import_job", fake)


def test_import_writers_creates_a_job(client, monkeypatch):
    _fake_run_import_job(monkeypatch)
    r = client.post(
        "/api/v1/import/writers",
        files={"file": ("writers.txt", io.BytesIO(writers_EXPORT.encode("utf-8")), "text/plain")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "writers"
    assert body["status"] == "queued"
    assert body["source_filename"] == "writers.txt"

    r = client.get(f"/api/v1/import-jobs/{body['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == body["id"]


def test_import_writers_rejects_unrecognized_format(client, monkeypatch):
    _fake_run_import_job(monkeypatch)
    r = client.post(
        "/api/v1/import/writers",
        files={"file": ("plain.txt", io.BytesIO("ただのテキストです。".encode("utf-8")), "text/plain")},
    )
    assert r.status_code == 400


def test_import_episodes_requires_existing_project(client, monkeypatch):
    _fake_run_import_job(monkeypatch)
    r = client.post(
        "/api/v1/projects/999999/import/episodes",
        files={"file": ("writers.txt", io.BytesIO(writers_EXPORT.encode("utf-8")), "text/plain")},
    )
    assert r.status_code == 404


def test_import_episodes_into_existing_project(client, project, monkeypatch):
    _fake_run_import_job(monkeypatch)
    r = client.post(
        f"/api/v1/projects/{project['id']}/import/episodes",
        files={"file": ("writers.txt", io.BytesIO(writers_EXPORT.encode("utf-8")), "text/plain")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "episodes"
    assert body["project_id"] == project["id"]

    r = client.get(f"/api/v1/projects/{project['id']}/import-jobs")
    assert r.status_code == 200
    assert any(j["id"] == body["id"] for j in r.json())


def test_import_job_not_found(client):
    r = client.get("/api/v1/import-jobs/999999")
    assert r.status_code == 404
