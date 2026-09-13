"""CORS middleware whose allowed-origins list can change at runtime.

Starlette's CORSMiddleware freezes `allow_origins` at app-startup time, so
changing CORS_ORIGINS normally requires editing .env and restarting the
container. This subclass overrides the one method that reads that list
(`is_allowed_origin`) to consult `runtime_config.get_cors_origins()` fresh on
every request instead — letting the Settings screen change it live, the same
way it already does for the Qdrant/Ollama URLs.
"""
from starlette.middleware.cors import CORSMiddleware

from . import runtime_config as rc


class DynamicCORSMiddleware(CORSMiddleware):
    def is_allowed_origin(self, origin: str) -> bool:
        # "*" in CORS_ORIGINS means "allow any origin" — checked explicitly
        # here rather than relying on the base class's allow_all_origins
        # (computed once, at __init__, from the static allow_origins this
        # subclass never actually uses). The response still echoes back the
        # real Origin header rather than a literal "*", which is required
        # anyway since this app always sends Access-Control-Allow-Credentials.
        origins = rc.get_cors_origins()
        return "*" in origins or origin in origins
