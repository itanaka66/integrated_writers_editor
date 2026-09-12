---
title: 動作要件
layout: default
---

[← マニュアルトップ](index.md) | [English](requirements.md)

# 動作要件

## 方式A — Docker（推奨）

| 要件 | バージョン | 補足 |
|---|---|---|
| Docker Engine | 24以上 | Docker Compose v2プラグイン(`docker compose`。古い`docker-compose`ではない)を含むこと |
| 空きディスク容量 | 10GB以上 | Postgres/Qdrantのボリューム＋ビルド済みイメージ |
| メモリ | 8GB以上 | 同じマシンでOllamaも動かす場合は16GB以上推奨 |

Windows/macOSはDocker Desktop、LinuxはDocker Engine + Composeプラグインのどちらでも動作します。

## 方式B — Dockerを使わずネイティブに構築する場合

| コンポーネント | 要件 |
|---|---|
| バックエンド（`apps/api`） | Python 3.13 |
| フロントエンド（`apps/web`） | Node.js 22、npm |
| データベース | PostgreSQL 17（15/16でもおそらく動作しますが、動作確認済みは17です） |
| ベクトルストア | Qdrant（比較的新しいバージョンであればOK。HTTP API経由で利用） |
| ローカルLLM実行環境 | [Ollama](https://ollama.com) |

ネイティブ構築でもOllamaと（ベクトル検索を使うなら）Qdrantは別途必要です。DockerはPostgres/Qdrant/アプリのコンテナだけを代替するもので、LLM実行環境（GPUを使うためほぼ常にホスト側で動かします）は含まれません。

## AIプロバイダとモデル

| 設定 | 設定項目 | 既定値 | 用途 |
|---|---|---|---|
| プロバイダ | `ai_provider`（実行時設定。環境変数ではない） | `ollama` | `/ai/generate`・`/ai/generate/stream`を処理するLLMバックエンドを選択：`ollama`／`anthropic`／`openai`／`google` |
| Ollama | `OLLAMA_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `qwen3.8:27b` | プロバイダが`ollama`の場合に使うローカルOllamaサーバーとモデル |
| Anthropic Claude | 実行時設定（APIキー＋モデル名） | モデル`claude-sonnet-4-5` | プロバイダが`anthropic`の場合に使用 |
| OpenAI | 実行時設定（APIキー＋モデル名） | モデル`gpt-4o-mini` | プロバイダが`openai`の場合に使用 |
| Google Gemini | 実行時設定（APIキー＋モデル名） | モデル`gemini-2.0-flash` | プロバイダが`google`の場合に使用 |
| 埋め込み | `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | RAGセマンティック検索の索引生成——選択中のAIプロバイダに関わらず常にOllamaが担当 |

有効なプロバイダ・APIキー・モデル名は実行時設定としてデータベースに保存され、アプリの設定＞接続設定画面（「接続テスト」ボタン付き）から再起動なしで変更できます（[操作マニュアル](user-guide.ja.md#接続設定)参照）。初期デプロイ時はOllamaのサーバーURL／モデルを`OLLAMA_URL`／`OLLAMA_MODEL`の環境変数で設定することもできます。

## ローカルディスク／GitHubへのエピソード保存

| 設定項目 | デフォルト | 用途 |
|---|---|---|
| `writers_STORAGE_DIR` | `./writers_storage` | エピソード本文が保存のたびにMarkdownとしてミラーされるディスク上の場所（エピソードごとに1ファイル） |
| `GIT_REMOTE_URL` | （未設定） | トークンを埋め込んだgitリモートURL（例：`https://<token>@github.com/<you>/<repo>.git`）。設定するとこのミラーがタイマーで自動コミット・プッシュされます。未設定の場合はディスクへのミラーのみでGitHub同期は行われません |
| `GIT_AUTOSYNC_INTERVAL_SECONDS` | `300` | 自動コミット・プッシュを実行する間隔（秒） |

## 自動バックアップ

| 設定項目 | デフォルト | 用途 |
|---|---|---|
| `BACKUP_ENABLED` | `false` | PostgreSQL＋Qdrantの自動バックアップループを有効化します。既定は無効。手動バックアップ（設定画面の「今すぐバックアップ」、または`scripts/backup.sh`）はどちらでも利用可能です |
| `BACKUP_DIR` | `./backups` | タイムスタンプ付きバックアップフォルダの保存先（Docker Compose／デスクトップインストーラ構成では既定でコンテナボリューム） |
| `BACKUP_INTERVAL_SECONDS` | `86400` | 自動バックアップの実行間隔（既定：1日ごと） |
| `BACKUP_RETENTION_COUNT` | `7` | 保持する直近バックアップの件数。それより古いものは実行のたびに自動削除されます |

リストアはコマンドライン操作（`scripts/restore.sh`）のみです。理由は[操作マニュアル](user-guide.ja.md#バックアップとリストア)を参照してください。

## 使用ポート

| ポート | サービス |
|---|---|
| 3000 | フロントエンド（Web） |
| 8000 | API（`/docs`でOpenAPIのインタラクティブUIも提供） |
| 5432 | PostgreSQL |
| 6333 / 6334 | Qdrant（HTTP / gRPC） |
| 11434 | Ollama（Docker Composeでは起動しません。ホスト側で起動してください） |

## ブラウザ

最新のChrome、Edge、Firefox、Safariのいずれか。IEおよび旧Edgeは非対応です。
