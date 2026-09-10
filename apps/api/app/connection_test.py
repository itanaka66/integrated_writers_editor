"""Ad-hoc connectivity checks for the 設定 > 接続設定 screen's "接続テスト"
buttons. Each check is a short, timeout-bounded probe against a URL/model
the caller supplies directly — not necessarily the currently-saved
override — so the UI can validate a value before saving it.
"""
import time

import httpx
from qdrant_client import QdrantClient
from sqlalchemy import text as sql_text

from .db import SessionLocal

TIMEOUT_SECONDS = 8


def _timed(fn):
    start = time.monotonic()
    try:
        detail = fn()
        return True, detail, round((time.monotonic() - start) * 1000)
    except Exception as ex:
        return False, str(ex), round((time.monotonic() - start) * 1000)


def test_database() -> tuple[bool, str, int]:
    def run():
        db = SessionLocal()
        try:
            db.execute(sql_text('SELECT 1'))
        finally:
            db.close()
        return '接続に成功しました。'
    return _timed(run)


def test_qdrant(url: str) -> tuple[bool, str, int]:
    def run():
        c = QdrantClient(url=url, timeout=TIMEOUT_SECONDS)
        collections = c.get_collections().collections
        return f'接続に成功しました（コレクション数: {len(collections)}）。'
    return _timed(run)


def test_ollama(url: str, model: str | None = None) -> tuple[bool, str, int]:
    def run():
        r = httpx.get(url.rstrip('/') + '/api/tags', timeout=TIMEOUT_SECONDS)
        r.raise_for_status()
        names = [m.get('name', '') for m in r.json().get('models', [])]
        if model and not any(n == model or n.startswith(model + ':') or n.split(':')[0] == model.split(':')[0] for n in names):
            return f'接続には成功しましたが、モデル「{model}」が見つかりません（利用可能: {", ".join(names) or "なし"}）。`ollama pull {model}`が必要な可能性があります。'
        return f'接続に成功しました（利用可能なモデル数: {len(names)}）。'
    return _timed(run)
