"""Writes the API's OpenAPI schema to a static file.

The live schema is always available at /openapi.json (and rendered as
Swagger UI at /docs) from a running server — this script is for anyone who
wants a committed, offline copy (e.g. to diff API changes in a PR, or feed
into an external codegen/doc tool) without starting the app or a database.

Usage (from apps/api, with the venv from requirements-dev.txt active):
    python scripts/export_openapi.py [output-path]

Defaults to writing ../../docs/openapi.json (repo-root docs/).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402

DEFAULT_OUTPUT = Path(__file__).resolve().parents[3] / "docs" / "openapi.json"


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    output.parent.mkdir(parents=True, exist_ok=True)
    schema = app.openapi()
    output.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote OpenAPI schema ({len(schema.get('paths', {}))} paths) to {output}")


if __name__ == "__main__":
    main()
