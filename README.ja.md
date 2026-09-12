# Integrated Writers Editor (IWE)

English version → [README.md](README.md)

記事執筆を支援するAIアシスト付きエディタです。プロジェクトとエピソード（記事）を管理し、アイデア出し・構成・SEOキーワード・見出し改善・ファクトチェック・キャッチコピー生成などをAIに手伝わせながら、メモや参考資料（ソース）を下書きと一緒に管理できます。ローカルの[Ollama](https://ollama.com)、またはクラウドプロバイダ（Anthropic Claude、OpenAI、Google Gemini）のいずれかを選んで利用できます。

## ドキュメント

オンラインマニュアル: **https://itanaka66.github.io/integrated_writers_editor/** — もしくは[`docs/`](docs/)配下のファイルを直接どうぞ。

| | English | 日本語 |
|---|---|---|
| 動作要件 | [docs/requirements.md](docs/requirements.md) | [docs/requirements.ja.md](docs/requirements.ja.md) |
| インストールマニュアル | [docs/installation.md](docs/installation.md) | [docs/installation.ja.md](docs/installation.ja.md) |
| はじめての方向けガイド | [docs/getting-started.md](docs/getting-started.md) | [docs/getting-started.ja.md](docs/getting-started.ja.md) |
| 操作マニュアル | [docs/user-guide.md](docs/user-guide.md) | [docs/user-guide.ja.md](docs/user-guide.ja.md) |

## クイックスタート

```bash
cp .env.example .env   # ADMIN_PASSWORD（必須）とOllamaのURLを必要に応じて編集
docker compose up --build
```

Webアプリは `http://localhost:3000`（ユーザー名`admin`と設定した`ADMIN_PASSWORD`でログイン）、APIのインタラクティブドキュメントは `http://localhost:8000/docs` で開けます。Dockerを使わない構築方法も含めた詳細は[インストールマニュアル](docs/installation.ja.md)を参照してください。

ターミナル操作をしたくない場合は、[Releasesページ](https://github.com/itanaka66/integrated_writers_editor/releases)から**Windows（`.exe`）**または**macOS（`.pkg`）**のデスクトップインストーラをどうぞ。Docker Desktopは別途必要ですが、それ以外はインストーラが行い、「起動」「停止」ショートカットが作成されます。詳しくは[installer/](installer/)とインストールマニュアルのデスクトップインストーラの項目を参照してください。

ローカルOllamaのモデル取得：
```bash
ollama pull qwen3:8b          # AI支援（執筆画面・チャット・各種AIツール）
ollama pull nomic-embed-text  # RAG用埋め込みモデル
```

## 機能概要

- **プロジェクトとエピソード**：記事をプロジェクト単位で管理し、各プロジェクトに複数のエピソード（下書き）を作成・編集・削除できます。変更履歴（復元可能）とリアルタイム文字数表示も備えています。
- **AIツールピッカー**：アイデア出し、記事構成、SEOキーワード提案、見出し／タイトル改善、ファクトチェック、フォーマット変換、読者ターゲット分析、キャッチコピー生成——いずれも執筆画面から呼び出せ、共通の`/ai/generate`エンドポイントを利用します。加えて、履歴が保存される作品ごとの自由対話AIチャットもあります。
- **ストリーミング生成**：`POST /api/v1/ai/generate/stream`により、生成結果を待たずにトークン単位でリアルタイム表示できます。
- **複数LLMプロバイダ対応**：Ollama（ローカル）、Anthropic Claude、OpenAI、Google Geminiを設定＞接続設定から切り替え可能。再起動は不要です。なお埋め込み（セマンティック検索用）は常にOllamaを使用します。
- **AI利用状況・コスト記録**：生成のたびにプロバイダ・モデル・入出力トークン数・推定コストを記録し、設定＞使用状況画面（`GET /api/v1/ai-usage/summary`・`/ai-usage/recent`）で確認できます。
- **メモとソース**：プロジェクトに紐づく自由記述のメモと参考資料（ソース）を管理でき、ソース内容の要約ツールも利用できます。
- **テンプレート**：プロジェクトごとに再利用可能なテンプレートを管理できます。
- **セマンティック検索（RAG）**：Qdrantによる本文検索。Qdrantに接続できない場合はPostgreSQLの部分一致検索へ自動フォールバックし、検索画面にはどちらが実際に使われたかが表示されます。現在の作品だけでなく、全作品を横断して検索することもできます。
- **プレーンテキスト検索・全置換**：作品内の全エピソード*およびメモ*を対象に文字列を検索し、一括置換できます。置換前にエピソードごとのプレビュー・選択ができ、置換前の内容は自動的に改訂履歴に保存されるため、いつでも元に戻せます。
- **テキストファイルからのインポート**：既存のテキスト／執筆形式エクスポートからエピソードを一括インポートでき、進捗確認可能なバックグラウンドジョブとして実行されます。
- **自動バックアップのスケジュール実行**：PostgreSQLのダンプとQdrantのスナップショットをタイマーで自動取得するバックグラウンドジョブ（既定オフ、オプトイン）。自動保持件数管理付き。設定画面から「今すぐバックアップ」ボタンでの即時実行と履歴確認もできます。詳しくは[設定＞バックアップとリストア](docs/user-guide.ja.md#バックアップとリストア)を参照してください。
- **エクスポート**：作品のエピソードをテキスト・Markdown・簡易EPUB3のいずれかでダウンロードできます。

## アーキテクチャ

| | |
|---|---|
| バックエンド | FastAPI + SQLAlchemy 2.0、Python 3.13、Alembicマイグレーション |
| フロントエンド | Next.js 16（App Router）+ React 19、TypeScript |
| データベース | PostgreSQL（プロジェクト、エピソード、メモ、ソース、テンプレート、利用ログ） |
| ベクトルストア | Qdrant（セマンティック検索の索引） |
| AIプロバイダ | Ollama（ローカル・既定）、Anthropic Claude、OpenAI、Google Geminiから選択可能。設定画面からいつでも切り替え可能で、埋め込みは常にOllama |
| 認証 | 共有のHTTP Basic認証アカウント1つのみ（`ADMIN_USERNAME`/`ADMIN_PASSWORD`）。個人ごとのアカウントやOAuthはなし |
| CI | GitHub Actions：ruff＋pytest＋Alembicマイグレーションの往復確認（バックエンド）、eslint＋Vitest＋`next build`（フロントエンド） |

Ollama呼び出し（`generate`/`embed`）は、一時的なネットワーク障害に対して最大3回までバックオフ付きでリトライします。セルフホスト環境向けに、PostgreSQL＋Qdrantのバックアップ/リストアを行う`scripts/backup.sh`/`scripts/restore.sh`も用意しています（[操作マニュアルのバックアップとリストアの項目](docs/user-guide.ja.md#バックアップとリストア)参照）。

## 既知の制限

- 共有パスワード1つのみで、個人ごとのアカウントや権限管理はありません（[操作マニュアル→ログイン](docs/user-guide.ja.md#ログイン)参照）。
- エディタのMarkdownツールバー/プレビューはリッチテキストエディタではありません。保存される内容は常にプレーンなMarkdownテキストです。
- クラウドプロバイダ（Anthropic/OpenAI/Google）のAPIキーは設定画面からの実行時設定のみに対応しており、`.env`／Docker Composeの環境変数では設定できません。

不具合報告・改善提案は、本リポジトリのIssueにてお願いします。
