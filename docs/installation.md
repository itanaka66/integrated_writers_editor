---
title: Installation Manual
layout: default
---

[← Manual home](index.md) | [日本語](installation.ja.md)

# Installation Manual

See [requirements.md](requirements.md) first to confirm your machine meets the prerequisites.

## 1. Install Ollama and pull the models

Ollama always runs on the host (Docker Compose does not start it), so do this regardless of which option below you choose.

1. Install Ollama from https://ollama.com.
2. Pull the models you plan to use:
   ```bash
   ollama pull qwen3:8b
   ollama pull qwen3.8:27b
   ollama pull qwen3:14b
   ollama pull nomic-embed-text
   ```
   `qwen3.8:27b` and `qwen3:14b` are large; skip them if you only want the write-screen AI assist (`qwen3:8b`) and don't plan to use the 500-episode auto-write feature yet.
3. Confirm it's listening: `curl http://localhost:11434/api/tags` should return JSON.

## 2. Option A — Docker Compose

```bash
git clone <this repository's URL>
cd integrated_writers_editor
cp .env.example .env
```

Edit `.env` and set a real `ADMIN_PASSWORD` (Compose refuses to start without one — see [requirements.md](requirements.md) for what each variable does). If Ollama runs on a different machine, also change `OLLAMA_URL` / `CONTROLLER_OLLAMA_URL`.

```bash
docker compose up --build
```

This builds and starts four containers: `db` (Postgres), `qdrant`, `api` (runs `alembic upgrade head` automatically before starting, then seeds one demo project on first launch), and `web`. Wait for the logs to settle, then open:

- Web app: http://localhost:3000
- API interactive docs: http://localhost:8000/docs

Log in with the username `admin` and the `ADMIN_PASSWORD` you set.

To stop: `docker compose down`. To stop **and delete all data** (Postgres + Qdrant volumes): `docker compose down -v`.

## 2b. Option A2 — Desktop installer (Windows / macOS)

For a machine that shouldn't need `git clone` or a terminal, download the installer from the [Releases page](https://github.com/itanaka66/integrated_writers_editor/releases):

- **Windows**: run `INE-Setup-<version>.exe`. It's unsigned (no code-signing certificate), so SmartScreen will warn — choose "More info" → "Run anyway". Installs to `%LOCALAPPDATA%\INE` (or `Program Files` if you choose "for all users") with Start Menu / desktop shortcuts "INEを起動" and "INEを停止".
- **macOS**: open `INE-Setup-<version>.pkg` and follow the installer. It's unsigned/unnotarized — Gatekeeper will block the first open; right-click the `.pkg` → "Open" to bypass it once. Installs `INEを起動.app` / `INEを停止.app` to `/Applications`.

Either way, [Docker Desktop](https://www.docker.com/products/docker-desktop/) is still a separate prerequisite — install it first. The launcher shortcut checks for Docker, starts it if it's not already running, brings up the same four containers as Option A (pulling prebuilt images from GHCR instead of building them locally, so there's no build step), and opens http://localhost:3000. First launch generates a random `ADMIN_PASSWORD` into an `.env` file next to the installed files and shows it once in a dialog — write it down. Ollama is **not** installed by this installer; do step 1 above regardless of which option you use.

This installer path is a thin convenience layer over Option A, not a different deployment: it writes the same `docker-compose.yml`/`.env` shape into the install folder and drives `docker compose` under the hood, so anything in this manual or in [requirements.md](requirements.md) about environment variables, ports, or troubleshooting still applies verbatim — the settings screen's [connection settings](user-guide.md#connection-settings) work exactly the same way.

## 3. Option B — Running natively

### Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt   # or requirements.txt if you don't need the test suite
```

Set environment variables (or create a `.env` your shell sources) pointing at a running Postgres and Qdrant instance — see [requirements.md](requirements.md) for the full list; at minimum:

```bash
export DATABASE_URL=postgresql+psycopg2://writers:writers@localhost:5432/writers
export QDRANT_URL=http://localhost:6333
export ADMIN_PASSWORD=change-me
```

Run migrations, then start the server:

```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd apps/web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env.local
npm run dev
```

Open http://localhost:3000.

## 4. First login

There is a single shared admin account, not per-user accounts — see [requirements.md](requirements.md) and the [user guide](user-guide.md#login) for why. Log in with username `admin` and whatever `ADMIN_PASSWORD` you configured. The Google/GitHub buttons on the login screen are intentionally disabled; there is no OAuth support.

## 5. Verifying the install

- `GET http://localhost:8000/api/v1/health` should return `{"status":"ok",...}` — this endpoint does not require login.
- The demo project ("恐竜時代文明開拓記 DEMO") should appear on the dashboard after logging in for the first time against a fresh database.
- Backend tests: `cd apps/api && pytest -q` (52 tests as of this writing).
- Frontend build/lint: `cd apps/web && npm run lint && npm run build`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `docker compose up` fails immediately with an `ADMIN_PASSWORD` error | You didn't create `.env` from `.env.example`, or left `ADMIN_PASSWORD` unset |
| Dashboard stuck on "確認中..." / "起動中..." forever | The API isn't reachable at `NEXT_PUBLIC_API_URL`, or you're not logged in — check the browser's network tab for 401s vs connection errors |
| Auto-write jobs immediately go to `error` with a connection message | Ollama isn't running, or `OLLAMA_URL`/`CONTROLLER_OLLAMA_URL` don't point at it (`http://host.docker.internal:11434` only resolves from inside Docker on Windows/macOS; on Linux use the host's LAN IP or run Ollama in the same Compose network) |
| `relation "projects" already exists` on `api` container startup | You have an old Postgres volume created before this project adopted Alembic migrations. Run `docker compose down -v` to reset it (**destroys all data**) or manually `alembic stamp head` against that database if you need to keep it |
| Search always falls back to "全文一致 (PostgreSQL フォールバック)" | Qdrant isn't reachable at `QDRANT_URL` — semantic search silently degrades to a plain `ILIKE` match instead of failing |
