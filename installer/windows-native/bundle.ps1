# Builds a fully self-contained `dist/` staging directory for the
# Docker-free Windows installer (installer/windows-native/ine-native.iss
# packages whatever this script produces).
#
# Unlike installer/windows/ (which just ships a docker-compose.yml that
# pulls prebuilt images — Docker Desktop is a hard prerequisite there),
# this script downloads and stages portable/embeddable runtimes for
# Node.js, Python, Qdrant, and PostgreSQL, plus this repo's own api/web
# code, so the resulting installer needs NOTHING pre-installed on the
# target machine.
#
# Meant to run on a Windows GitHub Actions runner (see
# .github/workflows/build-native-windows-installer.yml) — it downloads
# several hundred MB and is not something you want to run repeatedly by
# hand, but it works fine on a real Windows dev machine too.
#
# ---------------------------------------------------------------------
# Pinned external binary versions/URLs — update these when bumping:
#
#   NODE:     https://nodejs.org/dist/ — official Windows x64 zip. Picked
#             to match this repo's actual `next`/React deps (apps/web has
#             no `engines` field or .nvmrc; docs/README's "Option B" table
#             lists "Node.js 22", and @types/node is pinned to 22.x, so we
#             track Node 22 LTS ("Jod")). Current pin: 22.23.3 (verified
#             real via https://nodejs.org/dist/index.json on 2026-09-30 —
#             latest 22.x LTS release at the time this script was written).
#             Bump by changing $NodeVersion below; re-check
#             https://nodejs.org/dist/index.json for the current 22.x LTS
#             (or a later LTS line, once this repo's deps require it).
#
#   PYTHON:   https://www.python.org/ftp/python/ — official "embeddable
#             package" zip (NOT the full installer — this is a minimal,
#             xcopy-deployable Python meant exactly for embedding into
#             another app). Version matches apps/api/Dockerfile's
#             `FROM python:3.13-slim`. Pin: 3.13.15 (latest 3.13.x patch
#             as of 2026-09-30 per https://www.python.org/ftp/python/).
#             Bump both this script's $PythonVersion and the Dockerfile's
#             FROM line together so behavior stays identical between the
#             Docker and native-installer paths.
#
#   QDRANT:   https://github.com/qdrant/qdrant/releases — official
#             portable Windows build, asset name
#             `qdrant-x86_64-pc-windows-msvc.zip`. Pin: v1.19.1 (latest
#             GitHub release as of 2026-09-30 per the GitHub releases API).
#             Bump $QdrantVersion; asset naming has been stable across
#             releases.
#
#   POSTGRES: PostgreSQL itself does not publish an official "just unzip
#             it" archive for Windows the way Node/Python/Qdrant do — the
#             only official Windows distribution is the interactive
#             installer (also built by EDB). EnterpriseDB (who builds the
#             official Windows/Mac PostgreSQL installers used by
#             postgresql.org itself) separately publishes the same
#             binaries as plain zip archives, documented at
#             https://www.enterprisedb.com/download-postgresql-binaries
#             ("provided as a convenience for expert users... to extract
#             and use without running the installer"). Their current
#             download page serves these through a JS-driven file
#             picker (sbp.enterprisedb.com/getfile.jsp?fileid=...), which
#             is not stable/scriptable, but EDB's older direct-download
#             host still serves the same files at a predictable URL
#             pattern: https://get.enterprisedb.com/postgresql/postgresql-<version>-<rev>-windows-x64-binaries.zip
#             This was confirmed live on 2026-09-30 (the URL resolved to
#             a large binary download, not a 404/HTML page) for
#             postgresql-17.11-1-windows-x64-binaries.zip. Pin: 17.11
#             (matches README's "Option B" table: "PostgreSQL 17").
#             THIS IS THE SHAKIEST DEPENDENCY IN THIS SCRIPT: it is an
#             undocumented/legacy URL pattern, not a stable published
#             API, and EDB could change or remove it without notice. If
#             this download starts failing, first check
#             https://www.enterprisedb.com/download-postgresql-binaries
#             for the current officially-linked zip URL and update
#             $PostgresZipUrl below. Do not substitute a random
#             third-party mirror — these binaries run as a real Postgres
#             server holding user data, so provenance matters.
#             No installer/service is used: this script only runs
#             `initdb` + `pg_ctl`/`postgres.exe` directly against the zip
#             contents at launch time (see launch.ps1), exactly the
#             "expert users" workflow EDB describes.
# ---------------------------------------------------------------------

