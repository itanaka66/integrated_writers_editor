import base64
import logging
import secrets
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .config import settings

logger = logging.getLogger(__name__)

# Paths that must stay reachable without credentials (health checks, API docs).
PUBLIC_PATHS = {"/api/v1/health", "/docs", "/openapi.json", "/redoc"}

# Simple in-memory brute-force guard: HTTP Basic Auth has no built-in lockout,
# so without this a script can retry passwords as fast as the network allows.
# Keyed by client IP; single-process only (fine for this app's deployment
# model — see docs/requirements.md), and resets on restart.
FAILURE_WINDOW_SECONDS = 300
MAX_FAILURES = 10
LOCKOUT_SECONDS = 300
_failures: dict[str, list[float]] = defaultdict(list)


def _unauthorized(retry_after: int | None = None) -> Response:
    headers = {"WWW-Authenticate": "Basic"}
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return Response(
        status_code=401 if retry_after is None else 429,
        content='{"detail":"Too many failed login attempts. Try again later."}' if retry_after is not None
        else '{"detail":"Not authenticated"}',
        media_type="application/json",
        headers=headers,
    )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _prune(timestamps: list[float], now: float) -> list[float]:
    return [t for t in timestamps if now - t < FAILURE_WINDOW_SECONDS]


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Single-user HTTP Basic Auth gate for the whole API.

    This app has no user model; it protects the entire instance with one
    shared admin/password pair configured via ADMIN_USERNAME/ADMIN_PASSWORD.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        ip = _client_ip(request)
        now = time.time()
        _failures[ip] = _prune(_failures[ip], now)
        if len(_failures[ip]) >= MAX_FAILURES:
            logger.warning("Login rate limit hit for %s (%d failures in the last %ds)", ip, len(_failures[ip]), FAILURE_WINDOW_SECONDS)
            return _unauthorized(retry_after=LOCKOUT_SECONDS)

        header = request.headers.get("authorization", "")
        if not header.startswith("Basic "):
            return _unauthorized()
        try:
            decoded = base64.b64decode(header[6:]).decode("utf-8")
            username, _, password = decoded.partition(":")
        except Exception:
            _failures[ip].append(now)
            return _unauthorized()

        user_ok = secrets.compare_digest(username, settings.admin_username)
        pass_ok = secrets.compare_digest(password, settings.admin_password)
        if not (user_ok and pass_ok):
            _failures[ip].append(now)
            return _unauthorized()
        _failures[ip].clear()
        return await call_next(request)
