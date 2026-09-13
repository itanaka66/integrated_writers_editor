---
title: インストールマニュアル
layout: default
---

[← マニュアルトップ](index.md) | [English](installation.md)

# インストールマニュアル

先に [requirements.ja.md](requirements.ja.md) で動作要件を確認してください。

## 1. Ollamaのインストールとモデルの取得

デフォルトではOllamaはホスト側で動かします。以下のどちらの方式を選んでも、この手順は共通です（方式Aでは、ホストに何もインストールしたくない場合向けに、Ollamaを同梱コンテナとして動かす選択肢もあります — 下記セットアップスクリプトの節を参照。クラウドAIプロバイダー（Claude/ChatGPT/Gemini）のみ使う場合はこの手順自体を省略できますが、セマンティック検索の埋め込みには依然として何らかのOllamaインスタンスが必要です）。

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

4つのコンテナがビルド・起動します：`db`（Postgres）、`qdrant`、`api`（起動時に自動で`alembic upgrade head`を実行し、初回起動時にデモ作品を1件投入）、`web`。（5つ目の`ollama`も用意されていますが既定では起動しません — 含めるには上記のセットアップスクリプトを使うか、`docker compose up ollama db qdrant api web`としてください。）ログが落ち着いたら以下を開きます。

- Webアプリ：http://localhost:3000
- APIインタラクティブドキュメント：http://localhost:8000/docs

ユーザー名`admin`と設定した`ADMIN_PASSWORD`でログインしてください。

停止：`docker compose down`。停止して**全データを削除**する場合：`docker compose down -v`。

**任意：独自ドメイン＋HTTPS化：** 上記の構成は`:3000`/`:8000`というカスタムポートの平文HTTPで提供されるため、ローカル・LAN内利用や信頼できる小規模チームでの利用には十分ですが、公開ドメインでの運用には、[Caddy](https://caddyserver.com/)や[nginx](https://nginx.org/)などのリバースプロキシを3000番・8000番の前段に自分で用意してください（本プロジェクトには同梱していません）。Caddyのようなプロキシは、所有しているドメインのTLS証明書を自動で取得・更新してくれるため、`:3000`/`:8000`のポートを省略して`https://自分のドメイン`だけでアクセスできるようになり、APIのポート自体をインターネットに公開する必要も無くなります。その際は`CORS_ORIGINS`と`NEXT_PUBLIC_API_URL`を`https://`のドメインに更新するのを忘れないでください（プロキシが`/api`を同じドメイン上のAPIへ振り分ける構成なら、`/api/v1`のような同一オリジンの相対パスでも構いません）。ログイン時に接続エラーになる場合は、下記のトラブルシューティング表も参照してください。

**任意：ポート転送の代わりにCloudflare Tunnelを使う：** ルーターの受信ポートを一切開けたくない場合（`80`/`443`/`8000`のいずれも転送不要。CGNAT配下でも動作します）、[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)を使えば、送信専用のトンネル経由でこのアプリをインターネットに公開でき、TLSはCloudflare側が処理してくれます。（無料の）Cloudflareアカウントにドメインを追加している必要があります。

1. Dockerホストに`cloudflared`をインストール（または専用コンテナとして実行 — Cloudflareのドキュメント参照）し、アカウントに認証させます：`cloudflared tunnel login`。
2. 名前付きトンネルを作成し、ドメインをそこにルーティングします：`cloudflared tunnel create ine`、続けて`cloudflared tunnel route dns ine your-domain.example`。
3. トンネルの設定ファイル（`~/.cloudflared/config.yml`）に、パスごとに各サービスへ振り分ける**ingressルール**を追加します。これにより、リバースプロキシを立てなくても`web`と`api`の両方を同じドメインの配下に置けます：
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /root/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: your-domain.example
       path: ^/api/.*
       service: http://localhost:8000
     - hostname: your-domain.example
       service: http://localhost:3000
     - service: http_status:404
   ```
4. トンネルを起動し（`cloudflared tunnel run ine`、またはCloudflareのドキュメントに従いシステムサービス化）、`.env`を更新します：`NEXT_PUBLIC_API_URL=https://your-domain.example/api/v1`（同一オリジンの相対パス`/api/v1`でも可）、`CORS_ORIGINS=https://your-domain.example`。反映には`docker compose up -d --build web`が必要です。

どちらの方法も「1つのHTTPSドメインに集約し、APIのポートを公開しない」という同じゴールを達成します — Cloudflare Tunnelはルーター設定が一切不要な代わりに通信がCloudflare経由になり、自前のリバースプロキシは全てを自分のインフラ内に収められる代わりに証明書取得のため`80`/`443`の転送が必要です。

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

起動中のPostgres・Qdrantを指す`apps/api/.env`を作成します（アプリが起動時に自動で読み込むので、`export`やシェル側での読み込み設定は不要です。全項目は[requirements.ja.md](requirements.ja.md)参照）。最低限：

```bash
# apps/api/.env
DATABASE_URL=postgresql+psycopg2://writers:writers@localhost:5432/writers
QDRANT_URL=http://localhost:6333
ADMIN_PASSWORD=change-me
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

この開発サーバー（`npm run dev`。本番ビルドではない）に`localhost`以外（LAN内のIP、リバースプロキシ経由の独自ドメインなど）でアクセスすると、Next.jsが警告を出し、開発用のアセット（HMR/websocket。`CORS_ORIGINS`やAPIとは無関係）へのアクセスをブロックします。起動前に`NEXT_DEV_ALLOWED_ORIGINS`を設定すると許可できます：

```bash
NEXT_DEV_ALLOWED_ORIGINS=https://your-dev-domain.example npm run dev
```

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
