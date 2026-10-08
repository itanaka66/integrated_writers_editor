"""In-process FIFO queue that limits concurrent LLM calls and exposes what is
queued / running so the UI can list it (GET /api/v1/llm/queue).

Every LLM call goes through providers.generate / generate_stream, which wrap
their work in `slot(...)` (or submit()/release() for streaming). Jobs are
grouped by provider: 'ollama' (default 1 concurrent: one local GPU) and
'cloud' (anthropic/openai/google, default 4). Limits come from
settings.llm_max_concurrency_ollama / llm_max_concurrency_cloud (env only).
Within a group jobs start strictly FIFO; `position` is the 1-based place in
that group's waiting line.

Limitation: state lives in this process's memory. The Docker CMD runs a single
uvicorn worker so the list is complete; with several workers each would
enforce its own limit and show only its own jobs.

Release is guaranteed: callers release in `finally`, so provider errors,
client disconnects (generator close / task cancel) and cancelled waits all
free the slot or leave the waiting line.
"""
import asyncio
import contextlib
import itertools
import time
from collections import deque

from .config import settings

RECENT_MAX = 20
KEEPALIVE_SECONDS = 10


def group_for(provider: str) -> str:
    return 'ollama' if (provider or 'ollama') == 'ollama' else 'cloud'


def _limit(group: str) -> int:
    n = settings.llm_max_concurrency_ollama if group == 'ollama' else settings.llm_max_concurrency_cloud
    return max(1, int(n))


class Job:
    def __init__(self, id, label, group, project_id, username):
        self.id = id
        self.label = label
        self.group = group
        self.project_id = project_id
        self.username = username
        self.status = 'queued'  # queued | running | done | error | cancelled
        self.enqueued_at = time.monotonic()
        self.started_at = None
        self.finished_at = None
        self.chars = 0
        self.started = asyncio.get_running_loop().create_future()

    def add_chars(self, n: int):
        self.chars += n

    async def wait_started(self, timeout=None) -> bool:
        """True once running. With a timeout, False if still waiting (the wait
        is shielded, so a timeout does not abandon the queue spot)."""
        if self.started.done():
            return not self.started.cancelled()
        try:
            await asyncio.wait_for(asyncio.shield(self.started), timeout)
        except asyncio.TimeoutError:
            return False
        return True


class LlmQueue:
    def __init__(self):
        self._ids = itertools.count(1)
        self._waiting = {}  # group -> deque[Job]
        self._running = {}  # group -> list[Job]
        self._recent = deque(maxlen=RECENT_MAX)

    def submit(self, label='AI処理', provider='ollama', project_id=None, username=None) -> Job:
        group = group_for(provider)
        job = Job(next(self._ids), label, group, project_id, username)
        self._waiting.setdefault(group, deque()).append(job)
        self._promote(group)
        return job

    def _promote(self, group):
        waiting = self._waiting.setdefault(group, deque())
        running = self._running.setdefault(group, [])
        while waiting and len(running) < _limit(group):
            job = waiting.popleft()
            job.status = 'running'
            job.started_at = time.monotonic()
            running.append(job)
            if not job.started.done():
                job.started.set_result(True)

    def release(self, job: Job, status='done'):
        """Idempotent. Frees the slot (if running) or leaves the line (if waiting)."""
        if job.finished_at is not None:
            return
        job.finished_at = time.monotonic()
        waiting = self._waiting.setdefault(job.group, deque())
        running = self._running.setdefault(job.group, [])
        if job in waiting:
            waiting.remove(job)
            status = 'cancelled'
        if job in running:
            running.remove(job)
        job.status = status
        if not job.started.done():
            job.started.cancel()
        self._recent.append(job)
        self._promote(job.group)

    @contextlib.asynccontextmanager
    async def slot(self, label='AI処理', provider='ollama', project_id=None, username=None):
        job = self.submit(label, provider, project_id, username)
        status = 'done'
        try:
            await job.wait_started()
            yield job
        except (asyncio.CancelledError, GeneratorExit):
            status = 'cancelled'
            raise
        except BaseException:
            status = 'error'
            raise
        finally:
            self.release(job, status)

    def position(self, job: Job) -> int:
        w = self._waiting.get(job.group, ())
        return list(w).index(job) + 1 if job in w else 0

    def snapshot(self) -> dict:
        now = time.monotonic()

        def row(j, pos=None):
            end = j.finished_at if j.finished_at is not None else now
            begin = j.started_at if j.started_at is not None else j.enqueued_at
            return {
                'id': j.id, 'label': j.label, 'username': j.username, 'project_id': j.project_id,
                'status': j.status, 'position': pos, 'elapsed_seconds': round(max(0.0, end - begin), 1),
                'chars': j.chars,
            }
        running = sorted((j for g in self._running.values() for j in g), key=lambda j: j.id)
        queued = sorted(((j, self.position(j)) for g in self._waiting.values() for j in g), key=lambda t: t[0].id)
        return {
            'running': [row(j) for j in running],
            'queued': [row(j, p) for j, p in queued],
            'recent': [row(j) for j in reversed(self._recent)],
        }


queue = LlmQueue()
