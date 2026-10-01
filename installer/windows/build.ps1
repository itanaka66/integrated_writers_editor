# Build the Windows .exe installer.
#
#   installer\windows\build.ps1
#
# Output: dist\INE-Setup-<version>.exe
#
# Requires:
#   - Windows
#   - Inno Setup 6, installed to its default location (its own installer
#     does not add ISCC.exe to PATH; this script looks there and in the
#     registry automatically, so PATH is only needed for a non-default
#     install location)
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
    # Inno Setup's own installer does NOT add ISCC.exe to PATH — it only
    # creates Start Menu shortcuts and an App Paths registry entry, so
    # `Get-Command iscc` alone finds nothing even on a machine that has
    # Inno Setup 6 properly installed. Fall back to its well-known default
    # install locations, then to the App Paths registry key Inno Setup's
    # own installer registers, before giving up.
    $isccPath = $null
    $isccCmd = Get-Command iscc -ErrorAction SilentlyContinue
    if ($isccCmd) { $isccPath = $isccCmd.Source }
    if (-not $isccPath) {
        foreach ($candidate in @(
            "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
            "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
        )) {
            if ($candidate -and (Test-Path $candidate)) { $isccPath = $candidate; break }
        }
    }
    if (-not $isccPath) {
        $appPathsKey = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe"
        $regValue = (Get-ItemProperty -Path $appPathsKey -ErrorAction SilentlyContinue).'(default)'
        if ($regValue -and (Test-Path $regValue)) { $isccPath = $regValue }
    }
    if (-not $isccPath) {
        throw "iscc.exe が見つかりません。Inno Setup 6 を導入してください / install Inno Setup 6 (https://jrsoftware.org/isinfo.php). If it's installed somewhere non-standard, add its folder to PATH and retry."
    }

    Write-Host "==> インストーラを作成しています / Building the installer: $isccPath" -ForegroundColor Cyan
    & $isccPath "ine.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }

    Write-Host ""
    Write-Host "完了 / Done: dist\" -ForegroundColor Green
    Get-ChildItem "..\..\dist\*.exe" | ForEach-Object { Write-Host "  $($_.Name)" }
} finally {
    Pop-Location
}
