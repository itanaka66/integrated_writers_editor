"""Mirrors episode text to local disk and, optionally, auto-syncs it to a
git remote on a timer.

The database stays the source of truth for every read the app does — this
module is a one-way write-through mirror, so a bug here can never corrupt
what readers see. Two independent failure domains:

- Disk mirror: `write_episode_file`/`delete_episode_file` run synchronously
  right after the DB commit for that episode, so the file on disk reflects
  the last successful save immediately (not on some later timer).
- Git sync: a background loop commits whatever changed since last time and
  pushes it, every `git_autosync_interval_seconds`. Only runs when
  `git_remote_url` is configured. Failures (no network, bad token, remote
  rejected) are logged and retried on the next tick — they never raise into
  a request handler.
"""
import asyncio
import logging
import re
import subprocess
from pathlib import Path

from .config import settings

logger = logging.getLogger(__name__)

_SLUG_RE = re.compile(r'[\\/:*?"<>|\r\n\t]+')


def _safe_slug(s: str, maxlen: int = 60) -> str:
    s = _SLUG_RE.sub('_', (s or '').strip()) or 'untitled'
    return s[:maxlen].strip() or 'untitled'


def storage_root() -> Path:
    p = Path(settings.writers_storage_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def project_dir(project) -> Path:
    d = storage_root() / f'{project.id}_{_safe_slug(project.name)}'
    d.mkdir(parents=True, exist_ok=True)
    return d


def episode_file_path(project, episode) -> Path:
    # Filename keys on episode id (stable) rather than title (editable), so
    # renaming a title never orphans a file or requires a rename dance.
    return project_dir(project) / f'{episode.number:04d}_{episode.id}.md'


def write_episode_file(project, episode) -> None:
    path = episode_file_path(project, episode)
    summary_line = f'> {episode.summary}\n\n' if episode.summary else ''
    body = f'# 第{episode.number}話 {episode.title}\n\n{summary_line}{episode.content or ""}\n'
    try:
        path.write_text(body, encoding='utf-8')
    except OSError:
        logger.exception('Failed to write episode file for episode %s', episode.id)


def delete_episode_file(project, episode) -> None:
    path = episode_file_path(project, episode)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.exception('Failed to delete episode file for episode %s', episode.id)


def _run_git(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ['git', *args], cwd=storage_root(), capture_output=True, text=True, timeout=60,
    )


def _ensure_repo() -> None:
    if not (storage_root() / '.git').exists():
        _run_git(['init'])
        _run_git(['config', 'user.email', 'ine-autosync@localhost'])
        _run_git(['config', 'user.name', 'INE Auto-Sync'])
    if settings.git_remote_url:
        remote = _run_git(['remote', 'get-url', 'origin'])
        if remote.returncode != 0:
            _run_git(['remote', 'add', 'origin', settings.git_remote_url])
        elif remote.stdout.strip() != settings.git_remote_url:
            _run_git(['remote', 'set-url', 'origin', settings.git_remote_url])


def sync_once() -> bool:
    """Commit any changed files and push. Returns True if a push happened."""
    if not settings.git_remote_url:
        return False
    _ensure_repo()
    status = _run_git(['status', '--porcelain'])
    if status.stdout.strip():
        _run_git(['add', '-A'])
        commit = _run_git(['commit', '-m', 'Auto-save from Integrated writers Editor (INE)'])
        if commit.returncode != 0:
            logger.warning('git commit failed during auto-sync: %s', commit.stderr.strip()[:300])
            return False
    push = _run_git(['push', 'origin', 'HEAD:main'])
    if push.returncode != 0:
        # Never log stderr/stdout verbatim here: git echoes the remote URL
        # (which embeds the access token) into its own error output.
        logger.warning('git push failed during auto-sync (remote unreachable or rejected)')
        return False
    return True


async def autosync_loop() -> None:
    if not settings.git_remote_url:
        logger.info('GIT_REMOTE_URL not set; local-disk mirror is active but GitHub auto-sync is disabled.')
        return
    while True:
        await asyncio.sleep(settings.git_autosync_interval_seconds)
        try:
            await asyncio.to_thread(sync_once)
        except Exception:
            logger.exception('Unexpected error during git auto-sync')
