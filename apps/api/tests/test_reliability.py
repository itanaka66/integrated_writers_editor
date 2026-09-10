from app.main import cleanup_stale_auto_write_jobs
from app.models import AutoWriteJob


def test_cleanup_marks_stale_jobs_as_error(client, project, db_session_factory):
    r = client.post("/api/v1/auto-write/start", json={"project_id": project["id"], "start_episode": 1, "end_episode": 2})
    job_id = r.json()["id"]

    db = db_session_factory()
    try:
        job = db.get(AutoWriteJob, job_id)
        job.status = "running"
        db.commit()

        count = cleanup_stale_auto_write_jobs(db)
        assert count == 1

        db.refresh(job)
        assert job.status == "error"
        assert "再起動" in job.last_message
    finally:
        db.close()


def test_cleanup_leaves_finished_jobs_alone(client, project, db_session_factory):
    r = client.post("/api/v1/auto-write/start", json={"project_id": project["id"], "start_episode": 1, "end_episode": 2})
    job_id = r.json()["id"]

    db = db_session_factory()
    try:
        job = db.get(AutoWriteJob, job_id)
        job.status = "completed"
        db.commit()

        count = cleanup_stale_auto_write_jobs(db)
        assert count == 0

        db.refresh(job)
        assert job.status == "completed"
    finally:
        db.close()
