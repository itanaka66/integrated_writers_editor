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
| Backend (`apps/api`) | Python 3.13 |
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
| 11434 | Ollama (only if using the local LLM backend; not started by Docker Compose) |

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

## Quick start

```bash
cp .env.example .env   # then edit ADMIN_PASSWORD (required) and Ollama URLs if needed
docker compose up --build
```

Open the web app at `http://localhost:3000` (log in with `admin` and your `ADMIN_PASSWORD`) and the API's interactive docs at `http://localhost:8000/docs`. See the [Installation Manual](docs/installation.md) for the full walkthrough, including running without Docker.

Prefer not to touch a terminal? Grab the **Windows (`.exe`)** or **macOS (`.pkg`)** desktop installer from the [Releases page](https://github.com/itanaka66/integrated_writers_editor/releases) — Docker Desktop is still required, but the installer handles everything else and gives you "Launch"/"Stop" shortcuts. See [installer/](installer/) and the Installation Manual's desktop-installer section for details.

For local Ollama:
```bash
ollama pull qwen3:8b        # manual AI-assist (write screen, chat)
ollama pull qwen3.8:27b     # auto-write Writer (default)
ollama pull qwen3:14b       # auto-write Controller (default)
ollama pull nomic-embed-text  # RAG embeddings
```

## Feature overview

- **Structured story data**: characters, world entities, plot, foreshadowing, and a timeline, each with full create/edit/delete, plus a glossary view (world entities tagged `glossary`). All of it feeds the AI's context on every generation and continuity check.
- **AI writing assistant**: continue/summarize/proofread the current episode, six quick "consistency check" prompts (timeline, character state, world, foreshadowing, plot, prose quality), and a free-form, per-project AI chat with persisted history — all backed by the same Context Builder.
- **Editor**: a lightweight Markdown toolbar (bold/italic/heading/quote) plus a rendered preview, revision history (last 20 versions per episode, with restore), and a live character count.
- **Continuity auditing**: an AI-driven audit that flags contradictions across timeline, character state, world setting, and foreshadowing, with severity and suggested fixes. Always review its findings — it's a first-pass check, not a source of truth.
- **Character-state tracking**: after saving an episode, the AI extracts what changed (status, location, emotion, health, goal, knowledge) and records it as history, separate from the character's own base profile.
- **Story Digital Twin** (`GET /api/v1/projects/{id}/story-twin`): one consolidated view of a project's health score, episode coverage, relationship graphs (character/world/timeline), recent character-state history, and open continuity issues. Surfaced in the app as the 分析 (Analytics) screen.
- **Semantic search (RAG)**: Qdrant-backed search over episode text, with an automatic PostgreSQL substring-match fallback if Qdrant is unreachable — the search screen tells you which one actually served the results. Optionally searches across all projects at once instead of just the current one.
- **Import from text files**: bring in an existing writers from a "なろう" (Shosetsuka ni Naro) bracket-format export — either a full writers export (creates a new project from its title/synopsis/genre plus all episodes) or a headerless draft-episodes file (adds/updates episodes in an existing project). Runs as a background job with progress, since it re-indexes and runs the same character-state extraction a normal save does for every imported episode, then one continuity audit at the end.
- **Plain-text search and replace-all**: find and bulk-replace a literal string across every episode in a project, with per-episode preview/selection before replacing and an automatic revision snapshot so any replace can be undone.
- **Local-disk mirror + GitHub auto-save**: every episode save also writes a Markdown copy to disk, and — if a git remote is configured — a background job auto-commits and pushes it on a timer, so episode text has a plain-file backup outside the database.
- **Desktop notifications for background jobs**: starting an auto-write or file-import job asks for browser notification permission, then fires a desktop notification the moment it finishes (completed/stopped/error) — no need to keep watching the progress bar, as long as the tab stays open.
- **Scheduled database backups**: an optional (opt-in) background job dumps PostgreSQL and snapshots Qdrant on a timer with automatic retention, alongside an on-demand "今すぐバックアップ" button and history view in Settings — see [Settings → Backup and restore](docs/user-guide.md#backup-and-restore).
- **Live-editable connection settings**: Qdrant and both Ollama endpoints (Writer/Controller) can be changed from the 設定 > 接続設定 screen and take effect immediately, no restart required. Every field (including the read-only database one) has a "接続テスト" button that tests the value currently typed in — not necessarily what's saved — before you commit to it.
- **Export**: download a project's episodes as plain text, Markdown, or a minimal EPUB3 file.
- **Auto-write**: generates episodes 1 through up to 500 with minimal supervision, using a four-level planning hierarchy (Series → 5×100-episode Arcs → 50×10-episode Mini Arcs → per-episode blueprints) owned by a separate "Controller" Ollama model, handed off to a "Writer" Ollama model for prose. The Controller also runs a pre-write and post-write quality gate (timeline/character/world/plot only) and can force a rewrite. Existing episodes are skipped by default; overwrite is opt-in. A continuity audit runs automatically every 5 episodes. Live progress (percentage, phase, per-level plan counts) is exposed via API and shown in the 自動執筆 screen. See [the Auto-write section of the User Guide](docs/user-guide.md#auto-write) for the full mechanics.
- **Deterministic planner-structure validation**: separately from the AI-generated plan content, `apps/api/app/planner/structure_validator.py` checks the *shape* the Series/Arc/Mini-Arc/Episode hierarchy is required to satisfy — exactly 5 arcs of exactly 100 episodes each, exactly 10 mini-arcs of exactly 10 episodes each, no gaps/overlaps/duplicates, full 1–500 coverage — independent of whatever the LLM actually generated.

## Architecture

| | |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0, Python 3.13, Alembic migrations |
| Frontend | Next.js 16 (App Router) + React 19, TypeScript |
| Database | PostgreSQL (story data) |
| Vector store | Qdrant (semantic search index) |
| LLM runtime | Ollama, run locally — two configurable model roles: Writer and Controller |
| Auth | Single shared HTTP Basic Auth account (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) — no per-user accounts, no OAuth |
| CI | GitHub Actions: ruff + pytest + Alembic migration round-trip (backend), eslint + Vitest + `next build` (frontend) |

Ollama calls (`generate`/`embed`) retry transient network failures up to 3 times with backoff before giving up. `scripts/backup.sh`/`scripts/restore.sh` handle PostgreSQL + Qdrant backup/restore for self-hosted deployments — see [the Backup and restore section of the User Guide](docs/user-guide.md#backup-and-restore).

## Known limitations

- Single shared password, no per-user accounts or permissions — see [User Guide → Login](docs/user-guide.md#login).
- The "AI設定" (AI settings) screen only sets this browser's default model names for the auto-write form; it does not change which Ollama servers the backend actually talks to (that's `OLLAMA_URL`/`CONTROLLER_OLLAMA_URL`, server-side only).
- The editor's Markdown toolbar/preview is not a rich-text editor — the stored content is always plain Markdown text.
- No usage/token-tracking dashboard yet.

Contributions and issue reports are welcome via this repository's issue tracker.
