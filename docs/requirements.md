---
title: Software Requirements
layout: default
---

[← Manual home](index.md) | [日本語](requirements.ja.md)

# Software Requirements

## Option A — Docker (recommended)

| Requirement | Version | Notes |
|---|---|---|
| Docker Engine | 24+ | Includes the Docker Compose v2 plugin (`docker compose`, not the old `docker-compose`) |
| Disk space | 10 GB+ free | Postgres/Qdrant volumes + built images |
| RAM | 8 GB+ | 16 GB+ recommended if you also run Ollama on the same machine |

Docker Desktop (Windows/macOS) or Docker Engine + the Compose plugin (Linux) both work.

## Option B — Running services natively (no Docker)

| Component | Requirement |
|---|---|
| Backend (`apps/api`) | Python 3.13 |
| Frontend (`apps/web`) | Node.js 22, npm |
| Database | PostgreSQL 17 (a newer 15/16 will likely work too, but 17 is what's tested) |
| Vector store | Qdrant (any recent version; used via its HTTP API) |
| Local LLM runtime | [Ollama](https://ollama.com) |

Native installs still need Ollama and (if you want vector search) Qdrant — Docker only replaces Postgres/Qdrant/the app containers, not the LLM runtime, which almost always runs on the host to use its GPU.

## AI provider and models

| Setting | Config | Default | Purpose |
|---|---|---|---|
| Provider | `ai_provider` (runtime setting, not an env var) | `ollama` | Selects which LLM backend serves `/ai/generate` and `/ai/generate/stream`: `ollama`, `anthropic`, `openai`, or `google` |
| Ollama | `OLLAMA_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `qwen3.8:27b` | Local Ollama server and model, used when the provider is `ollama` |
| Anthropic Claude | runtime setting (API key + model) | model `claude-sonnet-4-5` | Used when the provider is `anthropic` |
| OpenAI | runtime setting (API key + model) | model `gpt-4o-mini` | Used when the provider is `openai` |
| Google Gemini | runtime setting (API key + model) | model `gemini-2.0-flash` | Used when the provider is `google` |
| Embeddings | `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | RAG semantic search indexing — always served by Ollama regardless of the chosen AI provider |

The active provider, its API key, and model name are stored as runtime settings and can be changed — with a "接続テスト" (test connection) button — from the app's 設定 > 接続設定 screen, with no restart required; see the [User Guide](user-guide.md#connection-settings). The Ollama server URL/model can also be set via the `OLLAMA_URL`/`OLLAMA_MODEL` env vars for the initial deployment.

## Local-disk / GitHub episode storage

| Config | Default | Purpose |
|---|---|---|
| `writers_STORAGE_DIR` | `./writers_storage` | Where episode text is mirrored to disk as Markdown, one file per episode, on every save |
| `GIT_REMOTE_URL` | *(unset)* | A git remote URL with your token embedded (e.g. `https://<token>@github.com/<you>/<repo>.git`); when set, the mirror is auto-committed and pushed on a timer. Unset = disk mirror only, no GitHub sync |
| `GIT_AUTOSYNC_INTERVAL_SECONDS` | `300` | How often the auto-commit/push loop runs |

## Scheduled backups

| Config | Default | Purpose |
|---|---|---|
| `BACKUP_ENABLED` | `false` | Turns on the scheduled PostgreSQL + Qdrant backup loop. Off by default; a manual backup ("今すぐバックアップ" in Settings, or `scripts/backup.sh`) works either way |
| `BACKUP_DIR` | `./backups` | Where timestamped backup folders are written (a container volume in the Docker Compose / desktop-installer setups) |
| `BACKUP_INTERVAL_SECONDS` | `86400` | How often a scheduled backup runs (default: daily) |
| `BACKUP_RETENTION_COUNT` | `7` | How many of the most recent backups to keep; older ones are deleted automatically after each run |

Restoring is a manual, command-line-only step (`scripts/restore.sh`) — see [User Guide](user-guide.md#backup-and-restore) for why.

## Ports used

| Port | Service |
|---|---|
| 3000 | Web frontend |
| 8000 | API (also serves `/docs` — interactive OpenAPI UI) |
| 5432 | PostgreSQL |
| 6333 / 6334 | Qdrant (HTTP / gRPC) |
| 11434 | Ollama (not started by Docker Compose — runs on the host) |

## Browser

Any current Chrome, Edge, Firefox, or Safari. No IE/legacy-Edge support.
