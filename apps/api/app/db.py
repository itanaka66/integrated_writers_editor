from editor_common.db import create_db
from .config import settings

_db = create_db(settings.database_url)
engine = _db.engine
SessionLocal = _db.SessionLocal
Base = _db.Base
get_db = _db.get_db
