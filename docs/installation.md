---
title: Installation Manual
layout: default
---

[← Manual home](index.md) | [日本語](installation.ja.md)

# Installation Manual

See [requirements.md](requirements.md) first to confirm your machine meets the prerequisites.

## 1. Install Ollama and pull the models

By default Ollama runs on the host, not in Docker — do this regardless of which option below you choose. (Option A also offers a bundled Ollama *container* instead, if you'd rather not install anything on the host — see the setup script section below. Skip this step entirely if you only plan to use a cloud AI provider — Claude/ChatGPT/Gemini — though semantic search still needs *some* Ollama instance for embeddings.)

1. Install Ollama from https://ollama.com.
2. Pull the models you plan to use:
   ```bash
   ollama pull qwen3:8b          # AI assist (write screen, chat, all AI tools)
   ollama pull nomic-embed-text  # RAG embeddings (semantic search)
   ```
3. Confirm it's listening: `curl http://localhost:11434/api/tags` should return JSON.

## 2. Option A — Docker Compose

### Easiest: the interactive setup script

New to Docker, or just want the fastest path on Windows, macOS, Linux, or a cloud VM? Clone the repo and run the setup script — it asks a few yes/no questions (use the bundled PostgreSQL/Qdrant or an external one, where Ollama lives, whether to generate an admin password) and starts the containers for you:

```bash
git clone <this repository's URL>
cd integrated_writers_editor
./scripts/setup.sh
```

On Windows, use the PowerShell equivalent instead (run from a regular PowerShell prompt — Run as Administrator is not required):

```powershell
git clone <this repository's URL>
cd integrated_writers_editor
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

Either script requires Docker (Desktop on Windows/macOS, Engine + Compose plugin on Linux) to already be installed and running — see [requirements.md](requirements.md). Skip to the manual steps below if you'd rather control every `.env` value yourself, or need something the script doesn't ask about.

### Manual steps

```bash
git clone <this repository's URL>
cd integrated_writers_editor
cp .env.example .env
```

Edit `.env` and set a real `ADMIN_PASSWORD` (Compose refuses to start without one — see [requirements.md](requirements.md) for what each variable does). If Ollama runs on a different machine, also change `OLLAMA_URL`.

**Configuring `CORS_ORIGINS`:** this controls which browser origins are allowed to call the API. It defaults to `*` (any origin), which is why the app works out of the box no matter what host/IP/domain you access it from — the API is already gated by its own Basic Auth login, so this isn't opening up anything that wasn't already behind a password. To restrict it instead, set a comma-separated list of the exact origins the web app is served from, e.g.:

```bash
CORS_ORIGINS=https://writer.example.com,http://192.168.1.10:3000
```

Each entry must be the *origin* the browser sends (scheme + host + port, no trailing slash, no path) — it must match whatever address you actually type into the browser to reach the web app, not the API's own address. If it doesn't, API calls fail and the login screen shows "APIに接続できませんでした" (a connection error, not a wrong-password error — see the Troubleshooting table below). After editing `.env`, recreate the `api` container to pick up the change: `docker compose up -d api` (no rebuild needed). You can also change this later from 設定 > 接続設定 in the app itself, without touching `.env` or restarting anything — see [user-guide.md](user-guide.md#connection-settings).

```bash
docker compose up --build
```

This builds and starts four containers: `db` (Postgres), `qdrant`, `api` (runs `alembic upgrade head` automatically before starting, then seeds one demo project on first launch), and `web`. (A fifth, `ollama`, is available but not started by default — see the setup script section above to include it, or `docker compose up ollama db qdrant api web` to add it to a plain `docker compose up`.) Wait for the logs to settle, then open:

- Web app: http://localhost:3000
- API interactive docs: http://localhost:8000/docs

Log in with the username `admin` and the `ADMIN_PASSWORD` you set.

To stop: `docker compose down`. To stop **and delete all data** (Postgres + Qdrant volumes): `docker compose down -v`.

**Optional — a real domain with HTTPS:** the setup above serves plain HTTP on custom ports (`:3000`/`:8000`), which is fine for local/LAN access or a trusted small team. For a public deployment on a real domain, put a reverse proxy such as [Caddy](https://caddyserver.com/) or [nginx](https://nginx.org/) in front of ports 3000 and 8000 yourself — this project doesn't bundle one. A proxy like Caddy issues and renews a TLS certificate automatically for a domain you own, letting you drop the `:3000`/`:8000` ports entirely and access everything over `https://your-domain`, without exposing the API's own port to the internet at all. Remember to update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the `https://` domain (or a same-origin relative path like `/api/v1` if your proxy routes `/api` to the API on the same domain) once you do — see the Troubleshooting table below if login then fails with a connection error.

**Optional — Cloudflare Tunnel instead of port forwarding:** if you don't want to open any inbound ports on your router at all (no `80`/`443`/`8000` forwarding, works even behind CGNAT), [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) can expose this app to the internet over an outbound-only tunnel, with Cloudflare handling TLS for you. Requires a domain added to a (free) Cloudflare account. Two ways to set it up — same result either way:

**Required `.env` settings for this setup** (regardless of dashboard vs. CLI below) — nothing else in `.env` needs to change:

| Variable | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-domain.example/api/v1` (or the same-origin relative `/api/v1` — see note below) | Baked into the web app's JavaScript at build time — this is *not* live-reloadable, so changing it needs `docker compose up -d --build web` (rebuild), not just a restart. |
| `CORS_ORIGINS` | `https://your-domain.example` | Env-only (can't be set from the Settings screen — see [requirements.md](requirements.md)); the API only accepts browser requests whose `Origin` header matches this. Apply with `docker compose up -d api` (no rebuild needed here, unlike the frontend). |

Everything else (`ADMIN_PASSWORD`, `OLLAMA_URL`, `DATABASE_URL`, etc.) is unaffected by adding a tunnel — those describe how the containers reach each other and the host, not how the browser reaches them.

Using the same-origin relative path (`NEXT_PUBLIC_API_URL=/api/v1`) instead of the full `https://` URL works too, *as long as* your tunnel's ingress rules route `/api/*` on that domain to the API (step 3 below does exactly that) — the browser then calls the API on the same origin it loaded the page from, which also means `CORS_ORIGINS` becomes less critical (same-origin requests aren't subject to CORS at all), though it's still worth setting correctly for the `/docs` Swagger UI and any direct API testing from a different origin.

