# Integrated Writers Editor (IWE)

日本語版はこちら → [README.ja.md](README.ja.md)

An AI-assisted article editor: organize projects and episodes, get AI help with ideas, structuring, SEO, headlines, fact-checking, and catchphrases, and keep reference material (memos, sources) alongside your drafts. Works with a local [Ollama](https://ollama.com) LLM or a cloud provider (Anthropic Claude, OpenAI, or Google Gemini) — pick whichever fits your setup.

## Documentation

Browse the online manual: **https://itanaka66.github.io/integrated_writers_editor/** — or read the same files directly in [`docs/`](docs/):

| | English | 日本語 |
|---|---|---|
| Software requirements | [docs/requirements.md](docs/requirements.md) | [docs/requirements.ja.md](docs/requirements.ja.md) |
| Installation manual | [docs/installation.md](docs/installation.md) | [docs/installation.ja.md](docs/installation.ja.md) |
| Beginner's guide | [docs/getting-started.md](docs/getting-started.md) | [docs/getting-started.ja.md](docs/getting-started.ja.md) |
| User guide (operation manual) | [docs/user-guide.md](docs/user-guide.md) | [docs/user-guide.ja.md](docs/user-guide.ja.md) |

## Quick start

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
