# Starts INE fully natively — no Docker — using the runtimes/binaries
# bundled by bundle.ps1 into this installed app's `runtime\` folder:
# Postgres, Qdrant, the bundled Python (FastAPI/uvicorn), and the bundled
# Node.js (Next.js standalone server). Each runs as a real background
# Windows process (Start-Process, output redirected to log files) so
# closing this PowerShell window does NOT stop the app — mirroring the
# UX of installer/windows/launch.ps1 (Docker path), just without Docker.
#
# Run from the installed app folder (the Start Menu / Desktop shortcut
# does this for you) — it assumes runtime\, api\, web\, and .env(.example)
# all live next to this script, as bundle.ps1 + ine-native.iss lay them out.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

$root = $PSScriptRoot
Set-Location $root

$logsDir = Join-Path $root "logs"
$runDir  = Join-Path $root "run"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path $runDir  | Out-Null

$pgDataDir = Join-Path $root "pgdata"
$pgBin     = Join-Path $root "runtime\postgres\bin"
$pgPort    = 5433

function Show-Message([string]$text, [string]$title = "Integrated writers Editor (INE)") {
    [System.Windows.Forms.MessageBox]::Show($text, $title) | Out-Null
}

function Show-ErrorAndExit([string]$text) {
    Show-Message $text
    exit 1
}

# ---------------------------------------------------------------------
# .env / first-run admin password (same approach as installer/windows's
# Docker launch.ps1: copy .env.example -> .env, generate a random
# ADMIN_PASSWORD, show it once in a MessageBox).
# ---------------------------------------------------------------------
$firstRun = -not (Test-Path ".env")
if ($firstRun) {
    Copy-Item ".env.example" ".env"
    $chars = (48..57) + (65..90) + (97..122)
    $password = -join ((1..20) | ForEach-Object { [char]($chars | Get-Random) })
    (Get-Content ".env") -replace '^ADMIN_PASSWORD=.*$', "ADMIN_PASSWORD=$password" | Set-Content ".env"
}

# Load .env into this process's environment so the uvicorn/node children
# (which inherit it) see DATABASE_URL/QDRANT_URL/etc. without needing a
# separate .env loader for each — pydantic-settings also reads .env
# directly for the API, this just additionally covers the web process.
Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
}

# ---------------------------------------------------------------------
# 1. PostgreSQL — initdb on first run, then start
# ---------------------------------------------------------------------
Write-Host "Starting PostgreSQL..."
if (-not (Test-Path $pgDataDir)) {
    Write-Host "  First run: initializing PostgreSQL data directory..."
    $initdb = Join-Path $pgBin "initdb.exe"
    # -U postgres: a fixed superuser we only use locally to bootstrap the
    # `ine` role/database below; the app itself connects as `ine`.
    & $initdb -D $pgDataDir -U postgres -E UTF8 --locale=C -A trust
    if ($LASTEXITCODE -ne 0) { Show-ErrorAndExit "PostgreSQL initdb failed. See $logsDir for details." }
}

$pgCtl = Join-Path $pgBin "pg_ctl.exe"
$pgLog = Join-Path $logsDir "postgres.log"
& $pgCtl -D $pgDataDir -l $pgLog -o "-p $pgPort" -w start
if ($LASTEXITCODE -ne 0) { Show-ErrorAndExit "PostgreSQL failed to start. See $pgLog for details." }
# pg_ctl manages its own postmaster PID file (pgdata\postmaster.pid) —
# stop.ps1 uses `pg_ctl stop` directly rather than a separately tracked
# PID, since that's the correct/safe way to stop Postgres.

if ($firstRun) {
    Write-Host "  Creating the 'ine' role/database..."
    $psql = Join-Path $pgBin "psql.exe"
    $env:PGPASSWORD = ""
    & $psql -h localhost -p $pgPort -U postgres -d postgres -c "CREATE ROLE ine LOGIN PASSWORD 'ine';" 2>$null
    & $psql -h localhost -p $pgPort -U postgres -d postgres -c "CREATE DATABASE ine OWNER ine;" 2>$null
}

# ---------------------------------------------------------------------
# 2. Qdrant
# ---------------------------------------------------------------------
Write-Host "Starting Qdrant..."
$qdrantExe = Join-Path $root "runtime\qdrant\qdrant.exe"
$qdrantStorage = Join-Path $root "qdrant-storage"
New-Item -ItemType Directory -Force -Path $qdrantStorage | Out-Null
$env:QDRANT__STORAGE__STORAGE_PATH = $qdrantStorage
$qdrantOut = Join-Path $logsDir "qdrant.out.log"
$qdrantErr = Join-Path $logsDir "qdrant.err.log"
$qdrantProc = Start-Process -FilePath $qdrantExe -WorkingDirectory (Split-Path $qdrantExe) `
    -RedirectStandardOutput $qdrantOut -RedirectStandardError $qdrantErr `
    -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $runDir "qdrant.pid") -Value $qdrantProc.Id

# ---------------------------------------------------------------------
# 3. FastAPI backend — migrate then serve, every launch (mirrors
#    apps/api/Dockerfile's `CMD alembic upgrade head && uvicorn ...`,
#    per this repo's MIGRATION.md: migrations always run before the
#    server comes up, on every start, not just on upgrade).
# ---------------------------------------------------------------------
Write-Host "Running database migrations..."
$pythonExe = Join-Path $root "runtime\python\python.exe"
$apiDir    = Join-Path $root "api"
$migrateLog = Join-Path $logsDir "migrate.log"
Push-Location $apiDir
try {
    & $pythonExe -m alembic upgrade head *> $migrateLog
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Show-ErrorAndExit "Database migration failed. See $migrateLog for details."
    }
} finally {
    if ((Get-Location).Path -eq $apiDir) { Pop-Location }
}

Write-Host "Starting the API server..."
$apiOut = Join-Path $logsDir "api.out.log"
$apiErr = Join-Path $logsDir "api.err.log"
$apiProc = Start-Process -FilePath $pythonExe `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory $apiDir `
    -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr `
    -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $runDir "api.pid") -Value $apiProc.Id

# ---------------------------------------------------------------------
# 4. Next.js standalone server
# ---------------------------------------------------------------------
Write-Host "Starting the web server..."
$nodeExe = Join-Path $root "runtime\node\node.exe"
$webDir  = Join-Path $root "web"
$env:PORT = "3000"
$webOut = Join-Path $logsDir "web.out.log"
$webErr = Join-Path $logsDir "web.err.log"
$webProc = Start-Process -FilePath $nodeExe -ArgumentList "server.js" `
    -WorkingDirectory $webDir `
    -RedirectStandardOutput $webOut -RedirectStandardError $webErr `
    -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $runDir "web.pid") -Value $webProc.Id

# ---------------------------------------------------------------------
# Wait for the web app to answer, then open the browser
# ---------------------------------------------------------------------
if ($firstRun) {
    Show-Message "First run: generated an admin password:`n`n$password`n`nSaved to $root\.env — you can change it later."
}

Write-Host "Waiting for the app to come up..."
$deadline = (Get-Date).AddMinutes(3)
$up = $false
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $up = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}

Start-Process "http://localhost:3000"
if (-not $up) {
    Show-Message "Startup was triggered but the app isn't responding yet. Check the log files under $logsDir (api.err.log / web.err.log / postgres.log / qdrant.err.log) if this persists, then reload the browser tab."
}
