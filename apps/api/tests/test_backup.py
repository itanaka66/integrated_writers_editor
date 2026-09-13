import asyncio
from pathlib import Path

from editor_common import backup as common_backup

from app import backup
from app.runtime_config import EffectiveConfig

# _snapshot_qdrant resolves its URL via get_effective_config(), which (with
# no `db` passed) opens its own session against the app's configured
# database — real Postgres in CI, not up in this test environment. These
# tests are about the backup logic only, so stub it out. The actual logic
# lives in editor_common.backup.BackupManager now; app.backup just builds
# one instance (`_manager`) bound to this app's settings.
_FAKE_CONFIG = EffectiveConfig(
    qdrant_url="http://qdrant:6333",
    ollama_url="http://ollama:11434",
    ollama_model="stub-writer-model",
    ollama_embed_model="stub-embed-model",
)


def test_dump_postgres_reports_failure_when_pg_dump_is_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(backup._manager, "database_url", "postgresql+psycopg2://writers:writers@nonexistent-host:5432/writers")
    ok, err = backup._manager._dump_postgres(tmp_path / "postgres.dump")
    assert ok is False
    assert err


def test_snapshot_qdrant_skips_when_collection_missing(monkeypatch):
    class _FakeResponse:
        status_code = 404

        def raise_for_status(self):
            pass

    class _FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, **kw):
            return _FakeResponse()

    monkeypatch.setattr(backup._manager, "_get_qdrant_url", lambda: _FAKE_CONFIG.qdrant_url)
    monkeypatch.setattr(common_backup.httpx, "Client", lambda **kw: _FakeClient())
    ok, msg = backup._manager._snapshot_qdrant(Path("/tmp/unused.snapshot"))
    assert ok is False
    assert "skipped" in msg


def test_run_backup_creates_a_timestamped_directory_and_prunes_old_ones(tmp_path, monkeypatch):
    from datetime import datetime, timedelta, timezone

    monkeypatch.setattr(backup._manager, "backup_dir", str(tmp_path))
    monkeypatch.setattr(backup._manager, "retention_count", 2)
    monkeypatch.setattr(backup._manager, "_dump_postgres", lambda out_path: (out_path.write_text("dump"), (True, ""))[1])
    monkeypatch.setattr(backup._manager, "_snapshot_qdrant", lambda out_path: (False, "skipped (nothing indexed yet)"))

    class _FakeDateTime(datetime):
        _tick = 0

        @classmethod
        def now(cls, tz=None):
            cls._tick += 1
            return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=cls._tick)

    monkeypatch.setattr(common_backup, "datetime", _FakeDateTime)

    result = None
    for _ in range(3):
        result = backup.run_backup()

    assert result["postgres_ok"] is True
    assert result["qdrant_ok"] is False

    remaining = [d for d in tmp_path.iterdir() if d.is_dir()]
    assert len(remaining) == 2  # pruned down to backup_retention_count


def test_list_backups_reflects_what_run_backup_wrote(tmp_path, monkeypatch):
    monkeypatch.setattr(backup._manager, "backup_dir", str(tmp_path))
    monkeypatch.setattr(backup._manager, "retention_count", 5)
    monkeypatch.setattr(backup._manager, "_dump_postgres", lambda out_path: (out_path.write_text("dump"), (True, ""))[1])
    monkeypatch.setattr(backup._manager, "_snapshot_qdrant", lambda out_path: (out_path.write_text("snap"), (True, ""))[1])

    backup.run_backup()
    entries = backup.list_backups()
    assert len(entries) == 1
    assert entries[0]["has_postgres"] is True
    assert entries[0]["has_qdrant"] is True
    assert entries[0]["size_bytes"] > 0


def test_backup_loop_is_a_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(backup.settings, "backup_enabled", False)
    called = []
    monkeypatch.setattr(backup, "run_backup", lambda: called.append(1))
    asyncio.run(backup.backup_loop())
    assert called == []
