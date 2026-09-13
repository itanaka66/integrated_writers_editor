from editor_common.auth import MAX_FAILURES, make_basic_auth_middleware
from editor_common.users import authenticate_user

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


BasicAuthMiddleware = make_basic_auth_middleware(authenticate=_authenticate)
