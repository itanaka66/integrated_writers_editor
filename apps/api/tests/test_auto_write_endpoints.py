import asyncio
import time

from app.models import AutoWriteJob


def test_start_status_stop_smoke(client, project, monkeypatch):
    # Make the background job settle immediately instead of hitting a real
    # Ollama instance, so this test stays hermetic. run_job flips the job to
    # 'running' and then immediately fails generate(), landing on 'error' —
    # that's enough to prove start/status/stop are wired end-to-end.
    async def fake_run_job(job_id, premise="", overwrite=False):
        await asyncio.sleep(0)

    monkeypatch.setattr("app.main.run_job", fake_run_job)

    r = client.post("/api/v1/auto-write/start", json={"project_id": project["id"], "start_episode": 1, "end_episode": 5})
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["project_id"] == project["id"]
    assert job["total_episodes"] == 5
    assert job["current_phase"] in ("series_planner", "queued")

    r = client.get(f"/api/v1/auto-write/{job['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == job["id"]

    r = client.get(f"/api/v1/projects/{project['id']}/auto-write/jobs")
    assert r.status_code == 200
    assert any(j["id"] == job["id"] for j in r.json())

    r = client.post(f"/api/v1/auto-write/{job['id']}/stop")
    assert r.status_code == 200


def test_start_not_found_project(client):
    r = client.post("/api/v1/auto-write/start", json={"project_id": 999999})
    assert r.status_code == 404


def test_stop_not_found_job(client):
    r = client.post("/api/v1/auto-write/999999/stop")
    assert r.status_code == 404