$ErrorActionPreference = "Stop"

$RepoRoot   = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$DistDir    = Join-Path $RepoRoot "dist-native"
$DownloadDir = Join-Path $env:TEMP "ine-native-bundle-downloads"

$NodeVersion     = "22.23.3"
$PythonVersion   = "3.13.15"
$QdrantVersion   = "1.19.1"
$PostgresVersion = "17.11-1"

$NodeZipUrl     = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
$PythonZipUrl   = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$GetPipUrl      = "https://bootstrap.pypa.io/get-pip.py"
$QdrantZipUrl   = "https://github.com/qdrant/qdrant/releases/download/v$QdrantVersion/qdrant-x86_64-pc-windows-msvc.zip"
$PostgresZipUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PostgresVersion-windows-x64-binaries.zip"

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Get-FileCached([string]$Url, [string]$OutFile) {
    if (Test-Path $OutFile) {
        Write-Host "    (cached) $OutFile"
        return
    }
    Write-Host "    downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DistDir "runtime") | Out-Null

# ------------------------------------------------------------------
# 1. Node.js portable runtime
# ------------------------------------------------------------------
Write-Step "Node.js v$NodeVersion (portable runtime for the web frontend)"
$nodeZip = Join-Path $DownloadDir "node-v$NodeVersion-win-x64.zip"
Get-FileCached -Url $NodeZipUrl -OutFile $nodeZip

$nodeExtractTmp = Join-Path $DownloadDir "node-extract"
if (Test-Path $nodeExtractTmp) { Remove-Item -Recurse -Force $nodeExtractTmp }
Expand-Archive -Path $nodeZip -DestinationPath $nodeExtractTmp -Force

$nodeDistDir = Join-Path $DistDir "runtime\node"
if (Test-Path $nodeDistDir) { Remove-Item -Recurse -Force $nodeDistDir }
New-Item -ItemType Directory -Force -Path $nodeDistDir | Out-Null
# The zip's top-level `node-v<ver>-win-x64\` folder also bundles npm,
# corepack, and npm's OWN node_modules tree — none of which this app
# needs (the standalone Next.js server only ever runs `node server.js`,
# never `npm`). Copying the whole folder dragged that deeply-nested
# node_modules tree into dist-native\, and several of those paths
# combined with this repo's own path depth exceeded Windows's 260-char
# MAX_PATH, which made Inno Setup's compiler fail with "指定されたパスが
# 見つかりません" ("the specified path was not found") while compressing
# them — confirmed by hand against a real Windows machine. The official
# Windows x64 node.exe is self-contained (no sibling DLLs required), so
# copy just that one file.
$nodeSrc = Get-ChildItem $nodeExtractTmp -Directory | Select-Object -First 1
Copy-Item -Path (Join-Path $nodeSrc.FullName "node.exe") -Destination $nodeDistDir -Force

# ------------------------------------------------------------------
# 2. Python embeddable runtime + pip + api requirements
# ------------------------------------------------------------------
Write-Step "Python $PythonVersion embeddable runtime (for the FastAPI backend)"
$pyZip = Join-Path $DownloadDir "python-$PythonVersion-embed-amd64.zip"
Get-FileCached -Url $PythonZipUrl -OutFile $pyZip

$pyDistDir = Join-Path $DistDir "runtime\python"
if (Test-Path $pyDistDir) { Remove-Item -Recurse -Force $pyDistDir }
New-Item -ItemType Directory -Force -Path $pyDistDir | Out-Null
Expand-Archive -Path $pyZip -DestinationPath $pyDistDir -Force

# The embeddable distribution ships with a `pythonXY._pth` file that, by
# default, EXCLUDES `site` (so `site-packages`/pip aren't importable at
# all) AND only lists the interpreter's own zip/stdlib paths — it does
# NOT list `Lib\site-packages` at all. Uncommenting `import site` alone
# is not enough: get-pip.py itself still works afterward (it unpacks a
# bundled pip wheel and manipulates sys.path directly, without needing
# site-packages to already be on the path), which is why that step can
# report success — but every *subsequent* `python.exe -m pip ...`
# invocation then fails with "No module named pip", because the
# interpreter's sys.path still has no route to where pip was actually
# installed. Confirmed by hand against a real Windows machine — this
# fix (appending an explicit `Lib\site-packages` line) resolved it.
$pthFile = Get-ChildItem $pyDistDir -Filter "python*._pth" | Select-Object -First 1
if (-not $pthFile) { throw "Could not find python*._pth in the embeddable package — layout may have changed." }
(Get-Content $pthFile.FullName) -replace '^#\s*import site', 'import site' | Set-Content $pthFile.FullName
Add-Content -Path $pthFile.FullName -Value "Lib\site-packages"
Write-Host "    enabled 'import site' and added Lib\site-packages in $($pthFile.Name)"

Write-Step "Bootstrapping pip into the embedded interpreter"
$getPip = Join-Path $DownloadDir "get-pip.py"
Get-FileCached -Url $GetPipUrl -OutFile $getPip
$pyExe = Join-Path $pyDistDir "python.exe"
& $pyExe $getPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "get-pip.py failed against the embedded interpreter" }

