# Starts (or restarts) INE and opens it in the default browser.
#
# Run from the installed app folder (the Start Menu / desktop shortcut the
# installer creates does this for you) — it assumes docker-compose.yml and
# .env(.example) live next to this script.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

$root = $PSScriptRoot
Set-Location $root

function Show-Message([string]$text, [string]$title = "Integrated writers Editor (INE)") {
    [System.Windows.Forms.MessageBox]::Show($text, $title) | Out-Null
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Show-Message "Docker Desktop が見つかりません。https://www.docker.com/products/docker-desktop/ からインストールしてから、もう一度起動してください。`n`nDocker Desktop was not found. Install it from https://www.docker.com/products/docker-desktop/ and try again."
    exit 1
}

$dockerReady = $false
try { docker info *> $null; $dockerReady = $true } catch { $dockerReady = $false }

if (-not $dockerReady) {
    $dockerExe = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    }
    Write-Host "Docker Desktop の起動を待っています... / Waiting for Docker Desktop to start..."
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
        try { docker info *> $null; $dockerReady = $true; break } catch { Start-Sleep -Seconds 3 }
    }
    if (-not $dockerReady) {
        Show-Message "Docker Desktop の起動を確認できませんでした。Docker Desktopを手動で起動してから、もう一度お試しください。`n`nCould not confirm Docker Desktop started. Start it manually and try again."
        exit 1
    }
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    $chars = (48..57) + (65..90) + (97..122)
    $password = -join ((1..20) | ForEach-Object { [char]($chars | Get-Random) })
    (Get-Content ".env") -replace '^ADMIN_PASSWORD=.*$', "ADMIN_PASSWORD=$password" | Set-Content ".env"
    Show-Message "初回起動です。管理者パスワードを生成しました:`n`n$password`n`nこのパスワードは $root\.env に保存されています。後で変更できます。`n`nFirst run: generated an admin password:`n`n$password`n`nSaved to $root\.env — you can change it later."
}

Write-Host "INE を起動しています... / Starting INE..."
docker compose -f docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) {
    Show-Message "起動に失敗しました。詳細はコンソール出力を確認してください。`n`nFailed to start. Check the console output for details."
    exit 1
}

Write-Host "起動を待っています... / Waiting for the app to come up..."
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
    Show-Message "起動処理は開始しましたが、まだ応答がありません。初回はイメージのダウンロードに時間がかかることがあります。数分後にブラウザを再読み込みしてください。`n`nStartup was triggered but the app isn't responding yet — the first run can take a while to pull images. Reload the browser tab in a few minutes."
}
