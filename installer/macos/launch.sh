#!/bin/bash
# Starts (or restarts) INE and opens it in the default browser.
# Lives inside INE.app/Contents/Resources — resolves paths relative to itself
# so it works regardless of the app's install location.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

notify() {
  # osascript's display dialog blocks until dismissed, which is what we want
  # for anything the user must read before continuing (e.g. the generated
  # password) — unlike a fire-and-forget notification, this can't be missed.
  osascript -e "display dialog \"$1\" with title \"Integrated writers Editor (INE)\" buttons {\"OK\"} default button 1" >/dev/null 2>&1 || true
}

if ! command -v docker >/dev/null 2>&1; then
  notify "Docker Desktop が見つかりません。https://www.docker.com/products/docker-desktop/ からインストールしてから、もう一度起動してください。\n\nDocker Desktop was not found. Install it from https://www.docker.com/products/docker-desktop/ and try again."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  open -a Docker || true
  echo "Docker Desktop の起動を待っています... / Waiting for Docker Desktop to start..."
  deadline=$((SECONDS + 180))
  until docker info >/dev/null 2>&1 || [ "$SECONDS" -ge "$deadline" ]; do
    sleep 3
  done
  if ! docker info >/dev/null 2>&1; then
    notify "Docker Desktop の起動を確認できませんでした。Docker Desktopを手動で起動してから、もう一度お試しください。\n\nCould not confirm Docker Desktop started. Start it manually and try again."
    exit 1
  fi
fi

if [ ! -f .env ]; then
  cp .env.example .env
  password="$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 20)"
  # BSD sed (macOS) requires an explicit (here, empty) backup suffix for -i.
  sed -i '' "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=${password}/" .env
  notify "初回起動です。管理者パスワードを生成しました:\n\n${password}\n\nこのパスワードは $DIR/.env に保存されています。後で変更できます。\n\nFirst run: generated an admin password:\n\n${password}\n\nSaved to $DIR/.env — you can change it later."
fi

echo "INE を起動しています... / Starting INE..."
docker compose -f docker-compose.yml up -d

echo "起動を待っています... / Waiting for the app to come up..."
deadline=$((SECONDS + 180))
up=0
until [ "$SECONDS" -ge "$deadline" ]; do
  if curl -sf -o /dev/null "http://localhost:3000"; then up=1; break; fi
  sleep 2
done

open "http://localhost:3000"
if [ "$up" -eq 0 ]; then
  notify "起動処理は開始しましたが、まだ応答がありません。初回はイメージのダウンロードに時間がかかることがあります。数分後にブラウザを再読み込みしてください。\n\nStartup was triggered but the app isn't responding yet — the first run can take a while to pull images. Reload the browser tab in a few minutes."
fi
