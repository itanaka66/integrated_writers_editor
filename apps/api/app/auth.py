from editor_common.auth import MAX_FAILURES, make_auth_middleware, make_session_verifier
from editor_common.users import authenticate_user

from .config import settings
from .db import SessionLocal
from .models import User

# A module-level indirection (rather than calling SessionLocal directly)
# so tests can point authentication at their isolated in-memory database —
# app.db.get_db is overridden per-request via FastAPI's dependency_overrides,
# but this middleware runs outside that dependency graph.
_session_factory = SessionLocal


def _authenticate(username: str, password: str) -> bool:
    db = _session_factory()
    try:
        return authenticate_user(db, User, username, password) is not None
    finally:
        db.close()


def _verify_session(token: str):
    # Indirection through _session_factory (not a fixed SessionLocal
    # reference) so this picks up the same monkeypatched factory tests use
    # for _authenticate above, and so it works when session_secret is set
    # after import (e.g. in a test that monkeypatches settings.session_secret).
    return make_session_verifier(settings.session_secret, _session_factory, User)(token)


def _build_auth_middleware():
    # OAuth2 (Google/GitHub) login is entirely opt-in — only combine session
    # cookie verification with Basic Auth when a session_secret is actually
    # configured. With no session_secret, behavior is 100% identical to the
    # Basic-Auth-only middleware this replaced, since most deployments won't
    # have OAuth configured.
    if not settings.session_secret:
        # Basic-Auth-only, but /api/v1/auth/providers must stay public even
        # when OAuth itself isn't configured — the Login screen calls it on
        # every load to decide which provider buttons to show (it always
        # reports everything disabled in that case).
        return make_auth_middleware(
            authenticate_basic=_authenticate,
            public_paths=(
                "/api/v1/health","/docs","/openapi.json","/redoc","/api/v1/auth/providers",
                "/api/v1/auth/password-reset/request","/api/v1/auth/password-reset/confirm",
            ),
        )
    return make_auth_middleware(
        authenticate_basic=_authenticate,
        verify_session=_verify_session,
        # Only the login/callback/logout dance, the public provider-list
        # endpoint, and the password-reset request/confirm endpoints are
        # public — a locked-out user has no session/credentials yet when
        # calling those. /api/v1/auth/me stays protected: it's how the
        # frontend detects an existing session, so it must 401 when there
        # isn't one.
        public_paths=(
            "/api/v1/health","/docs","/openapi.json","/redoc","/api/v1/auth/providers","/api/v1/auth/logout",
            "/api/v1/auth/password-reset/request","/api/v1/auth/password-reset/confirm",
        ),
        public_path_prefixes=("/api/v1/auth/login","/api/v1/auth/callback"),
    )


AuthMiddleware = _build_auth_middleware()
# Kept for backwards compatibility with any existing import of this name.
BasicAuthMiddleware = AuthMiddleware
