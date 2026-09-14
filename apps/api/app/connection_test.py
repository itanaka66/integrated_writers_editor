from editor_common import connection_test as _common

from .db import SessionLocal


def test_database():
    return _common.test_database(SessionLocal)


test_qdrant = _common.test_qdrant
test_ollama = _common.test_ollama
test_anthropic = _common.test_anthropic
test_openai = _common.test_openai
test_google = _common.test_google
