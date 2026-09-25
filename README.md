# Integrated Writers Editor (IWE)

日本語版はこちら → [README.ja.md](README.ja.md)

An AI-assisted article/writing editor. Runs entirely on your own machine/server; the AI backend is your choice — a local [Ollama](https://ollama.com) LLM (no data leaves your machine) or a cloud provider (Claude / ChatGPT / Gemini) via your own API key, switchable anytime from 設定 > 接続設定.

## Software & Hardware Requirements

### Option A — Docker (recommended)

| Requirement | Version / Spec | Notes |
|---|---|---|
| Docker Engine | 24+ | Includes the Compose v2 plugin (`docker compose`, not the old `docker-compose`) |
| Disk space | 5 GB+ free | PostgreSQL/Qdrant volumes + built images |
| RAM | 4 GB+ | 8 GB+ recommended if you also run a local Ollama model on the same machine |
| Internet access | Only if using a cloud AI provider | Not required if using local Ollama only |

Docker Desktop (Windows/macOS) or Docker Engine + the Compose plugin (Linux) both work.

### Option B — Running services natively (no Docker)

| Component | Requirement |
|---|---|
| Backend (`apps/api`) | Python 3.13, Git (`pip install` fetches the `editor-common` dependency directly from GitHub) |
| Frontend (`apps/web`) | Node.js 22, npm |
| Database | PostgreSQL 17 |
| Vector store | Qdrant (any recent version — used for semantic search) |

### AI backend (pick one, changeable anytime from 設定 > 接続設定)

| Backend | Requirement |
|---|---|
| Local LLM (Ollama, default) | [Ollama](https://ollama.com) installed on your machine/server; a GPU with enough VRAM for your chosen model is strongly recommended; no internet or API key required |
| Claude (Anthropic) | An Anthropic API key + internet access |
| ChatGPT (OpenAI) | An OpenAI API key + internet access |
| Gemini (Google) | A Google AI API key + internet access |

RAG semantic search embeddings always use a local Ollama embedding model (`nomic-embed-text` by default), regardless of which AI backend you pick for generation.

### Ports used

| Port | Service |
|---|---|
| 3000 | Web frontend |
| 8000 | API (also serves `/docs` — interactive OpenAPI UI) |
| 5432 | PostgreSQL |
| 6333 / 6334 | Qdrant (HTTP / gRPC) |
| 11434 | Ollama (only if using the local LLM backend; runs on the host by default, or optionally as a bundled container) |

### Browser

Any current Chrome, Edge, Firefox, or Safari.

## Documentation

Browse the online manual: **https://itanaka66.github.io/integrated_writers_editor/** — or read the same files directly in [`docs/`](docs/):

| | English | 日本語 |
|---|---|---|
| Software requirements | [docs/requirements.md](docs/requirements.md) | [docs/requirements.ja.md](docs/requirements.ja.md) |
| Installation manual | [docs/installation.md](docs/installation.md) | [docs/installation.ja.md](docs/installation.ja.md) |
| Beginner's guide | [docs/getting-started.md](docs/getting-started.md) | [docs/getting-started.ja.md](docs/getting-started.ja.md) |
| User guide (operation manual) | [docs/user-guide.md](docs/user-guide.md) | [docs/user-guide.ja.md](docs/user-guide.ja.md) |

The full API reference is interactive Swagger UI at `http://localhost:8000/docs` on a running server (or raw JSON at `/openapi.json`). A static, committed copy for offline reading or diffing is at [docs/openapi.json](docs/openapi.json) — regenerate it after changing any endpoint with `cd apps/api && python scripts/export_openapi.py`.

Database schema changes (adding/removing columns or tables) go through Alembic — see [MIGRATION.md](MIGRATION.md) for how to run and write migrations.

## Quick start

New to Docker, or just want the fastest path? Clone the repo and run the interactive setup script — it works the same way on Windows, macOS, Linux, and cloud VMs, asks a few yes/no questions, and starts everything for you:

```bash
./scripts/setup.sh          # Windows: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

Prefer to configure everything by hand?

```bash
cp .env.example .env   # then edit ADMIN_PASSWORD (required) and Ollama URLs if needed
docker compose up --build
```

Open the web app at `http://localhost:3000` (log in with `admin` and your `ADMIN_PASSWORD`) and the API's interactive docs at `http://localhost:8000/docs`. See the [Installation Manual](docs/installation.md) for the full walkthrough, including running without Docker.

Prefer not to touch a terminal? Grab the **Windows (`.exe`)** or **macOS (`.pkg`)** desktop installer from the [Releases page](https://github.com/itanaka66/integrated_writers_editor/releases) — Docker Desktop is still required, but the installer handles everything else and gives you "Launch"/"Stop" shortcuts. See [installer/](installer/) and the Installation Manual's desktop-installer section for details.

For local Ollama:
```bash
ollama pull qwen3:8b          # AI-assist (write screen, chat, all AI tools)
ollama pull nomic-embed-text  # RAG embeddings
```

## Feature overview

- **Projects and episodes**: organize articles into projects, each with its own episodes (drafts), full create/edit/delete, revision history (with restore), and a live character count.
- **AI tool picker**: idea generation, article structuring, SEO keyword suggestions, headline/title improvement, fact-checking, multi-format conversion, reader-target analysis, and catchphrase generation — all launched from the write screen and backed by a single `/ai/generate` endpoint, plus a free-form per-project AI chat with persisted history.
- **Streaming AI generation**: `POST /api/v1/ai/generate/stream` streams model output token-by-token instead of waiting for the full response.
- **Multi-LLM provider support**: switch between Ollama (local), Anthropic Claude, OpenAI, or Google Gemini from 設定 > 接続設定, with no restart required; embeddings for semantic search always run through Ollama.
- **AI usage and cost tracking**: every generation is logged (provider, model, input/output tokens, estimated cost) and summarized in Settings → 使用状況, via `GET /api/v1/ai-usage/summary` and `/ai-usage/recent`.
- **Memos and sources**: keep freeform notes (memos) and reference material (sources) attached to a project, with a summarizer tool for source material.
- **Templates**: reusable content templates, managed per project.
- **Semantic search (RAG)**: Qdrant-backed search over episode text, with an automatic PostgreSQL substring-match fallback if Qdrant is unreachable — the search screen tells you which one actually served the results. Optionally searches across all projects at once instead of just the current one.
- **Plain-text search and replace-all**: find and bulk-replace a literal string across every episode *and memo* in a project, with per-episode preview/selection before replacing and an automatic revision snapshot so any replace can be undone.
- **Import from text files**: bulk-import episodes from existing text/writer-format exports, running as a background job with progress.
- **Scheduled database backups**: an optional (opt-in) background job dumps PostgreSQL and snapshots Qdrant on a timer with automatic retention, alongside an on-demand "今すぐバックアップ" button and history view in Settings — see [Settings → Backup and restore](docs/user-guide.md#backup-and-restore).
- **Export**: download a project's episodes as plain text, Markdown, or a minimal EPUB3 file.

## Architecture

| | |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0, Python 3.13, Alembic migrations |
| Frontend | Next.js 16 (App Router) + React 19, TypeScript |
| Database | PostgreSQL (projects, episodes, memos, sources, templates, usage logs) |
| Vector store | Qdrant (semantic search index) |
| AI providers | Ollama (local, default), Anthropic Claude, OpenAI, or Google Gemini — selectable per deployment, switchable live from Settings; embeddings always via Ollama |
| Auth | Single shared HTTP Basic Auth account (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) — no per-user accounts, no OAuth |
| CI | GitHub Actions: ruff + pytest + Alembic migration round-trip (backend), eslint + Vitest + `next build` (frontend) |

Ollama calls (`generate`/`embed`) retry transient network failures up to 3 times with backoff before giving up. `scripts/backup.sh`/`scripts/restore.sh` handle PostgreSQL + Qdrant backup/restore for self-hosted deployments — see [the Backup and restore section of the User Guide](docs/user-guide.md#backup-and-restore).

## Known limitations

- Single shared password, no per-user accounts or permissions — see [User Guide → Login](docs/user-guide.md#login).
- The editor's Markdown toolbar/preview is not a rich-text editor — the stored content is always plain Markdown text.
- Cloud provider API keys (Anthropic/OpenAI/Google) are only configurable at runtime via the Settings UI, not via `.env`/Docker Compose env vars.

Contributions and issue reports are welcome via this repository's issue tracker.

## License

Copyright © 2026 agNedia Inc. (株式会社エージーネディア). Licensed under the [GNU General Public License v3.0](LICENSE).
