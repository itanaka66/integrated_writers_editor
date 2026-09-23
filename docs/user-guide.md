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

Lists all projects as cards, each showing genre and article count. The panel on the right shows detailed stats — article count, total/average character count — for your most recently created project. Click a card to open that project. "＋ 新規作品作成" opens the new-project form.

## Creating a project

Fields: name (required), genre, synopsis (あらすじ), free-text "rules" (詳細設定 — anything you want the AI to always respect: tone, audience, hard constraints). All of these map directly to a `Project` record and can be edited later from Settings.

## Project Home

The landing screen after opening a project: header with project name, description, and stats (article count, total/average character count); a row of shortcut buttons to the five main screens (執筆, 資料, 検索, AIチャット, 設定); and a "最近の更新" list of the 5 most recently added articles.

## Importing from a text file

Two ways in, both from a plain `.txt` file in the "なろう" (Shosetsuka ni Naro) bracket-section export format:

- **Dashboard → "ファイルからインポート"**: creates a brand-new project from a full writers export — a metadata header (title/synopsis/genre) followed by episodes delimited by `------- エピソードN開始 -------` separators. The parsed title/synopsis/genre become the new project's fields, and every episode is created.
- **Settings → "インポート" tab, inside an existing project**: adds or updates episodes in *that* project from either the same full-export format or a headerless draft-episodes file (episodes delimited by `-------第N話「タイトル」-------`, title embedded in the separator itself). An episode number that already exists gets its content overwritten (the prior content is snapshotted to that episode's revision history first, same as any other edit); a new number is created.

Both run as a background job you can watch progress on (`GET /api/v1/import-jobs/{id}`, polled every 2 seconds) rather than a single blocking request. A large import can take several minutes; the progress bar shows episodes processed / total, and you can close the dialog without cancelling the job (Dashboard's importer; the Settings tab's importer keeps polling as long as you stay on the tab).

The parser auto-detects which of the two formats a file is — you don't pick a mode. A file matching neither (no recognizable episode separators) is rejected up front with a 400, before any job is created.

## Write

The core writing screen, three columns:

- **Left**: the article list for this project, plus "＋ 新規記事" to create the next article (numbered automatically, with an optional template selector).
- **Center**: title, one-line summary, the main body textarea, and a "保存" button. Any save warnings (e.g. Qdrant unreachable) appear in a banner above the editor. The right part of the center area also holds a **Sources** panel — add URLs and notes as reference material for the current article; sources are stored per-episode and included in exports.
- **Right (AI tools panel)**: a drawer of AI tools, grouped into four categories:
  - **企画・構成**: 💡 アイデア生成, 🧱 記事構成作成 (SEO/ニュース/解説 variants), 🔑 SEOキーワード提案, 🎯 読者ターゲット分析
  - **執筆支援**: ▶ 続きを書く (streaming), ✎ 文章を改善, 🏷 見出し・タイトル改善 (3 proposals)
  - **品質チェック**: 🧩 構成チェック, ✅ ファクトチェック, ⚠ 矛盾チェック, 👀 読者レビュー, 🔤 誤字脱字チェック
  - **変換・要約**: 📝 要約 (streaming), 🔁 複数媒体への変換 (SNS/メルマガ/プレスリリース), 📣 キャッチコピー生成 (5 proposals)

  Tools that require a sub-choice (記事構成作成, 複数媒体への変換) show a picker before sending. Results appear in the AI result box; "＋ 本文に追加" appends them to the article body.
- **Editor toolbar**: B / I / H / ❝ buttons wrap the current selection (or insert at the cursor) with Markdown syntax (`**bold**`, `*italic*`, `## heading`, `> quote`) — the stored content is always plain Markdown text. "プレビュー" renders that Markdown to HTML; "編集に戻る" switches back to the raw textarea. "📋 Wordにコピー" copies the body's Markdown to the clipboard as HTML (with a plain-text fallback), so pasting into Word renders formatting correctly instead of literal `**`/`##` characters. A live character count (whitespace excluded) is shown next to the toolbar.
- **🕘 履歴 (revision history)**: every time you save different content than what was there before, the previous version is snapshotted (kept up to 20 per episode). This button lists them with a "この版に復元" (restore) action — restoring itself snapshots the version you're leaving, so restoring is itself undoable.


## Materials (資料)

The 資料 screen is split into two tabs:

- **メモ (Memos)**: free-form notes attached to the project (title + content). CRUD via `GET`/`POST`/`PUT`/`DELETE /api/v1/projects/{id}/memos`. Memo content is included in the plain-text search below.
- **ソース (Sources)**: reference material URLs and notes attached to a specific episode. CRUD via `GET`/`POST`/`DELETE /api/v1/episodes/{id}/sources`. A "要約" (Summarize) button sends the note text (or attached PDF content) to the AI and appends the summary. Sources are included when exporting a project.

## Search (検索)

Semantic search over episode text via Qdrant. If Qdrant is unreachable, it silently falls back to a plain PostgreSQL substring match (`ILIKE`) — the screen tells you which one actually served the results ("セマンティック検索 (Qdrant)" vs "全文一致 (PostgreSQL フォールバック)"). "再構築" (Rebuild) re-indexes every episode in the project (this button only appears when searching the current project — see below).

Checking "すべての作品を検索対象にする" (search all projects) switches to `POST /api/v1/rag/search-all`, which searches across every project's episodes instead of just the current one. Each result shows which project it came from. There's no "rebuild index" button in this mode — rebuild from each project's own Search screen instead.

### Search and replace-all (検索・全置換)

The "検索・全置換" tab on the same screen is a separate, plain-text (not semantic) find/replace scoped to the current project's episodes **and memos** (`GET`/`POST /api/v1/projects/{id}/text-search` and `/text-replace`). Enter a search string and optional replacement, toggle case sensitivity, and search — each matching episode or memo is listed with its hit count and surrounding snippets, and is pre-selected for replacement (uncheck any you want to skip). Replacing snapshots each affected episode's prior content to revision history first (see Write screen's revision history), so a replace-all can always be undone episode by episode afterward.

## AI Chat (AIチャット)

A free-form chat with the AI about the current project. Conversation history is **persisted per project** (`GET`/`POST`/`DELETE /api/v1/projects/{id}/chat`) — it's still there when you come back to this screen or reload the page. "履歴を削除" permanently deletes it for that project. Replies are rendered as Markdown (headings, bold, tables, rules) — not shown as raw `##`/`**`/`|` syntax.

## Settings (設定)

- **基本設定 (Basic)**: edit the project's name, genre, synopsis, rules, and episode target. Saves immediately via the API.
- **接続設定 (Connection settings)**: the active AI provider (Ollama/Anthropic/OpenAI/Google), its API key, model name, Ollama URL and embedding model, and the Qdrant URL — all changeable live with no restart needed. See [Connection settings](#connection-settings) below. The database URL is shown masked, read-only.
- **使用状況 (Usage)**: per-provider/model breakdown of AI generation usage (input/output tokens) and estimated cost, plus a recent-calls list. Backed by `GET /api/v1/ai-usage/summary` and `/ai-usage/recent`.
- **インポート (Import)**: add or update episodes from a text file (see [Importing from a text file](#importing-from-a-text-file)).
- **バックアップ (Backup)**: scheduled and on-demand backups — see [Backup and restore](#backup-and-restore).
- **エクスポート (Export)**: downloads every episode's content (title + summary + body + sources) as a single file in one of three formats: plain text (`.txt`), Markdown (`.md`), or a minimal but valid EPUB3 (`.epub`) you can open in any e-reader. `GET /api/v1/projects/{id}/export?format=txt|md|epub`.

### Connection settings

`GET`/`PUT /api/v1/system-settings`. The active AI provider, its API key, and model name can be switched here; Qdrant URL and Ollama URL/model/embedding-model are also overridable. A field shows "（上書き中）" when it's an override rather than the server's environment-variable default. Saving an empty value for a field reverts it to that default. Overrides are stored in the database and take effect on the very next AI/search call — clients are constructed fresh per call.

Cloud provider API keys (Anthropic/OpenAI/Google) are never echoed back in `GET` responses — only whether a key is currently set. To clear a key, save an empty value.

The database connection (`DATABASE_URL`) is deliberately **not** editable from here — change it via the `DATABASE_URL` environment variable and restart the server instead.

Every row (including the read-only SQL one) has a "接続テスト" (test connection) button — `POST /api/v1/system-settings/test-connection`. It probes the *value currently in that field*, whether or not it's been saved yet: a real `SELECT 1` for the database, `get_collections()` for Qdrant, and `GET /api/tags` for the Ollama endpoint (the model field additionally checks that the named model is actually pulled). Each probe times out after 8 seconds and reports round-trip latency alongside success/failure — it never touches what's saved, only what you're about to save.

## Local-disk mirror and GitHub auto-save

Every episode save also writes a plain Markdown copy to disk (`writers_STORAGE_DIR`, one folder per project, one `.md` file per episode — filenames are keyed by episode number and id, so renaming a title never orphans a file). The database stays authoritative for everything the app reads; this is a write-through mirror, kept for readability outside the app and as the basis for GitHub sync.

If `GIT_REMOTE_URL` is set (a git remote URL with your Personal Access Token embedded, e.g. `https://<token>@github.com/<you>/<repo>.git`), a background loop commits whatever changed in that mirror and pushes it every `GIT_AUTOSYNC_INTERVAL_SECONDS` (default 300). Nothing is pushed if `GIT_REMOTE_URL` is unset — the local-disk mirror still works on its own. Push/commit failures (no network, bad token, remote rejected) are logged and simply retried on the next tick; they never interrupt saving in the app itself.

## Backup and restore

Settings → "バックアップ" tab (a server-wide feature, not scoped to the current project): shows whether scheduled backups are on, the interval/retention currently configured, and a list of backups taken so far with what each one covers and its size. "今すぐバックアップ" (Backup now) triggers one on demand and shows its result (success/failure per component) right there.

Scheduled backups are **off by default** — set `BACKUP_ENABLED=true` (`BACKUP_INTERVAL_SECONDS`, default 86400 = daily; `BACKUP_RETENTION_COUNT`, default 7, older ones are deleted automatically) to turn them on. Each run does the same thing `scripts/backup.sh` does by hand — a PostgreSQL dump (`pg_dump`) plus a Qdrant collection snapshot, if anything's been indexed — written to a timestamped folder under `BACKUP_DIR` (a container volume by default in the Docker Compose / desktop-installer setups). Unlike the standalone script, it resolves the Qdrant URL the same way the rest of the app does, including any live override set from 接続設定, not just a fixed env var.

To restore, use `scripts/restore.sh <backup-dir>` at the repo root, run from a machine with the `docker-compose` stack up — **it replaces the current database contents with no confirmation prompt**, so double-check the path before running it. There's no restore button in the UI; restoring is inherently destructive to whatever's currently in the database, so it stays a deliberate command-line step. Ollama models aren't covered by any of this; re-pull them separately if needed. The local-disk episode mirror (and its GitHub sync, if configured) is a separate, always-on backstop for episode text specifically — it isn't part of the backup/restore flow above.

## Mobile

Below 700px width the sidebar collapses into a wrapping horizontal bar at the top instead of a fixed left column, and grids (icon grid, entity-edit forms) drop to fewer columns. It's usable but optimized for desktop use, given the amount of text entry the app requires.
