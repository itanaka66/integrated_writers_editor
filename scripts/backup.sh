#!/usr/bin/env bash
# Back up the PostgreSQL story database and the Qdrant vector store to a
# timestamped directory. Run from the repository root with the
# docker-compose stack up: ./scripts/backup.sh [output-dir]
#
# What this does NOT cover: Ollama models (re-pull them with `ollama pull`)
# and anything outside this repo's own data. See docs/installation*.md.
set -euo pipefail

OUT_DIR="${1:-./backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR"

COMPOSE="docker compose"
DB_SERVICE="db"
QDRANT_SERVICE="qdrant"

echo "==> Backing up PostgreSQL (db service) to $OUT_DIR/postgres.dump"
$COMPOSE exec -T "$DB_SERVICE" pg_dump -U writers -d writers -F c > "$OUT_DIR/postgres.dump"

echo "==> Requesting a Qdrant snapshot"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION="writers_story_memory"

# The collection may not exist yet (nothing indexed) — that's fine, skip it.
if curl -sf "$QDRANT_URL/collections/$COLLECTION" > /dev/null; then
  SNAPSHOT_NAME=$(curl -sf -X POST "$QDRANT_URL/collections/$COLLECTION/snapshots" | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["name"])')
  echo "==> Downloading snapshot $SNAPSHOT_NAME"
  curl -sf "$QDRANT_URL/collections/$COLLECTION/snapshots/$SNAPSHOT_NAME" -o "$OUT_DIR/qdrant-$COLLECTION.snapshot"
else
  echo "==> Qdrant collection '$COLLECTION' does not exist yet; skipping (nothing has been indexed)"
fi

echo "==> Done. Backup written to: $OUT_DIR"
echo "    postgres.dump                 — restore with: pg_restore -U writers -d writers --clean postgres.dump"
echo "    qdrant-$COLLECTION.snapshot    — restore with scripts/restore.sh"
