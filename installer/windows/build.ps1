# Build the Windows .exe installer.
#
#   installer\windows\build.ps1
#
# Output: dist\INE-Setup-<version>.exe
#
# Requires:
#   - Windows
#   - Inno Setup 6 (iscc.exe on PATH)
#
# This script does not build Docker images — those are published to GHCR by
# .github/workflows/docker-publish.yml, and docker-compose.release.yml
# (bundled into the installer) just pulls them. Run that workflow (or push a
# version tag) before shipping an installer built from this script, or the
# resulting app will have nothing to pull on first launch.

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
Push-Location $scriptDir

try {
    $iscc = Get-Command iscc -ErrorAction SilentlyContinue
    if (-not $iscc) {
        throw "iscc.exe が見つかりません。Inno Setup 6 を導入してください / install Inno Setup 6 (https://jrsoftware.org/isinfo.php)"
    }

    Write-Host "==> インストーラを作成しています / Building the installer" -ForegroundColor Cyan
    & $iscc.Source "ine.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }

    Write-Host ""
    Write-Host "完了 / Done: dist\" -ForegroundColor Green
    Get-ChildItem "..\..\dist\*.exe" | ForEach-Object { Write-Host "  $($_.Name)" }
} finally {
    Pop-Location
}
