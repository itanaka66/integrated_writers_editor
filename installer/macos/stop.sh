#!/bin/bash
# Stops INE (containers only — no data is deleted).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
docker compose -f docker-compose.yml down
osascript -e 'display dialog "INE を停止しました。データは保持されています。\n\nINE has been stopped. Your data is preserved." with title "Integrated writers Editor (INE)" buttons {"OK"} default button 1' >/dev/null 2>&1 || true