# The embeddable distribution ships with neither `setuptools` nor `wheel`.
# Installing prebuilt wheels from PyPI doesn't need them, but
# requirements.txt's `editor-common @ git+https://...` dependency has no
# prebuilt wheel — pip must build it from its cloned source, and the
# default build backend for a plain setup.py/setup.cfg package is
# `setuptools.build_meta`. Without setuptools installed first, that build
# fails with `BackendUnavailable: Cannot import 'setuptools.build_meta'`
# (confirmed by hand against a real Windows machine).
Write-Step "Installing setuptools/wheel (build backend for the git+https dependency)"
& $pyExe -m pip install --no-warn-script-location setuptools wheel
if ($LASTEXITCODE -ne 0) { throw "pip install setuptools wheel failed" }

Write-Step "Installing apps/api/requirements.txt into the embedded interpreter"
# requirements.txt has a `git+https://...editor-common-module` VCS
# dependency, so `git` must be on PATH wherever bundle.ps1 itself runs
# (true on GitHub's windows-latest runners; if running this by hand,
# install Git for Windows first). This only affects the BUILD machine —
# the resulting dist/ has no VCS dependency at runtime, since pip already
# resolved and installed the package's actual files.
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    throw "git is required on PATH to resolve requirements.txt's git+https dependency (editor-common). Install Git for Windows and retry."
}
$requirementsPath = Join-Path $RepoRoot "apps\api\requirements.txt"
& $pyExe -m pip install --no-warn-script-location -r $requirementsPath
if ($LASTEXITCODE -ne 0) { throw "pip install -r requirements.txt failed" }
# psycopg2-binary (already in requirements.txt) ships its own bundled
# libpq, so no separate PostgreSQL client library needs to be on the
# target machine at runtime — this is exactly why requirements.txt uses
# the *-binary variant instead of plain psycopg2.

# ------------------------------------------------------------------
# 3. Qdrant portable binary
# ------------------------------------------------------------------
Write-Step "Qdrant v$QdrantVersion (portable vector store binary)"
$qdrantZip = Join-Path $DownloadDir "qdrant-x86_64-pc-windows-msvc.zip"
Get-FileCached -Url $QdrantZipUrl -OutFile $qdrantZip

