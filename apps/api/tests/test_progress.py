from types import SimpleNamespace

from app.main import _job_progress


class FakeDB:
    def __init__(self, values):
        self.values = iter(values)

    def scalar(self, statement):
        return next(self.values)

    def scalars(self, statement):
        return _FakeScalars(next(self.values))


class _FakeScalars:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


def job(**overrides):
    base = dict(
        id=1,
        project_id=10,
        start_episode=1,
        end_episode=10,
        current_episode=4,
        status="running",
        writer_model="qwen3.8:27b",
        controller_model="qwen3:14b",
        last_message="EP.4: Writer (qwen3.8:27b)",
        created_at=None,
        updated_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def db_for(series=True, arcs=0, minis=0, plans=0, written=0):
    # _job_progress calls scalar once, then scalars four times.
    return FakeDB([
        object() if series else None,
        [object()] * arcs,
        [object()] * minis,
        [object()] * plans,
        [object()] * written,
    ])


def test_progress_running_writer_phase():
    result = _job_progress(job(current_episode=4), db_for(series=True, arcs=1, minis=2, plans=4, written=3))

    assert result["progress_percent"] == 30.0
    assert result["completed_episodes"] == 3
    assert result["total_episodes"] == 10
    assert result["current_phase"] == "writer"
    assert result["series_planned"] is True
    assert result["arcs_planned"] == 1
    assert result["mini_arcs_planned"] == 2
    assert result["episodes_planned"] == 4
    assert result["episodes_written"] == 3


def test_progress_series_planner_phase():
    result = _job_progress(
        job(current_episode=1, last_message="Series Planner: EP.1～500"),
        db_for(series=False),
    )
    assert result["progress_percent"] == 0.0
    assert result["current_phase"] == "series_planner"


def test_progress_arc_planner_phase():
    result = _job_progress(
        job(current_episode=10, last_message="EP.10: 階層Plannerを展開中"),
        db_for(series=True, arcs=1, minis=10),
    )
    assert result["completed_episodes"] == 9
    assert result["progress_percent"] == 90.0
    assert result["current_phase"] == "arc_planner"


def test_progress_completed_is_100_percent():
    result = _job_progress(
        job(current_episode=10, status="completed", last_message="全エピソード生成完了"),
        db_for(series=True, arcs=5, minis=50, plans=10, written=10),
    )
    assert result["progress_percent"] == 100.0
    assert result["completed_episodes"] == 10
    assert result["current_phase"] == "completed"


def test_progress_stopped_phase_and_never_exceeds_100():
    result = _job_progress(
        job(current_episode=999, status="stopped", last_message="停止要求を受け付けました"),
        db_for(series=True, arcs=5, minis=50, plans=10, written=10),
    )
    assert result["progress_percent"] == 100.0
    assert result["current_phase"] == "stopped"
