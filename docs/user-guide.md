---
title: User Guide
layout: default
---

[← Manual home](index.md) | [日本語](user-guide.ja.md)

# User Guide (Operation Manual)

A screen-by-screen reference. For setup, see the [Installation Manual](installation.md); for a gentler first walkthrough, see the [Beginner's Guide](getting-started.md).

## Login

One shared account, configured via the `ADMIN_USERNAME` (default `admin`) / `ADMIN_PASSWORD` environment variables — not per-user accounts. There is no session or token: the browser resends this username/password as HTTP Basic Auth on every request, stored in this browser's `localStorage`. Logging out isn't a feature as such; clearing the browser's site data (or getting a 401, e.g. from a wrong password) drops you back to the login screen.

The "Googleでログイン" / "GitHubでログイン" buttons are visible but disabled — there's no OAuth integration. Don't wait for them to work.

## Dashboard

Lists all projects as cards, each showing genre and article count. The panel on the right shows detailed stats — episode count, open continuity issues, and an overall health score — for your most recently created project. Click a card to open that project. "＋ 新規作品作成" opens the new-project form.

*The "AI利用状況" (AI usage) stat mentioned in early design sketches is not implemented — nothing tracks token/request usage yet.*

## Creating a project

Fields: name (required), genre, synopsis (あらすじ), free-text "rules" (詳細設定 — anything you want the AI to always respect: tone, audience, hard constraints). All of these map directly to a `Project` record and can be edited later from Settings.

## Project Home

The landing screen after opening a project: header with name/genre/synopsis and progress, a 3×3 icon grid to every other screen, and a "最近の更新" (recent activity) list of the 5 highest-numbered episodes.

## Importing from a text file

Two ways in, both from a plain `.txt` file in the "なろう" (Shosetsuka ni Naro) bracket-section export format:

- **Dashboard → "ファイルからインポート"**: creates a brand-new project from a full writers export — a metadata header (title/synopsis/genre) followed by episodes delimited by `------- エピソードN開始 -------` separators. The parsed title/synopsis/genre become the new project's fields, and every episode is created.
- **Settings → "インポート" tab, inside an existing project**: adds or updates episodes in *that* project from either the same full-export format or a headerless draft-episodes file (episodes delimited by `-------第N話「タイトル」-------`, title embedded in the separator itself). An episode number that already exists gets its content overwritten (the prior content is snapshotted to that episode's revision history first, same as any other edit); a new number is created.

Both run as a background job you can watch progress on (`GET /api/v1/import-jobs/{id}`, polled every 2 seconds) rather than a single blocking request, because importing tens of episodes then triggers real AI work for each one: RAG re-indexing, then the same character-state extraction a normal save does, and — once every episode is in — one whole-project continuity audit. A large import can take several minutes; the progress bar shows episodes processed / total, and you can close the dialog without cancelling the job (Dashboard's importer; the Settings tab's importer keeps polling as long as you stay on the tab). Starting an import also asks for [desktop notification permission](#auto-write-自動執筆), and fires one when the job finishes — same caveat as auto-write: only while the tab stays open, since it's a plain browser notification, not a push one.

The parser auto-detects which of the two formats a file is — you don't pick a mode. A file matching neither (no recognizable episode separators) is rejected up front with a 400, before any job is created.

## Write

The core writing screen, three columns:

- **Left**: the episode list for this project, plus "＋ 新規エピソード" to add the next one (numbered automatically).
- **Center**: title, one-line summary, and the main body textarea for the selected episode. "保存＋人物状態更新" saves the episode, re-indexes it for semantic search, and asks the AI to extract character-state changes from the new text — if either of those background steps fails (e.g. Ollama or Qdrant is down), a warning banner appears above the editor instead of failing silently.
- **Right ("AI EDITOR-IN-CHIEF")**: a Context Builder–backed assistant. "⚠ 連続性を監査" runs a continuity audit against everything registered for the project. The four main actions (続きを書く / 次の展開 / 要約 / 校正) and the six "QUICK CUSTOM CHECKS" buttons all send a prompt to the AI along with the current story context; the result appears in the AI RESULT box, and "＋ 本文に追加" appends it to the episode body.
- **Editor toolbar**: B / I / H / ❝ buttons wrap the current selection (or insert at the cursor) with Markdown syntax (`**bold**`, `*italic*`, `## heading`, `> quote`) rather than applying real rich-text formatting — the stored content is still plain Markdown text. "プレビュー" renders that Markdown to HTML so you can check how it reads; "編集に戻る" switches back to the raw textarea. "📋 Wordにコピー" copies the body's Markdown to the clipboard as HTML (with a plain-text fallback), so pasting into Word or another rich-text app renders bold/headings/etc. as real formatting instead of literal `**`/`##` characters. A live character count (whitespace excluded) is shown next to the toolbar.
- **🕘 履歴 (revision history)**: every time you save different content than what was there before, the previous version is snapshotted (kept up to 20 per episode). This button lists them with a "この版に復元" (restore) action — restoring itself snapshots the version you're leaving, so restoring is itself undoable.

## Plot / Characters / World / Timeline / Foreshadowing / Glossary

These six screens share one underlying list-and-form UI (create, edit, delete), differing only in their fields:

| Screen | Fields |
|---|---|
| プロット (Plot) | title, type, status, start/end episode, objective, conflict, resolution |
| キャラクター (Characters) | name, role, personality, speech style, goal, status (alive/dead/missing/unknown), notes |
| 世界観 (World) | name, type, description, rules, location, era |
| 年表 (Timeline) | episode number, title, in-world time, description |
| 伏線 (Foreshadowing) | title, description, setup/payoff episode, status (open/resolved/abandoned) |
| 用語集 (Glossary) | term (name), description, category (location field) |

**用語集 (Glossary) is not a separate data type** — it's stored as a World entity with `entity_type: "glossary"`, filtered client-side. The 世界観 screen only shows entities that are *not* tagged as glossary, so the two lists never overlap. This keeps the backend simpler at the cost of a slightly indirect implementation; if you ever query the API directly (`GET /api/v1/projects/{id}/world`), glossary terms are mixed in there too.

Everything you register here is fed into the AI's context for every generation and continuity check — this is the mechanism the app uses to keep long-running stories consistent.

## Analytics (分析)

A tabbed dashboard built on the "Story Digital Twin" (`GET /api/v1/projects/{id}/story-twin`):

- **概要 (Overview)**: episode/character/world/plot/foreshadowing counts, a health score, prose coverage (% of episodes with non-empty content), active plots, and open foreshadowing.
- **人物関係図 / 世界観グラフ / 時系列グラフ**: relationship graphs. Character/world edges come from explicit relations you've registered *plus* a same-episode co-occurrence heuristic (two characters mentioned in the same episode text get a weak automatic link) — don't read too much into faint auto-inferred edges.
- **状態履歴 (State history)**: the most recent character-state snapshots the AI has extracted after each episode save.
- **文字数 (Word count)**: total/average character counts (whitespace excluded) and a cumulative-character-count-by-episode-order chart — a rough proxy for writing pace, not a time-based one (it has no notion of *when* an episode was written, only its position in the sequence).
- **連続性 (Continuity)**: run or review the same continuity audit available from the Write screen, project-wide.

The health score is a heuristic (continuity issue counts + episode coverage), not a measure of prose quality.

## Search (検索)

Semantic search over your episode text via Qdrant. If Qdrant is unreachable, it silently falls back to a plain PostgreSQL substring match (`ILIKE`) — the screen tells you which one actually served the results ("セマンティック検索 (Qdrant)" vs "全文一致 (PostgreSQL フォールバック)"). "再構築" (Rebuild) re-indexes every episode in the project (this button only appears when searching the current project — see below).

Checking "すべての作品を検索対象にする" (search all projects) switches to `POST /api/v1/rag/search-all`, which searches across every project's episodes instead of just the current one. Each result shows which project it came from. There's no "rebuild index" button in this mode — rebuild from each project's own Search screen instead.

### Search and replace-all (検索・全置換)

The "検索・全置換" tab on the same screen is a separate, plain-text (not semantic) find/replace scoped to the current project's episodes (`GET`/`POST /api/v1/projects/{id}/text-search` and `/text-replace`). Enter a search string and optional replacement, toggle case sensitivity, and search — each matching episode is listed with its hit count and a few surrounding snippets, and is pre-selected for replacement (uncheck any you want to skip). Replacing is scoped to whichever episodes are checked; each affected episode's prior content is snapshotted to its revision history first (see Write screen's revision history), so a replace-all can always be undone episode by episode afterward.

## AI Chat (AIチャット)

A free-form chat with the same story context the Write screen's assistant uses. Conversation history is **persisted per project** (`GET`/`POST`/`DELETE /api/v1/projects/{id}/chat`) — it's still there when you come back to this screen or reload the page. "履歴を削除" permanently deletes it for that project. Replies are rendered as Markdown (headings, bold, tables, rules), same as the Write screen's preview — not shown as raw `##`/`**`/`|` syntax.

## Auto-write (自動執筆)

Generates a range of episodes (1 up to 500) with minimal human intervention, using a hierarchical planning pipeline:

```
Series Planner   (whole 1–500 arc)
  → Arc Planner       (5 arcs of 100 episodes)
    → Mini Arc Planner (10 mini-arcs of 10 episodes each, per arc)
      → Episode Planner (one blueprint per episode)
        → Writer         (generates the actual prose)
        → Controller gate (timeline/character/world/plot check; can force a rewrite)
```

Two model roles are involved (see [Software Requirements](requirements.md) for how to configure them):

- **Writer** — generates prose. Default `qwen3.8:27b`, overridable per job.
- **Controller** — does all the planning levels above plus the pre-write and post-write quality gates (timeline, character-state, world-setting, plot consistency only — it does not judge prose quality). Default `qwen3:14b`, overridable per job.

Starting a job: pick a start/end episode range, optionally a free-text "premise" (additional guidance), and whether to overwrite episodes that already have content (off by default — existing non-empty episodes are skipped). The plan (Series/Arc/Mini-Arc levels) is generated once and reused across episodes in range; it's expanded lazily, only as far as the requested range needs.

Progress display: a percentage, a phase label (queued / series_planner / arc_planner / controller_preflight / writer / controller_gate / completed / stopped / error), and counts of how many Arcs/Mini-Arcs/Episode-plans exist and how many episodes have actual written content. It's polled every 3 seconds while a job is active. "■ 停止する" requests a graceful stop — the job finishes its current episode, then stops rather than stopping mid-generation. The job history list at the bottom shows recent jobs for the project; click one to view it even after it's finished.

Every 5th episode written also triggers a full continuity audit automatically.

Clicking "▶ 自動執筆を開始" also asks the browser for notification permission (if not already granted/denied) — when granted, a desktop notification fires the moment the job finishes (completed, stopped, or errored), so you don't have to keep watching the progress bar. This only works while this tab stays open; it's a plain browser `Notification`, not a push notification, so it can't reach you if the tab or browser is closed. The [file import](#importing-from-a-text-file) jobs behave the same way.

## Settings (設定)

- **基本設定 (Basic)**: edit the project's name, genre, synopsis, rules, and episode target. Saves immediately via the API.
- **AI設定 (AI settings)**: sets *this browser's* default Writer/Controller model names, which prefill the Auto-write start form.
- **接続設定 (Connection settings)**: Qdrant URL, and both Ollama endpoints/models (Writer and Controller) can be changed here and take effect immediately, no restart needed — see [Connection settings](#connection-settings) below. SQL (the database itself) is shown masked, read-only.
- **エクスポート (Export)**: downloads every episode's prose (title + summary + body only — no characters/world/plot/foreshadowing data) as a single file in one of three formats: plain text (`.txt`), Markdown (`.md`), or a minimal but valid EPUB3 (`.epub`) you can open in any e-reader. `GET /api/v1/projects/{id}/export?format=txt|md|epub`.

### Connection settings

`GET`/`PUT /api/v1/system-settings`. Each of Qdrant URL, Ollama 1 (Writer) URL/model/embedding-model, and Ollama 2 (Controller) URL/model can be overridden from this screen; a field shows "（上書き中）" when it's currently an override rather than the server's environment-variable default. Saving an empty value for a field reverts it to that default. These overrides are stored in the database and take effect on the very next AI/search call — Qdrant and Ollama clients are constructed fresh per call, so there's nothing to restart.

The database connection (`DATABASE_URL`) is deliberately **not** editable from here — the app would have to swap the very connection it's using to read this settings screen out from under itself mid-request, which isn't safe to do live. Change it via the `DATABASE_URL` environment variable and restart the server instead.

Every row (including the read-only SQL one) has a "接続テスト" (test connection) button — `POST /api/v1/system-settings/test-connection`. It probes the *value currently in that field*, whether or not it's been saved yet, so you can check a new URL before committing to it: a real `SELECT 1` for the database, `get_collections()` for Qdrant, and `GET /api/tags` for either Ollama endpoint (the two model fields additionally check that the named model is actually pulled, not just that the server answers). Each probe times out after 8 seconds and reports round-trip latency alongside success/failure — it never touches what's saved, only what you're about to save.

## Local-disk mirror and GitHub auto-save

Every episode save also writes a plain Markdown copy to disk (`writers_STORAGE_DIR`, one folder per project, one `.md` file per episode — filenames are keyed by episode number and id, so renaming a title never orphans a file). The database stays authoritative for everything the app reads; this is a write-through mirror, kept for readability outside the app and as the basis for GitHub sync.

If `GIT_REMOTE_URL` is set (a git remote URL with your Personal Access Token embedded, e.g. `https://<token>@github.com/<you>/<repo>.git`), a background loop commits whatever changed in that mirror and pushes it every `GIT_AUTOSYNC_INTERVAL_SECONDS` (default 300). Nothing is pushed if `GIT_REMOTE_URL` is unset — the local-disk mirror still works on its own. Push/commit failures (no network, bad token, remote rejected) are logged and simply retried on the next tick; they never interrupt saving in the app itself.

## Backup and restore

Settings → "バックアップ" tab (a server-wide feature, not scoped to the current project): shows whether scheduled backups are on, the interval/retention currently configured, and a list of backups taken so far with what each one covers and its size. "今すぐバックアップ" (Backup now) triggers one on demand and shows its result (success/failure per component) right there.

Scheduled backups are **off by default** — set `BACKUP_ENABLED=true` (`BACKUP_INTERVAL_SECONDS`, default 86400 = daily; `BACKUP_RETENTION_COUNT`, default 7, older ones are deleted automatically) to turn them on. Each run does the same thing `scripts/backup.sh` does by hand — a PostgreSQL dump (`pg_dump`) plus a Qdrant collection snapshot, if anything's been indexed — written to a timestamped folder under `BACKUP_DIR` (a container volume by default in the Docker Compose / desktop-installer setups). Unlike the standalone script, it resolves the Qdrant URL the same way the rest of the app does, including any live override set from 接続設定, not just a fixed env var.

To restore, use `scripts/restore.sh <backup-dir>` at the repo root, run from a machine with the `docker-compose` stack up — **it replaces the current database contents with no confirmation prompt**, so double-check the path before running it. There's no restore button in the UI; restoring is inherently destructive to whatever's currently in the database, so it stays a deliberate command-line step. Ollama models aren't covered by any of this; re-pull them separately if needed. The local-disk episode mirror (and its GitHub sync, if configured) is a separate, always-on backstop for episode text specifically — it isn't part of the backup/restore flow above.

## Mobile

Below 700px width the sidebar collapses into a wrapping horizontal bar at the top instead of a fixed left column, and grids (icon grid, entity-edit forms) drop to fewer columns. It's usable but optimized for desktop use, given the amount of text entry the app requires.
