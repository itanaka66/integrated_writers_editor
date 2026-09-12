---
title: インストールマニュアル
layout: default
---

[← マニュアルトップ](index.md) | [English](installation.md)

# インストールマニュアル

先に [requirements.ja.md](requirements.ja.md) で動作要件を確認してください。

## 1. Ollamaのインストールとモデルの取得

Ollamaは常にホスト側で動かします（Docker Composeは起動しません）。以下のどちらの方式を選んでも、この手順は共通です。

1. https://ollama.com からOllamaをインストールします。
2. 使う予定のモデルを取得します。
   ```bash
   ollama pull qwen3:8b
   ollama pull qwen3.8:27b
   ollama pull qwen3:14b
   ollama pull nomic-embed-text
   ```
   `qwen3.8:27b`と`qwen3:14b`は大きなモデルです。執筆画面のAI支援（`qwen3:8b`）だけ使い、500話自動執筆機能はまだ使わないのであれば省略しても構いません。
3. 起動確認：`curl http://localhost:11434/api/tags` がJSONを返せばOKです。

## 2. 方式A — Docker Compose

### 最も簡単な方法：対話式セットアップスクリプト

Dockerに不慣れな方や、Windows/macOS/Linux/クラウドVMを問わず最速でセットアップしたい方は、リポジトリをクローンしてセットアップスクリプトを実行してください。いくつかのYes/No質問（PostgreSQL/Qdrantを同梱コンテナで動かすか外部のものを使うか、Ollamaをどこで動かすか、管理者パスワードを自動生成するか）に答えるだけで、コンテナが起動します。

```bash
git clone <このリポジトリのURL>
cd integrated_writers_editor
./scripts/setup.sh
```

Windowsでは、代わりに通常のPowerShellプロンプト（管理者権限は不要）からPowerShell版を実行してください。

```powershell
git clone <このリポジトリのURL>
cd integrated_writers_editor
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

どちらのスクリプトも、Docker（Windows/macOSはDocker Desktop、LinuxはDocker Engine + Composeプラグイン）が事前にインストール・起動済みであることが前提です。詳細は[requirements.ja.md](requirements.ja.md)を参照してください。`.env`の各値を自分で細かく制御したい場合や、スクリプトが対応していない設定が必要な場合は、以下の手動手順に進んでください。

### 手動手順

```bash
git clone <このリポジトリのURL>
cd integrated_writers_editor
cp .env.example .env
```

`.env`を編集し、実際の`ADMIN_PASSWORD`を設定してください（未設定だとComposeが起動を拒否します。各変数の意味は[requirements.ja.md](requirements.ja.md)を参照）。Ollamaを別マシンで動かす場合は`OLLAMA_URL`も変更してください。

```bash
docker compose up --build
```

4つのコンテナがビルド・起動します：`db`（Postgres）、`qdrant`、`api`（起動時に自動で`alembic upgrade head`を実行し、初回起動時にデモ作品を1件投入）、`web`。ログが落ち着いたら以下を開きます。

- Webアプリ：http://localhost:3000
- APIインタラクティブドキュメント：http://localhost:8000/docs

ユーザー名`admin`と設定した`ADMIN_PASSWORD`でログインしてください。

停止：`docker compose down`。停止して**全データを削除**する場合：`docker compose down -v`。

## 2b. 方式A2 — デスクトップインストーラ（Windows / macOS）

`git clone`やターミナル操作をしたくない場合は、[Releasesページ](https://github.com/itanaka66/integrated_writers_editor/releases)からインストーラをダウンロードしてください。

- **Windows**：`INE-Setup-<version>.exe`を実行します。コード署名証明書が無いため未署名で、SmartScreenが警告を出します。「詳細情報」→「実行」で進めてください。`%LOCALAPPDATA%\INE`（「すべてのユーザー用」を選んだ場合は`Program Files`）にインストールされ、スタートメニュー・デスクトップに「INEを起動」「INEを停止」ショートカットが作成されます。
- **macOS**：`INE-Setup-<version>.pkg`を開き、案内に従って進めます。未署名・未公証のため、初回はGatekeeperにブロックされます。`.pkg`を右クリック→「開く」で一度だけ回避してください。`/Applications`に「INEを起動.app」「INEを停止.app」がインストールされます。

いずれの場合も、[Docker Desktop](https://www.docker.com/products/docker-desktop/)は別途インストールが必要な前提条件です。先にインストールしてください。起動ショートカットはDockerの有無を確認し、起動していなければ立ち上げ、方式Aと同じ4つのコンテナを（ローカルビルドではなくGHCRの既成イメージをpullして）起動し、http://localhost:3000 を開きます。初回起動時にランダムな`ADMIN_PASSWORD`を生成してインストール先の`.env`に書き込み、一度だけダイアログで表示します。控えておいてください。このインストーラはOllamaを**インストールしません**。どちらの方式でも手順1は必須です。

このインストーラは方式Aを手軽にした薄いラッパーであり、別のデプロイ方式ではありません。インストール先に同じ形の`docker-compose.yml`/`.env`を書き込み、内部で`docker compose`を実行しているだけなので、本マニュアルや[requirements.ja.md](requirements.ja.md)の環境変数・ポート・トラブルシューティングの説明はそのまま当てはまります。設定画面の[接続設定](user-guide.ja.md#接続設定-1)も全く同じように使えます。

## 3. 方式B — ネイティブ構築

### バックエンド

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate   # Windowsの場合: .venv\Scripts\activate
pip install -r requirements-dev.txt   # テストが不要ならrequirements.txtでも可
```

