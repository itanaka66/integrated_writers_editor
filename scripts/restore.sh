#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh. Run from the repository root
# with the docker-compose stack up: ./scripts/restore.sh <backup-dir>
#
# WARNING: this replaces the current database contents. There is no
# confirmation prompt here — add one yourself if you're scripting this
# somewhere it could run unattended against production data.
set -euo pipefail

BACKUP_DIR="${1:?Usage: scripts/restore.sh <backup-dir>}"
COMPOSE="docker compose"
DB_SERVICE="db"
QDRANT_SERVICE="qdrant"
COLLECTION="writers_story_memory"

if [ ! -f "$BACKUP_DIR/postgres.dump" ]; then
  echo "No postgres.dump found in $BACKUP_DIR" >&2
  exit 1
fi

echo "==> Restoring PostgreSQL from $BACKUP_DIR/postgres.dump"
cat "$BACKUP_DIR/postgres.dump" | $COMPOSE exec -T "$DB_SERVICE" pg_restore -U writers -d writers --clean --if-exists

SNAPSHOT_FILE="$BACKUP_DIR/qdrant-$COLLECTION.snapshot"
if [ -f "$SNAPSHOT_FILE" ]; then
  echo "==> Restoring Qdrant collection '$COLLECTION' from snapshot"
  QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
  curl -sf -X POST "$QDRANT_URL/collections/$COLLECTION/snapshots/upload" \
    -F "snapshot=@$SNAPSHOT_FILE"
else
  echo "==> No Qdrant snapshot in this backup; skipping (run 再構築/rebuild from the app instead)"
fi

echo "==> Restore complete. Restart the api container so it picks up the restored data cleanly:"
echo "    docker compose restart api"
