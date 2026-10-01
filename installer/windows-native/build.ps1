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
#   - Inno Setup 6, installed to its default location (its own installer
#     does not add ISCC.exe to PATH; this script looks there and in the
#     registry automatically, so PATH is only needed for a non-default
#     install location)
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
        throw "iscc.exe not found. Install Inno Setup 6 (https://jrsoftware.org/isinfo.php), or if it's installed somewhere non-standard, add its folder to PATH and retry."
    }

    Write-Host ""
    Write-Host "==> Compiling the installer (Inno Setup): $isccPath" -ForegroundColor Cyan
    & $isccPath "ine-native.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }

    Write-Host ""
    Write-Host "Done: dist\" -ForegroundColor Green
    Get-ChildItem "..\..\dist\INE-Native-Setup-*.exe" | ForEach-Object { Write-Host "  $($_.Name)" }
} finally {
    Pop-Location
}
