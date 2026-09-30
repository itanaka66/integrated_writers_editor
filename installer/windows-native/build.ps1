# Build the fully self-contained ("native", no Docker) Windows .exe
# installer end-to-end: bundle.ps1 downloads/stages the runtimes, then
# Inno Setup packages dist-native\ into a single installer.
#
#   installer\windows-native\build.ps1
#
# Output: dist\INE-Native-Setup-<version>.exe
#
# Requires:
#   - Windows
#   - Git (for pip to resolve requirements.txt's git+https dependency)
#   - Inno Setup 6 (iscc.exe on PATH)
#
# This downloads several hundred MB (Node, Python, Qdrant, PostgreSQL) on
# first run — expect it to take a few minutes. See bundle.ps1 for what
# gets downloaded from where.

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
Push-Location $scriptDir

try {
    Write-Host "==> Bundling runtimes and building the app (bundle.ps1)" -ForegroundColor Cyan
    & (Join-Path $scriptDir "bundle.ps1")

    $iscc = Get-Command iscc -ErrorAction SilentlyContinue
    if (-not $iscc) {
        throw "iscc.exe not found. Install Inno Setup 6 (https://jrsoftware.org/isinfo.php)"
    }

    Write-Host ""
    Write-Host "==> Compiling the installer (Inno Setup)" -ForegroundColor Cyan
    & $iscc.Source "ine-native.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }

    Write-Host ""
    Write-Host "Done: dist\" -ForegroundColor Green
    Get-ChildItem "..\..\dist\INE-Native-Setup-*.exe" | ForEach-Object { Write-Host "  $($_.Name)" }
} finally {
    Pop-Location
}
