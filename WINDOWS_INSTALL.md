# Integrated writers Editor (INE) — Windows Installers

There are **two separate Windows `.exe` installers**, covering different tradeoffs. Pick one —
they install to different locations and don't interact with each other.

| | [`installer/windows/`](installer/windows/) | [`installer/windows-native/`](installer/windows-native/) |
|---|---|---|
| Prerequisites | Docker Desktop | **None** |
| What it bundles | Nothing — pulls prebuilt images at first run | Node.js, an embeddable Python, Qdrant, PostgreSQL, plus this repo's own `api`/`web` code |
| Download size | Small installer, images pulled on first run | Large (bundles several runtimes) |
| Best for | Anyone already using Docker, or wanting the same setup as the Linux/macOS deploy | A machine with no Docker/Node/Python/Postgres installed at all, or where installing Docker Desktop isn't an option |

Both create a Start Menu / Desktop shortcut that runs a `launch.ps1` script, and a matching
`stop.ps1`. Both generate a random `ADMIN_PASSWORD` on first run and show it in a message box
(saved into a local `.env` you can also edit later — see [docs/installation.md](docs/installation.md)
for what each `.env` variable does).

## Docker-based installer (`installer/windows/`)

- `build.ps1` — packages `docker-compose.yml`, `.env.example`, and the Inno Setup script
  (`ine.iss`) into the installer. Doesn't bundle any images itself.
- `launch.ps1` — checks for Docker Desktop (shows an error with a download link if missing),
  waits for the Docker engine to be ready, generates `.env` on first run, then runs
  `docker compose -f docker-compose.yml up -d` — exactly the same compose file used on
  Linux/macOS.
- `stop.ps1` — `docker compose down`.

### Building it

Prerequisites, once, on a Windows machine:

```powershell
winget install -e --id Git.Git
winget install -e --id JRSoftware.InnoSetup
# (or: choco install git innosetup)
```

