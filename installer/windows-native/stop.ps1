# Stops all four INE background processes started by launch.ps1 (Postgres,
# Qdrant, the API, and the web server) — no data is deleted; pgdata/
# qdrant-storage persist for next launch. Mirrors installer/windows/
# stop.ps1's intent (`docker compose down`), adapted to killing the actual
# bundled Windows processes by PID.

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Windows.Forms
Set-Location $PSScriptRoot

$root   = $PSScriptRoot
$runDir = Join-Path $root "run"

function Stop-TrackedProcess([string]$name, [string]$pidFile) {
    if (-not (Test-Path $pidFile)) {
        Write-Host "  $name : no PID file, assuming not running"
        return
    }
    $procId = Get-Content $pidFile -ErrorAction SilentlyContinue
    if (-not $procId) { Remove-Item $pidFile -ErrorAction SilentlyContinue; return }
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Host "  $name : process $procId already gone"
        Remove-Item $pidFile -ErrorAction SilentlyContinue
        return
    }
    Write-Host "  $name : stopping process $procId..."
    try {
        # Try a graceful close first (works for console-subsystem apps
        # like qdrant.exe/node.exe/python.exe that honor Ctrl+Break-style
        # shutdown); fall back to a hard kill if it doesn't exit in time.
        $proc.CloseMainWindow() | Out-Null
        if (-not $proc.WaitForExit(5000)) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Write-Host "Stopping INE..."

# Web and API are plain tracked-PID processes.
Stop-TrackedProcess "web server" (Join-Path $runDir "web.pid")
Stop-TrackedProcess "API server" (Join-Path $runDir "api.pid")
Stop-TrackedProcess "Qdrant"     (Join-Path $runDir "qdrant.pid")

# Postgres is stopped via pg_ctl (not a raw PID kill) so it shuts down
# cleanly and flushes to disk — pg_ctl itself tracks the postmaster PID
# inside pgdata\postmaster.pid.
$pgDataDir = Join-Path $root "pgdata"
$pgCtl = Join-Path $root "runtime\postgres\bin\pg_ctl.exe"
if (Test-Path $pgDataDir) {
    Write-Host "  PostgreSQL : stopping via pg_ctl..."
    & $pgCtl -D $pgDataDir -m fast stop 2>$null
} else {
    Write-Host "  PostgreSQL : no data directory, assuming not running"
}

[System.Windows.Forms.MessageBox]::Show("INE has been stopped. Your data is preserved.", "Integrated writers Editor (INE)") | Out-Null
