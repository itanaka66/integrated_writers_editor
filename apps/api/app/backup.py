from editor_common.backup import BackupManager

from .config import settings
from .runtime_config import get_effective_config

_manager = BackupManager(
    backup_dir=settings.backup_dir,
    database_url=settings.database_url,
    get_qdrant_url=lambda: get_effective_config().qdrant_url,
    collection="writers_story_memory",
    retention_count=settings.backup_retention_count,
    default_db_name="writers",
)

run_backup = _manager.run_backup
list_backups = _manager.list_backups


async def backup_loop() -> None:
    await _manager.backup_loop(
        enabled=settings.backup_enabled,
        interval_seconds=settings.backup_interval_seconds,
    )