Make sure `iscc.exe` (Inno Setup's compiler) ends up on `PATH` — the installer above normally
adds it under `C:\Program Files (x86)\Inno Setup 6\`; add that folder to `PATH` if
`iscc.exe`/`ISCC.exe` isn't found in a fresh terminal.

Then, from a clone of this repo:

```powershell
git clone https://github.com/itanaka66/integrated_writers_editor.git
cd integrated_writers_editor
./installer/windows/build.ps1
```

This compiles `ine.iss` (which packages `docker-compose.release.yml`, `.env.example`, and
`launch.ps1`/`stop.ps1`) into `dist/INE-Setup-<version>.exe` — that one file is the installer;
hand it to anyone with Docker Desktop already installed.

It does **not** build any Docker images itself — those are published to GHCR by
[`docker-publish.yml`](.github/workflows/docker-publish.yml) (`docker-compose.release.yml`,
bundled into the installer, just pulls them at first launch). Run that workflow (or push a
version tag, which triggers it automatically) before shipping an installer built from this
script, or the freshly-installed app will have nothing to pull on first launch.

## Docker-free installer (`installer/windows-native/`)

Runs everything as plain Windows background processes instead of containers — no Docker Desktop,
no separately-installed Node/Python/PostgreSQL/Qdrant.

### What gets bundled

Built by [`bundle.ps1`](installer/windows-native/bundle.ps1), which downloads and stages:

- **Node.js** (portable zip from nodejs.org) — runs the Next.js frontend, built with
  `output: "standalone"` so only a pruned `node_modules` + `server.js` are needed, not the full
  dev toolchain.
- **Python embeddable package** (from python.org, matching `apps/api/Dockerfile`'s Python
  version) — bootstrapped with `pip` and `apps/api/requirements.txt` installed into it, so it
  runs the FastAPI backend exactly like the Docker image does.
- **Qdrant** (official portable Windows build from the `qdrant/qdrant` GitHub releases).
- **PostgreSQL** (EnterpriseDB's plain zip binaries — see the long comment at the top of
  `bundle.ps1` for exactly which URL/version and why; this is the least standardized of the
  four downloads and the one most likely to need attention if it ever breaks).

Each pinned version and its exact source URL is documented in comments at the top of
`bundle.ps1` — check there before bumping any of them, and keep the Python version in sync with
`apps/api/Dockerfile`'s `FROM python:3.13-slim` line so the two deployment paths behave
identically.

### How it runs (`launch.ps1` / `stop.ps1`)

Ports (all `localhost`-only, chosen to avoid clashing with anything you might already have
running):

| Service | Port |
|---|---|
| PostgreSQL (bundled) | `5433` (not Postgres's usual `5432`) |
| Qdrant | `6333` (Qdrant's own default) |
| FastAPI backend | `8000` |
| Next.js frontend | `3000` |
| Ollama | `11434` (expects an Ollama you already have running locally — see [docs/requirements.md](docs/requirements.md); this installer does not bundle Ollama itself) |

On first launch, `launch.ps1`:

1. Runs `initdb` against a local data directory (only if it doesn't exist yet) and creates the
   `ine` role/database.
2. Starts PostgreSQL (`pg_ctl start`), Qdrant, the FastAPI backend (running
   `alembic upgrade head` first, then `uvicorn app.main:app` — the same order as
   `apps/api/Dockerfile`'s `CMD`, so schema migrations are applied automatically every launch;
   see [MIGRATION.md](MIGRATION.md)), and the Next.js standalone server — each as a tracked
   background process (PID files under `run/`, logs under `logs/`), so closing the PowerShell
   window doesn't kill them.
3. Generates `.env` with a random `ADMIN_PASSWORD` and shows it in a message box.
4. Waits for `http://localhost:3000` to respond, then opens it in the default browser.

`stop.ps1` reads the PID files and stops each process gracefully (Postgres via
`pg_ctl -m fast stop`; the others via a close-then-wait-then-force-kill sequence), then cleans
up `run/`.

Uninstalling asks first before deleting the local PostgreSQL/Qdrant data directories — your
projects aren't wiped by an uninstall unless you confirm that.

### Building it

`bundle.ps1` downloads several hundred MB (Node, Python, Qdrant, PostgreSQL) and isn't something
to run repeatedly by hand — the primary way to build this installer is CI, not a local machine:

**Option 1 — GitHub Actions (recommended):** push a version tag (e.g. `v1.2.0`), or trigger
[`build-native-windows-installer.yml`](.github/workflows/build-native-windows-installer.yml)
manually from the Actions tab (`workflow_dispatch`) — same trigger style as `docker-publish.yml`.
It runs on a `windows-latest` runner, does everything below for you, and uploads/releases the
resulting installer as a build artifact. No local Windows machine needed at all.

**Option 2 — a real Windows machine.** Prerequisites, once:

```powershell
winget install -e --id Git.Git
winget install -e --id Python.Python.3.13
winget install -e --id JRSoftware.InnoSetup
# (or: choco install git python innosetup)
```

(Git is needed because `pip` must resolve `apps/api/requirements.txt`'s
`editor-common @ git+https://...` dependency; a local Python isn't strictly required to *run*
the bundled app — the embeddable Python is what actually ships — but `bundle.ps1` uses a local
`pip`/`python` to bootstrap the embeddable one.)

Then, from a clone of this repo:

```powershell
git clone https://github.com/itanaka66/integrated_writers_editor.git
cd integrated_writers_editor
./installer/windows-native/build.ps1
```

Expect this to take several minutes (multiple large downloads). It runs `bundle.ps1` (stages
Node/Python/Qdrant/PostgreSQL plus this repo's `api`/`web` code into `dist-native/`) followed by
`ISCC.exe` (compiles `ine-native.iss` against that staged directory), producing
`dist/INE-Native-Setup-<version>.exe` — that one file is the installer; hand it to anyone,
regardless of what they have installed.

`bundle.ps1` caches each downloaded archive under a download folder and skips re-fetching a file
that's already there, so re-running `build.ps1` after only touching a script (not
`apps/api`/`apps/web` source) is much faster the second time. Delete that cache (or the whole
staging directory `bundle.ps1` builds into) first if you want a guaranteed-clean rebuild from
scratch.

### Known limitations / what to double-check before relying on this

This installer's scripts were written carefully against each vendor's real, current download
URLs, and the Next.js `output: "standalone"` build was verified to actually run and serve
traffic — but the full bundle-and-install pipeline has **not** been run end-to-end on a real
Windows machine (no Inno Setup / practical multi-hundred-MB downloads in the environment that
wrote it). Before treating a built installer as production-ready:

- Confirm `bundle.ps1` actually completes against live downloads, especially the PostgreSQL
  step — EnterpriseDB's plain-zip binaries aren't served through a stable, documented API the
  way Node/Python/Qdrant's are (see the comment in `bundle.ps1` for details), so this is the
  step most likely to need adjustment if a URL pattern changes.
- ~~Confirm `pip install -r apps/api/requirements.txt` succeeds against the actual **embeddable**
  Python distribution~~ — tested on a real machine: it initially failed with
  `No module named pip` on the `-m pip install -r requirements.txt` step, even though
  `get-pip.py` itself reported success just before it. Root cause: uncommenting `import site` in
  the embeddable distribution's `._pth` file isn't enough by itself — that file also needs an
  explicit `Lib\site-packages` line, or nothing after `get-pip.py` can actually find where pip
  was installed. Fixed in `bundle.ps1`; if you hit this again, that's the first place to check.
  A second real-machine run then hit `BackendUnavailable: Cannot import 'setuptools.build_meta'`
  while building `editor-common` from its git source (the embeddable distribution ships with
  neither `setuptools` nor `wheel`, needed as the build backend for a VCS dependency with no
  prebuilt wheel) — also fixed in `bundle.ps1`, by installing `setuptools`/`wheel` right after
  `get-pip.py` and before installing `requirements.txt`.
- Run `launch.ps1` and `stop.ps1` on a real machine and confirm every process actually starts,
  serves traffic, and stops cleanly (`stop.ps1`'s close/force-kill sequence for `qdrant.exe`/
  `node.exe`/`python.exe` in particular).
