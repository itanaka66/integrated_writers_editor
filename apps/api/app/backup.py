"""Scheduled + on-demand backups of PostgreSQL (pg_dump) and the Qdrant
vector store (a collection snapshot), mirroring what scripts/backup.sh does
by hand — but running from inside the app so it can (a) run on a timer with
no separate cron/host setup, and (b) resolve Qdrant's URL the same way the
rest of the app does, including any live override set from 設定 > 接続設定,
rather than only a fixed QDRANT_URL env var.

Off by default (`BACKUP_ENABLED`) so no existing deployment suddenly starts
writing to disk on a timer just from upgrading.
"""
import asyncio
import logging
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy.engine import make_url

from .config import settings
from .runtime_config import get_effective_config

logger = logging.getLogger(__name__)

COLLECTION = 'writers_story_memory'
PG_DUMP_TIMEOUT_SECONDS = 300
QDRANT_TIMEOUT_SECONDS = 60


def _backup_root() -> Path:
    p = Path(settings.backup_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _dump_postgres(out_path: Path) -> tuple[bool, str]:
    url = make_url(settings.database_url)
    args = [
        'pg_dump', '-h', url.host or 'localhost', '-p', str(url.port or 5432),
        '-U', url.username or 'writers', '-d', url.database or 'writers',
        '-F', 'c', '-f', str(out_path),
    ]
    env = {'PGPASSWORD': url.password or ''}
    try:
        r = subprocess.run(args, env=env, capture_output=True, text=True, timeout=PG_DUMP_TIMEOUT_SECONDS)
    except (OSError, subprocess.TimeoutExpired) as ex:
        return False, str(ex)
    if r.returncode != 0:
        return False, r.stderr.strip()[:500]
    return True, ''


def _snapshot_qdrant(out_path: Path) -> tuple[bool, str]:
    base = get_effective_config().qdrant_url.rstrip('/')
    try:
        with httpx.Client(timeout=QDRANT_TIMEOUT_SECONDS) as c:
            exists = c.get(f'{base}/collections/{COLLECTION}')
            if exists.status_code == 404:
                return False, 'skipped (nothing indexed yet)'
            exists.raise_for_status()
            created = c.post(f'{base}/collections/{COLLECTION}/snapshots')
            created.raise_for_status()
            name = created.json()['result']['name']
            downloaded = c.get(f'{base}/collections/{COLLECTION}/snapshots/{name}')
            downloaded.raise_for_status()
            out_path.write_bytes(downloaded.content)
    except Exception as ex:
        return False, str(ex)
    return True, ''


def _prune_old_backups() -> None:
    dirs = sorted((d for d in _backup_root().iterdir() if d.is_dir()), key=lambda d: d.name, reverse=True)
    for d in dirs[max(settings.backup_retention_count, 0):]:
        shutil.rmtree(d, ignore_errors=True)


def run_backup() -> dict:
    start = time.monotonic()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    out_dir = _backup_root() / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    pg_ok, pg_error = _dump_postgres(out_dir / 'postgres.dump')
    qdrant_ok, qdrant_error = _snapshot_qdrant(out_dir / f'qdrant-{COLLECTION}.snapshot')
    _prune_old_backups()

    result = {
        'timestamp': stamp,
        'postgres_ok': pg_ok, 'postgres_error': pg_error,
        'qdrant_ok': qdrant_ok, 'qdrant_error': qdrant_error,
        'duration_seconds': round(time.monotonic() - start, 1),
    }
    if pg_ok:
        logger.info('Backup %s: postgres OK, qdrant %s', stamp, 'OK' if qdrant_ok else qdrant_error)
    else:
        logger.error('Backup %s: postgres FAILED (%s)', stamp, pg_error)
    return result


def list_backups() -> list[dict]:
    out = []
    for d in sorted(_backup_root().iterdir(), reverse=True):
        if not d.is_dir():
            continue
        files = list(d.iterdir())
        out.append({
            'timestamp': d.name,
            'has_postgres': any(f.name == 'postgres.dump' for f in files),
            'has_qdrant': any(f.name.startswith('qdrant-') for f in files),
            'size_bytes': sum(f.stat().st_size for f in files),
        })
    return out


async def backup_loop() -> None:
    if not settings.backup_enabled:
        logger.info('BACKUP_ENABLED is not set; scheduled backups are disabled (scripts/backup.sh still works manually).')
        return
    while True:
        await asyncio.sleep(settings.backup_interval_seconds)
        try:
            await asyncio.to_thread(run_backup)
        except Exception:
            logger.exception('Unexpected error during scheduled backup')