起動中のPostgres・Qdrantを指す環境変数を設定します（シェルが読み込む`.env`を作っても構いません。全項目は[requirements.ja.md](requirements.ja.md)参照）。最低限：

```bash
export DATABASE_URL=postgresql+psycopg2://writers:writers@localhost:5432/writers
export QDRANT_URL=http://localhost:6333
export ADMIN_PASSWORD=change-me
```

マイグレーションを実行してからサーバーを起動します。

```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### フロントエンド

```bash
cd apps/web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env.local
npm run dev
```

http://localhost:3000 を開きます。

## 4. 初回ログイン

ユーザーごとのアカウントではなく、共有の管理者アカウントが1つだけ存在します（理由は[requirements.ja.md](requirements.ja.md)と[操作マニュアルのログイン項目](user-guide.ja.md#ログイン)を参照）。ユーザー名`admin`と設定した`ADMIN_PASSWORD`でログインしてください。ログイン画面のGoogle/GitHubボタンは意図的に無効化されています。OAuthには対応していません。

## 5. 動作確認

- `GET http://localhost:8000/api/v1/health` が `{"status":"ok",...}` を返すこと（このエンドポイントはログイン不要）。
- 新規データベースで初めてログインした際、ダッシュボードにデモ作品（「恐竜時代文明開拓記 DEMO」）が表示されること。
- バックエンドのテスト：`cd apps/api && pytest -q`（執筆時点で52件）。
- フロントエンドのビルド/lint：`cd apps/web && npm run lint && npm run build`。

## トラブルシューティング

| 症状 | 想定される原因 |
|---|---|
| `docker compose up`が`ADMIN_PASSWORD`エラーで即失敗する | `.env.example`から`.env`を作成していない、または`ADMIN_PASSWORD`が未設定 |
| ダッシュボードが「確認中...」「起動中...」のまま固まる | `NEXT_PUBLIC_API_URL`にAPIが到達できていない、またはログインできていない（ブラウザのネットワークタブで401か接続エラーかを確認） |
| AIリクエストがすぐに接続エラーで失敗する | Ollamaが起動していない、または`OLLAMA_URL`が誤っている（`http://host.docker.internal:11434`はWindows/macOSのDocker内からのみ解決可能。Linuxではホストのアドレスを別途指定するか、Ollamaを同じComposeネットワークで動かしてください） |
| `api`コンテナ起動時に`relation "projects" already exists`エラー | このプロジェクトがAlembic導入前に作られた古いPostgresボリュームが残っています。`docker compose down -v`でリセット（**全データ削除**）するか、データを残したい場合はそのDBに対して手動で`alembic stamp head`を実行してください |
| 検索が常に「全文一致 (PostgreSQL フォールバック)」になる | `QDRANT_URL`にQdrantが到達できていません。セマンティック検索は失敗時に単純な`ILIKE`一致検索へ自動的に切り替わります |