$qdrantDistDir = Join-Path $DistDir "runtime\qdrant"
if (Test-Path $qdrantDistDir) { Remove-Item -Recurse -Force $qdrantDistDir }
New-Item -ItemType Directory -Force -Path $qdrantDistDir | Out-Null
Expand-Archive -Path $qdrantZip -DestinationPath $qdrantDistDir -Force

# ------------------------------------------------------------------
# 4. PostgreSQL portable binaries (see the big comment at the top of
#    this file for why this particular URL/source was chosen)
# ------------------------------------------------------------------
Write-Step "PostgreSQL $PostgresVersion binaries (EnterpriseDB zip archive)"
$pgZip = Join-Path $DownloadDir "postgresql-$PostgresVersion-windows-x64-binaries.zip"
Get-FileCached -Url $PostgresZipUrl -OutFile $pgZip

$pgExtractTmp = Join-Path $DownloadDir "pg-extract"
if (Test-Path $pgExtractTmp) { Remove-Item -Recurse -Force $pgExtractTmp }
Expand-Archive -Path $pgZip -DestinationPath $pgExtractTmp -Force

$pgDistDir = Join-Path $DistDir "runtime\postgres"
if (Test-Path $pgDistDir) { Remove-Item -Recurse -Force $pgDistDir }
New-Item -ItemType Directory -Force -Path $pgDistDir | Out-Null
# EDB's zip contains a top-level `pgsql\` folder (bin/, lib/, share/, ...).
$pgSrc = Join-Path $pgExtractTmp "pgsql"
if (-not (Test-Path $pgSrc)) {
    # Fall back to "whatever single top-level directory exists" in case
    # EDB changes the folder name in a future archive.
    $pgSrc = (Get-ChildItem $pgExtractTmp -Directory | Select-Object -First 1).FullName
}
Copy-Item -Path (Join-Path $pgSrc "*") -Destination $pgDistDir -Recurse -Force
# Note: no `data\` directory is bundled here — launch.ps1 runs `initdb`
# against a local, writable data directory on first run (never inside
# Program Files, which is typically not writable by a non-admin user).

# ------------------------------------------------------------------
# 5. apps/api source, copied as-is (not a Docker image)
# ------------------------------------------------------------------
Write-Step "Copying apps/api source into dist/api"
$apiDistDir = Join-Path $DistDir "api"
if (Test-Path $apiDistDir) { Remove-Item -Recurse -Force $apiDistDir }
New-Item -ItemType Directory -Force -Path $apiDistDir | Out-Null
# Mirror exactly what apps/api/Dockerfile COPYs into the image: alembic
# config/scripts, and the app package itself. requirements.txt is not
# needed at runtime (already installed into dist/runtime/python above)
# but is copied too since it's small and useful for diagnostics.
Copy-Item (Join-Path $RepoRoot "apps\api\alembic.ini") $apiDistDir
Copy-Item (Join-Path $RepoRoot "apps\api\requirements.txt") $apiDistDir
Copy-Item -Recurse (Join-Path $RepoRoot "apps\api\alembic") (Join-Path $apiDistDir "alembic")
Copy-Item -Recurse (Join-Path $RepoRoot "apps\api\app") (Join-Path $apiDistDir "app")

# ------------------------------------------------------------------
# 6. apps/web — Next.js standalone build
# ------------------------------------------------------------------
Write-Step "Building apps/web with 'npm run build' (output: 'standalone')"
# apps/web/next.config.ts already sets `output: "standalone"` (added for
# this installer's benefit — confirmed harmless to the existing Docker
# build, which just runs `npm run build && npm start` and ignores the
# extra .next/standalone output it doesn't use).
Push-Location (Join-Path $RepoRoot "apps\web")
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally {
    Pop-Location
}