**Dashboard (recommended — no CLI commands to create/route the tunnel):**

1. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/), go to **Networks → Tunnels** (older UIs: **Access → Tunnels**) and **Create a tunnel**. Choose the **Cloudflared** connector type — this is the only option; ignore the separate Workers/Pages "template" gallery elsewhere in the Cloudflare dashboard, which is for a different product and unrelated to this.
2. Name the tunnel. On the install step, pick **Docker** from the environment dropdown instead of a host OS — this gives you a ready-made `docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <your-token>` command with a token already filled in. Don't run it as-is; instead copy just the token and add this service to `docker-compose.yml` (or `docker-compose.release.yml`) alongside the existing `web`/`api` services, so the tunnel is managed by the same `docker compose` stack as everything else:
   ```yaml
   services:
     # ... existing web, api, db, qdrant services ...
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
       depends_on: [web, api]
   ```
   Put the token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN=...` rather than pasting it directly into the compose file, then start it with `docker compose up -d cloudflared`. This dashboard/token route needs no `~/.cloudflared/config.yml` on the host at all — the ingress rules from step 3 below live in Cloudflare's own dashboard instead.
3. On the **Public Hostname** tab, add two hostnames pointing at the same domain: one with **Path** `api/*` → service `http://api:8000` (the container name, since `cloudflared` reaches other services over the compose network, not `localhost`), and one with an empty path → service `http://web:3000`. Put the `api/*` rule above the catch-all one (Cloudflare evaluates them in order).
4. Apply the two `.env` settings from the table above (`docker compose up -d --build web` for `NEXT_PUBLIC_API_URL`, `docker compose up -d api` for `CORS_ORIGINS`).

**CLI / Docker (config-file-based, if you'd rather manage ingress rules in a file than in the dashboard):**

1. Authenticate a new tunnel from the Docker host once (this needs `cloudflared` installed locally just for this one step — a browser login, not something that runs long-term): `cloudflared tunnel login`, then `cloudflared tunnel create ine`, then `cloudflared tunnel route dns ine your-domain.example`. This writes credentials to `~/.cloudflared/<tunnel-id>.json` and prints the tunnel id.
2. Write the ingress config to `~/.cloudflared/config.yml` — this puts both `web` and `api` behind the one domain, the same way a reverse proxy would, without needing one. Since this file will be mounted into a container, use the container network's service names (`api`, `web`), not `localhost`:
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /etc/cloudflared/<tunnel-id>.json
   ingress:
     - hostname: your-domain.example
       path: ^/api/.*
       service: http://api:8000
     - hostname: your-domain.example
       service: http://web:3000
     - service: http_status:404
   ```
3. Run `cloudflared` itself as a container on the same compose network, instead of installing it on the host — add this service to `docker-compose.yml` (or `docker-compose.release.yml`) alongside the existing `web`/`api` services:
   ```yaml
   services:
     # ... existing web, api, db, qdrant services ...
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel --config /etc/cloudflared/config.yml run
       volumes:
         - ~/.cloudflared:/etc/cloudflared:ro
       depends_on: [web, api]
   ```
   Then `docker compose up -d cloudflared` starts it — no `80`/`443`/`8000` port mappings are needed on `web`/`api` at all once this is your only path in, since `cloudflared` reaches them over the compose network directly by service name.
4. Apply the two `.env` settings from the table above the same way as the dashboard steps.

Either the dashboard flow (token-based, credentials generated for you) or the CLI flow (config-file-based, more control over ingress rules) work equally well run as a container this way — pick whichever matches how you'd rather manage the tunnel's config. Either this or a self-hosted reverse proxy accomplish the same goal (one HTTPS domain, no exposed API port) — Cloudflare Tunnel avoids router configuration entirely at the cost of routing your traffic through Cloudflare; a self-hosted proxy keeps everything on your own infrastructure but needs `80`/`443` forwarded for certificate issuance.

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

Create `apps/api/.env` pointing at a running Postgres and Qdrant instance — the app reads it automatically on startup (no need to `export` anything or have your shell source it) — see [requirements.md](requirements.md) for the full list of variables; at minimum:

```bash
# apps/api/.env
DATABASE_URL=postgresql+psycopg2://writers:writers@localhost:5432/writers
QDRANT_URL=http://localhost:6333
ADMIN_PASSWORD=change-me
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

Accessing this dev server (`npm run dev`, not the production build) through anything other than `localhost` — a LAN IP, a reverse-proxied custom domain — makes Next.js log a warning and block its own dev-only assets (HMR/websocket; this is unrelated to `CORS_ORIGINS`/the API). Set `NEXT_DEV_ALLOWED_ORIGINS` before starting it to allow that host:

```bash
NEXT_DEV_ALLOWED_ORIGINS=https://your-dev-domain.example npm run dev
```

### Running Option B as a persistent Linux service (systemd)

For a native (non-Docker) deployment that survives reboots and restarts on crash, run the backend and frontend as `systemd` services instead of the dev commands above. Build the frontend for production first:

```bash
cd apps/web
npm install
npm run build
```

Create `/etc/systemd/system/ine-api.service`:

```ini
[Unit]
Description=Integrated Writers Editor - API
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/integrated_writers_editor/apps/api
Environment="PATH=/path/to/integrated_writers_editor/apps/api/.venv/bin"
ExecStart=/path/to/integrated_writers_editor/apps/api/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

And `/etc/systemd/system/ine-web.service`:

```ini
[Unit]
Description=Integrated Writers Editor - Web
After=network.target ine-api.service

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/integrated_writers_editor/apps/web
Environment="NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`NEXT_PUBLIC_API_URL` here is baked in at `npm run build` time (same caveat as the Docker image — see the CORS/domain note above), so rebuild if you change it. Then enable and start both:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ine-api.service ine-web.service
sudo systemctl status ine-api.service ine-web.service
journalctl -u ine-api.service -f   # tail logs
```

For a public domain, put nginx in front (same idea as the Docker Compose reverse-proxy note above — see [requirements.md](requirements.md) for the full port list):

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Then get a free TLS certificate with [Certbot](https://certbot.eff.org/):

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

## 4. First login

On first startup, one admin account is created automatically from `.env`'s `ADMIN_USERNAME` (default `admin`) and `ADMIN_PASSWORD`. Log in with username `admin` and whatever `ADMIN_PASSWORD` you configured. Additional accounts can be added afterward by an admin from Settings > User Management.

The Google/GitHub buttons on the login screen only become active if you've configured OAuth2 in `.env` (`GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID` etc. — see the comments in `.env.example` for what's needed and how to register with each provider). Leave them unset and the buttons stay disabled; the admin-password login above still works either way.

## 5. Verifying the install

- `GET http://localhost:8000/api/v1/health` should return `{"status":"ok",...}` — this endpoint does not require login.
- The demo project ("恐竜時代文明開拓記 DEMO") should appear on the dashboard after logging in for the first time against a fresh database.
- Backend tests: `cd apps/api && pytest -q` (52 tests as of this writing).
- Frontend build/lint: `cd apps/web && npm run lint && npm run build`.

## Resetting the database (delete everything and start fresh)

⚠️ **This cannot be undone.** Every project, episode, and user account in the database is
deleted. Back up first with `scripts/backup.sh` or `pg_dump` if you need to keep anything.

The schema is owned by [Alembic](https://alembic.sqlalchemy.org/), and migrations already
run automatically whenever the `api` container starts (see [MIGRATION.md](../MIGRATION.md)
for details). To rebuild the database from an empty state:

1. Empty the schema (this doesn't drop the database itself, just everything in it):

   ```bash
   docker compose -f docker-compose.release.yml run --rm api python -c "
   from sqlalchemy import create_engine, text
   from app.config import settings
   e = create_engine(settings.database_url)
   with e.begin() as c:
       c.execute(text('DROP SCHEMA public CASCADE'))
       c.execute(text('CREATE SCHEMA public'))
   print('schema reset')
   "
   ```
2. Run migrations from scratch to recreate every table:

   ```bash
   docker compose -f docker-compose.release.yml run --rm api alembic upgrade head
   ```
3. Start normally — the admin account (from `.env`'s `ADMIN_USERNAME`/`ADMIN_PASSWORD`) and
   the demo project are recreated automatically on startup:

   ```bash
   docker compose -f docker-compose.release.yml up -d api
   ```

This works the same way against an external/remote PostgreSQL instance — it resets whatever
schema `DATABASE_URL` points at, not a `docker compose`-managed `db` container specifically.
If you're running from source, swap `docker-compose.release.yml` for `docker-compose.yml`
above.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `docker compose up` fails immediately with an `ADMIN_PASSWORD` error | You didn't create `.env` from `.env.example`, or left `ADMIN_PASSWORD` unset |
| Dashboard stuck on "確認中..." / "起動中..." forever | The API isn't reachable at `NEXT_PUBLIC_API_URL`, or you're not logged in — check the browser's network tab for 401s vs connection errors |
| AI requests immediately fail with a connection message | Ollama isn't running, or `OLLAMA_URL` doesn't point at it (`http://host.docker.internal:11434` only resolves from inside Docker on Windows/macOS; on Linux use the host's LAN IP or run Ollama in the same Compose network) |
| `relation "projects" already exists` on `api` container startup | You have an old Postgres volume created before this project adopted Alembic migrations. Run `docker compose down -v` to reset it (**destroys all data**) or manually `alembic stamp head` against that database if you need to keep it |
| Search always falls back to "全文一致 (PostgreSQL フォールバック)" | Qdrant isn't reachable at `QDRANT_URL` — semantic search silently degrades to a plain `ILIKE` match instead of failing |
