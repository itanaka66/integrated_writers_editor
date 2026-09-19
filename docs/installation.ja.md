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

**`CORS_ORIGINS`の設定方法：** この変数は、どのブラウザオリジンからのAPI呼び出しを許可するかを制御します。既定値は`*`（すべてのオリジンを許可）で、これによりアクセス元のホスト・IP・ドメインを問わずそのまま動作します（APIは元々独自のBasic認証ログインで保護されているため、`*`にしても新たに何かが無防備になるわけではありません）。特定のオリジンだけに絞りたい場合は、Webアプリを実際に配信しているオリジンをカンマ区切りで指定してください。例：

```bash
CORS_ORIGINS=https://writer.example.com,http://192.168.1.10:3000
```

各項目はブラウザが送信する「オリジン」（スキーム＋ホスト＋ポート。末尾スラッシュやパスは含めない）でなければならず、実際にブラウザでWebアプリにアクセスする際に入力するアドレスと一致させる必要があります（APIサーバー自身のアドレスではありません）。一致していないとAPI呼び出しが失敗し、ログイン画面に「APIに接続できませんでした」と表示されます（これはパスワード違いのエラーではなく接続エラーです — 下記のトラブルシューティング表も参照）。`.env`を編集した後は、`api`コンテナを再作成して反映してください：`docker compose up -d api`（リビルドは不要です）。アプリ内の設定＞接続設定からも、`.env`や再起動なしで後から変更できます — [user-guide.ja.md](user-guide.ja.md#接続設定-1)を参照してください。

```bash
docker compose up --build
```

4つのコンテナがビルド・起動します：`db`（Postgres）、`qdrant`、`api`（起動時に自動で`alembic upgrade head`を実行し、初回起動時にデモ作品を1件投入）、`web`。（5つ目の`ollama`も用意されていますが既定では起動しません — 含めるには上記のセットアップスクリプトを使うか、`docker compose up ollama db qdrant api web`としてください。）ログが落ち着いたら以下を開きます。

- Webアプリ：http://localhost:3000
- APIインタラクティブドキュメント：http://localhost:8000/docs

ユーザー名`admin`と設定した`ADMIN_PASSWORD`でログインしてください。

停止：`docker compose down`。停止して**全データを削除**する場合：`docker compose down -v`。

**任意：独自ドメイン＋HTTPS化：** 上記の構成は`:3000`/`:8000`というカスタムポートの平文HTTPで提供されるため、ローカル・LAN内利用や信頼できる小規模チームでの利用には十分ですが、公開ドメインでの運用には、[Caddy](https://caddyserver.com/)や[nginx](https://nginx.org/)などのリバースプロキシを3000番・8000番の前段に自分で用意してください（本プロジェクトには同梱していません）。Caddyのようなプロキシは、所有しているドメインのTLS証明書を自動で取得・更新してくれるため、`:3000`/`:8000`のポートを省略して`https://自分のドメイン`だけでアクセスできるようになり、APIのポート自体をインターネットに公開する必要も無くなります。その際は`CORS_ORIGINS`と`NEXT_PUBLIC_API_URL`を`https://`のドメインに更新するのを忘れないでください（プロキシが`/api`を同じドメイン上のAPIへ振り分ける構成なら、`/api/v1`のような同一オリジンの相対パスでも構いません）。ログイン時に接続エラーになる場合は、下記のトラブルシューティング表も参照してください。

**任意：ポート転送の代わりにCloudflare Tunnelを使う：** ルーターの受信ポートを一切開けたくない場合（`80`/`443`/`8000`のいずれも転送不要。CGNAT配下でも動作します）、[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)を使えば、送信専用のトンネル経由でこのアプリをインターネットに公開でき、TLSはCloudflare側が処理してくれます。（無料の）Cloudflareアカウントにドメインを追加している必要があります。設定方法は2通りあり、どちらも結果は同じです。

**この構成で必要な`.env`設定**（下記のダッシュボード方式・CLI方式のどちらでも共通。これ以外の`.env`項目は変更不要です）：

| 変数 | 値 | 理由 |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-domain.example/api/v1`（または同一オリジンの相対パス`/api/v1` — 下記の補足参照） | Next.jsのビルド時にJavaScriptへ焼き込まれる値のため、これは**動的には反映されません**。変更したら再起動ではなく`docker compose up -d --build web`（再ビルド）が必要です。 |
| `CORS_ORIGINS` | `https://your-domain.example` | 環境変数のみで設定可能（設定画面からは変更できません — [requirements.md](requirements.md)参照）。APIは`Origin`ヘッダーがこの値と一致するブラウザリクエストのみ受け付けます。反映は`docker compose up -d api`で十分です（フロントエンドと異なり再ビルド不要）。 |

`ADMIN_PASSWORD`・`OLLAMA_URL`・`DATABASE_URL`など他の項目は、トンネルを追加しても影響を受けません — これらはコンテナ同士やホストとの通信方法を指定するものであり、ブラウザからの到達方法とは無関係だからです。

同一オリジンの相対パス（`NEXT_PUBLIC_API_URL=/api/v1`）を使う場合、そのドメインのトンネルのingressルールが`/api/*`をAPIへ振り分けている**限り**（下記手順3がまさにその設定です）問題なく動作します。この場合ブラウザはページを読み込んだのと同じオリジンにAPIを呼び出すため、`CORS_ORIGINS`の重要性は下がります（同一オリジンのリクエストはそもそもCORSの対象外です）が、`/docs`のSwagger UIや別オリジンからの直接APIテストのためにも、正しく設定しておくことをお勧めします。

**ダッシュボード（推奨 — トンネルの作成・ルーティングにCLIコマンド不要）：**

1. [Cloudflare Zero Trustダッシュボード](https://one.dash.cloudflare.com/)で **Networks → Tunnels**（旧UIでは **Access → Tunnels**）を開き、**Create a tunnel** をクリックします。コネクタの種類は **Cloudflared** を選択してください（これ一択です）。Cloudflareダッシュボードの別の場所にあるWorkers/Pages用の「テンプレート」ギャラリーとは無関係の、別の機能なので混同しないでください。
2. トンネルに名前を付けます。インストール手順の環境選択で、ホストOSではなく **Docker** を選ぶと、トークン入り済みの`docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <your-token>`コマンドが表示されます。このコマンドをそのまま実行せず、トークンだけをコピーして、`docker-compose.yml`（または`docker-compose.release.yml`）に既存の`web`/`api`サービスと並べて以下のサービスを追加してください。これで他のサービスと同じ`docker compose`スタックでトンネルも管理できます：
   ```yaml
   services:
     # ... 既存の web, api, db, qdrant サービス ...
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
       depends_on: [web, api]
   ```
   トークンはcomposeファイルに直接書かず、`.env`に`CLOUDFLARE_TUNNEL_TOKEN=...`として保存し、`docker compose up -d cloudflared`で起動します。このダッシュボード／トークン方式では、ホスト側に`~/.cloudflared/config.yml`は一切不要です — 下の手順3のingressルールはCloudflareのダッシュボード側で管理されます。
3. **Public Hostname** タブで、同じドメインに対して2つのホスト名ルールを追加します：**Path**を`api/*`にしたルール（サービスは`http://api:8000` — `cloudflared`はcomposeのネットワーク越しに他サービスへ到達するため、`localhost`ではなくコンテナ名を指定します）と、パス指定なしのルール（サービスは`http://web:3000`）です。`api/*`のルールを、パス指定なしのルールより上に配置してください（Cloudflareは上から順に評価します）。
4. 上記の表にある2つの`.env`設定を反映します（`NEXT_PUBLIC_API_URL`は`docker compose up -d --build web`、`CORS_ORIGINS`は`docker compose up -d api`）。

**CLI／Docker（設定ファイルベースで、ダッシュボードよりingressルールを細かく管理したい場合）：**

1. Dockerホストで一度だけトンネルを認証します（この最初の1ステップのためだけにローカルへ`cloudflared`のインストールが必要です — ブラウザでのログインだけで、常駐させるものではありません）：`cloudflared tunnel login`、続けて`cloudflared tunnel create ine`、さらに`cloudflared tunnel route dns ine your-domain.example`。これで`~/.cloudflared/<tunnel-id>.json`に認証情報が書き出され、トンネルIDが表示されます。
2. `~/.cloudflared/config.yml`にingress設定を書きます。これにより、リバースプロキシを立てなくても`web`と`api`の両方を同じドメインの配下に置けます。このファイルはコンテナにマウントするので、`localhost`ではなくコンテナネットワークのサービス名（`api`、`web`）を指定してください：
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /etc/cloudflared/<tunnel-id>.json
   ingress:
     - hostname: your-domain.example
       path: ^/api/.*
       service: http://api:8000
     - hostname: your-domain.example
       service: http://web:3000
     - service: http_status:404
   ```
3. `cloudflared`自体をホストにインストールする代わりに、同じcomposeネットワーク上のコンテナとして動かします。`docker-compose.yml`（または`docker-compose.release.yml`）に、既存の`web`/`api`サービスと並べて以下のサービスを追加してください：
   ```yaml
   services:
     # ... 既存の web, api, db, qdrant サービス ...
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel --config /etc/cloudflared/config.yml run
       volumes:
         - ~/.cloudflared:/etc/cloudflared:ro
       depends_on: [web, api]
   ```
   あとは`docker compose up -d cloudflared`で起動するだけです。これが唯一の外部からの入り口になるなら、`web`/`api`側に`80`/`443`/`8000`のポートマッピングは一切不要です（`cloudflared`がcomposeネットワーク上でサービス名を使って直接到達するため）。
4. ダッシュボード手順と同じ要領で、上記の表にある2つの`.env`設定を反映します。

ダッシュボード方式（トークンベースで、認証情報は自動生成）でもCLI方式（設定ファイルベースで、ingressルールを細かく制御可能）でも、コンテナとして動かす場合はどちらも同様に機能します。管理のしやすさで好きな方を選んでください。どちらの方法も「1つのHTTPSドメインに集約し、APIのポートを公開しない」という同じゴールを達成します — Cloudflare Tunnelはルーター設定が一切不要な代わりに通信がCloudflare経由になり、自前のリバースプロキシは全てを自分のインフラ内に収められる代わりに証明書取得のため`80`/`443`の転送が必要です。

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

### 方式BをLinuxの常駐サービス（systemd）として動かす

再起動やクラッシュ後も自動復帰する、Dockerを使わないネイティブ構築にしたい場合は、上記の開発用コマンドの代わりにバックエンド・フロントエンドを`systemd`サービスとして動かしてください。まずフロントエンドを本番ビルドします：

```bash
cd apps/web
npm install
npm run build
```

`/etc/systemd/system/ine-api.service`を作成：

```ini
[Unit]
Description=Integrated Writers Editor - API
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/integrated_writers_editor/apps/api
Environment="PATH=/path/to/integrated_writers_editor/apps/api/.venv/bin"
ExecStart=/path/to/integrated_writers_editor/apps/api/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/ine-web.service`も同様に作成：

```ini
[Unit]
Description=Integrated Writers Editor - Web
After=network.target ine-api.service

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/integrated_writers_editor/apps/web
Environment="NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`NEXT_PUBLIC_API_URL`はここでは`npm run build`時に焼き込まれます（上記のCORS/ドメインに関する注意と同じ制約）。値を変える場合は再ビルドしてください。設定後、両方を有効化・起動します：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ine-api.service ine-web.service
sudo systemctl status ine-api.service ine-web.service
journalctl -u ine-api.service -f   # ログを追跡
```

公開ドメインで運用する場合は、前段にnginxを立ててください（上記のDocker Compose版のリバースプロキシの説明と同じ考え方です。ポート一覧は[requirements.ja.md](requirements.ja.md)参照）：

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

続けて[Certbot](https://certbot.eff.org/)で無料のTLS証明書を取得します：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

## 4. 初回ログイン

初回起動時、`.env`の`ADMIN_USERNAME`（デフォルト`admin`）と`ADMIN_PASSWORD`で1つ目の管理者アカウントが自動作成されます。ユーザー名`admin`と設定した`ADMIN_PASSWORD`でログインしてください。追加のユーザーアカウントは、ログイン後の 設定 > ユーザー管理 タブから管理者が作成できます。

ログイン画面のGoogle/GitHubボタンは、`.env`に`GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID`等のOAuth2設定がある場合のみ有効になります（設定項目とプロバイダー側での登録方法は`.env.example`内のコメントを参照）。未設定の場合は無効のままで、上記の管理者パスワードでのログインのみ使えます。

## 5. 動作確認

- `GET http://localhost:8000/api/v1/health` が `{"status":"ok",...}` を返すこと（このエンドポイントはログイン不要）。
- 新規データベースで初めてログインした際、ダッシュボードにデモ作品（「恐竜時代文明開拓記 DEMO」）が表示されること。
- バックエンドのテスト：`cd apps/api && pytest -q`（執筆時点で52件）。
- フロントエンドのビルド/lint：`cd apps/web && npm run lint && npm run build`。

## データベースの初期化（全データを削除して作り直す）

⚠️ **この操作は元に戻せません。** プロジェクト・記事・ユーザーアカウントなど、データベース内の全データが失われます。必要であれば先に`scripts/backup.sh`や`pg_dump`でバックアップを取ってください。

スキーマは[Alembic](https://alembic.sqlalchemy.org/)が管理しており、マイグレーション自体は`api`コンテナ起動時に自動実行されます（詳細は[MIGRATION.md](../MIGRATION.md)を参照）。データベースを空の状態から作り直すには：

1. スキーマを空にします（データベース自体は削除せず、中身だけ空にします）：

   ```bash
   docker compose -f docker-compose.release.yml run --rm api python -c "
   from sqlalchemy import create_engine, text
   from app.config import settings
   e = create_engine(settings.database_url)
   with e.begin() as c:
       c.execute(text('DROP SCHEMA public CASCADE'))
       c.execute(text('CREATE SCHEMA public'))
   print('schema reset')
   "
   ```
2. マイグレーションを最初から実行し、全テーブルを再作成します：

   ```bash
   docker compose -f docker-compose.release.yml run --rm api alembic upgrade head
   ```
3. 通常通り起動します。起動時に管理者アカウント（`.env`の`ADMIN_USERNAME`/`ADMIN_PASSWORD`）とデモ作品が自動的に再生成されます：

   ```bash
   docker compose -f docker-compose.release.yml up -d api
   ```

外部（リモート）のPostgreSQLを使っている場合も同じ手順で動作します（`docker compose`のDBコンテナではなく、`DATABASE_URL`が指す先のスキーマをリセットします）。ビルドから動かしている場合は、上記の`docker-compose.release.yml`を`docker-compose.yml`に読み替えてください。

## トラブルシューティング

| 症状 | 想定される原因 |
|---|---|
| `docker compose up`が`ADMIN_PASSWORD`エラーで即失敗する | `.env.example`から`.env`を作成していない、または`ADMIN_PASSWORD`が未設定 |
| ダッシュボードが「確認中...」「起動中...」のまま固まる | `NEXT_PUBLIC_API_URL`にAPIが到達できていない、またはログインできていない（ブラウザのネットワークタブで401か接続エラーかを確認） |
| AIリクエストがすぐに接続エラーで失敗する | Ollamaが起動していない、または`OLLAMA_URL`が誤っている（`http://host.docker.internal:11434`はWindows/macOSのDocker内からのみ解決可能。Linuxではホストのアドレスを別途指定するか、Ollamaを同じComposeネットワークで動かしてください） |
| `api`コンテナ起動時に`relation "projects" already exists`エラー | このプロジェクトがAlembic導入前に作られた古いPostgresボリュームが残っています。`docker compose down -v`でリセット（**全データ削除**）するか、データを残したい場合はそのDBに対して手動で`alembic stamp head`を実行してください |
| 検索が常に「全文一致 (PostgreSQL フォールバック)」になる | `QDRANT_URL`にQdrantが到達できていません。セマンティック検索は失敗時に単純な`ILIKE`一致検索へ自動的に切り替わります |