$webDistDir = Join-Path $DistDir "web"
if (Test-Path $webDistDir) { Remove-Item -Recurse -Force $webDistDir }
New-Item -ItemType Directory -Force -Path $webDistDir | Out-Null
$standaloneDir = Join-Path $RepoRoot "apps\web\.next\standalone"
Copy-Item -Path (Join-Path $standaloneDir "*") -Destination $webDistDir -Recurse -Force
# .next/standalone's own .next/ is missing the `static/` assets and the
# `public/` folder by design (Next.js excludes them from the traced
# output, expecting the deployer to copy them alongside) — copy both in.
Copy-Item -Recurse -Force (Join-Path $RepoRoot "apps\web\.next\static") (Join-Path $webDistDir ".next\static")
$publicDir = Join-Path $RepoRoot "apps\web\public"
if (Test-Path $publicDir) {
    Copy-Item -Recurse -Force $publicDir (Join-Path $webDistDir "public")
}

# ------------------------------------------------------------------
# 7. .env.example adapted for native (non-Docker) networking
# ------------------------------------------------------------------
Write-Step "Writing dist/.env.example (native networking)"
# See the inline comments in this generated file for exactly what
# changed vs. the repo-root .env.example and why.
$envExample = @'
# .env.example for the Docker-free "native" Windows installer
# (installer/windows-native/). Adapted from the repo-root .env.example —
# every setting below is unchanged EXCEPT where a comment says otherwise.
# launch.ps1 copies this to .env on first run and fills in ADMIN_PASSWORD.

POSTGRES_DB=ine
POSTGRES_USER=ine
POSTGRES_PASSWORD=ine
ADMIN_PASSWORD=writers

# CHANGED from the Docker .env.example: there is no `db` container/internal
# DNS name here, so this points at the bundled Postgres directly by
# 127.0.0.1. Also CHANGED: port 5433, not Postgres's usual 5432 — chosen
# so this bundled, installer-managed Postgres instance never collides with
# a full PostgreSQL install the user might already have running locally on
# the default port. launch.ps1 passes this same port to `initdb`/`pg_ctl`.
DATABASE_URL=postgresql+psycopg2://ine:ine@localhost:5433/ine

# CHANGED from the Docker .env.example: no `qdrant` container DNS name —
# the bundled Qdrant binary listens on localhost like any normal Windows
# process. Port is Qdrant's own default (6333), left unchanged since
# nothing else on a typical machine binds it.
QDRANT_URL=http://localhost:6333

# CHANGED from the Docker .env.example: the Docker version defaults to
# `http://host.docker.internal:11434` (a Docker-only DNS name that
# resolves to the host machine from inside a container). There is no
# container here, so this is plain localhost — identical to what you'd
# use running Ollama natively either way.
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b

# UNCHANGED: Ollama API key / cloud provider (Anthropic/OpenAI/Google) keys
# stay runtime-only, configured from Settings > Connections in the app, not
# via env vars — see the repo-root .env.example for details.

# UNCHANGED: still defaults to "*" for the same reason as the Docker
# version (the API already requires the admin password via Basic Auth).
CORS_ORIGINS=*

# UNCHANGED in meaning, but the default value now matches this installer's
# fixed local ports rather than the Docker Compose service's mapped ports
# (they happen to be the same for the web/API ports; only DATABASE_URL's
# port differs, and that's not part of a browser-facing URL anyway).
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# UNCHANGED: episode-mirror / git-autosync / backup / OAuth2 / SMTP options
# all behave identically to the Docker path — none of them are
# Docker-networking-specific. See the repo-root .env.example for the full
# documentation of each; omitted here only for brevity, not because they
# don't apply.
GIT_REMOTE_URL=
GIT_AUTOSYNC_INTERVAL_SECONDS=300
BACKUP_ENABLED=false
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_COUNT=7
'@
Set-Content -Path (Join-Path $DistDir ".env.example") -Value $envExample -Encoding utf8

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
Write-Step "Bundle complete: $DistDir"
Write-Host "Next: installer\windows-native\ine-native.iss (compiled with ISCC.exe) packages this directory."
