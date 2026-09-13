from editor_common.file_sync import FileSyncManager
from editor_common.file_sync import _safe_slug  # re-exported for tests

from .config import settings


def _manager() -> FileSyncManager:
    # Built lazily (not once at import time) so tests that monkeypatch
    # settings.writers_storage_dir per-test (see conftest.isolate_writers_storage_dir)
    # are honored, and so a live GIT_REMOTE_URL change doesn't need a restart.
    return FileSyncManager(
        storage_dir=settings.writers_storage_dir,
        git_remote_url=settings.git_remote_url,
        git_autosync_interval_seconds=settings.git_autosync_interval_seconds,
        commit_message="Auto-save from Integrated writers Editor (INE)",
        git_author_name="INE Auto-Sync",
        git_author_email="ine-autosync@localhost",
    )


def storage_root():
    return _manager().storage_root()


def project_dir(project):
    return _manager().project_dir(project)


def episode_file_path(project, episode):
    return _manager().episode_file_path(project, episode)


def write_episode_file(project, episode) -> None:
    _manager().write_episode_file(project, episode)


def delete_episode_file(project, episode) -> None:
    _manager().delete_episode_file(project, episode)


def sync_once() -> bool:
    return _manager().sync_once()


async def autosync_loop() -> None:
    await _manager().autosync_loop()
