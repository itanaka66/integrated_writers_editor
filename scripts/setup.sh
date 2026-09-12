#!/usr/bin/env bash
# Interactive first-time setup for IWE's Docker Compose install.
# Works on Linux, macOS, and any cloud VM with bash + Docker — asks a few
# yes/no questions, writes .env, and starts the containers you chose.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ask_yn() {
  # ask_yn "question" default(y|n)
  local prompt="$1" default="$2" reply
  local suffix="[y/N]"
  [ "$default" = "y" ] && suffix="[Y/n]"
  read -r -p "$prompt $suffix " reply || true
  reply="${reply:-$default}"
  case "$reply" in
    y|Y|yes|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker was not found on PATH. Install Docker Desktop (Windows/macOS) or Docker Engine (Linux) first: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "'docker compose' (Compose v2 plugin) was not found. It ships with current Docker Desktop; on Linux install the 'docker-compose-plugin' package." >&2
  exit 1
fi

bold "== Integrated Writers Editor — setup =="
echo "This will create a .env file and start the app with Docker Compose."
echo

COMPOSE_FILE="docker-compose.release.yml"
if ask_yn "Build the app from source instead of using prebuilt images? (slower, only needed if you're modifying the code)" n; then
  COMPOSE_FILE="docker-compose.yml"
fi
echo "Using $COMPOSE_FILE"
echo

if [ -f .env ]; then
  echo ".env already exists — leaving it as-is. Delete it first if you want to redo setup from scratch."
  echo "Starting the full stack (db + qdrant + api + web) using the existing .env."
  exec docker compose -f "$COMPOSE_FILE" up --build db qdrant api web
fi

cp .env.example .env

SERVICES="web api"
NO_DEPS=""

echo "-- Database --"
if ask_yn "Run PostgreSQL in Docker for you? (recommended unless you already have one)" y; then
  SERVICES="db $SERVICES"
else
  read -r -p "Enter the DATABASE_URL of your existing PostgreSQL (e.g. postgresql+psycopg2://user:pass@host:5432/dbname): " ext_db
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=$ext_db|" .env && rm -f .env.bak
  NO_DEPS="--no-deps"
fi
echo

echo "-- Vector search (Qdrant) --"
if ask_yn "Run Qdrant in Docker for you? (recommended unless you already have one)" y; then
  SERVICES="qdrant $SERVICES"
else
  read -r -p "Enter the QDRANT_URL of your existing Qdrant (e.g. http://host:6333): " ext_qdrant
  sed -i.bak "s|^QDRANT_URL=.*|QDRANT_URL=$ext_qdrant|" .env && rm -f .env.bak
  NO_DEPS="--no-deps"
fi
echo

echo "-- AI backend (Ollama) --"
echo "Ollama always runs on the host, not in Docker — Compose never starts it."
if ask_yn "Will you use a local Ollama running on this machine?" y; then
  : # keep .env.example's default OLLAMA_URL (http://host.docker.internal:11434)
elif ask_yn "Will you use Ollama running on a different machine?" n; then
  read -r -p "Enter its URL (e.g. http://192.168.1.10:11434): " ollama_url
  sed -i.bak "s|^OLLAMA_URL=.*|OLLAMA_URL=$ollama_url|" .env && rm -f .env.bak
else
  echo "OK — configure a cloud AI provider (Claude/ChatGPT/Gemini) from 設定 > 接続設定 after logging in."
  echo "Note: semantic search embeddings still need an Ollama instance reachable at OLLAMA_URL; local text search works even without one."
fi
echo

echo "-- Admin login --"
if ask_yn "Generate a random ADMIN_PASSWORD for you?" y; then
  if command -v openssl >/dev/null 2>&1; then
    pw="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9')"
  else
    pw="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  fi
  sed -i.bak "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$pw|" .env && rm -f .env.bak
  bold "Generated ADMIN_PASSWORD: $pw"
  echo "(also saved in .env — write it down, you'll need it to log in)"
else
  read -r -s -p "Enter the ADMIN_PASSWORD to use: " pw
  echo
  sed -i.bak "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$pw|" .env && rm -f .env.bak
fi
echo

bold "Starting: $SERVICES"
docker compose -f "$COMPOSE_FILE" up --build $NO_DEPS $SERVICES
