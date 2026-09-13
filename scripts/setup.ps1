# Interactive first-time setup for IWE's Docker Compose install on Windows.
# Asks a few yes/no questions, writes .env, and starts the containers you chose.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Ask-YesNo($Prompt, $Default) {
    $suffix = if ($Default -eq "y") { "[Y/n]" } else { "[y/N]" }
    $reply = Read-Host "$Prompt $suffix"
    if ([string]::IsNullOrWhiteSpace($reply)) { $reply = $Default }
    return $reply -match '^(y|yes)$'
}

function Set-EnvValue($Path, $Key, $Value) {
    $content = Get-Content $Path
    $pattern = "^$Key="
    $newLine = "$Key=$Value"
    if ($content -match $pattern) {
        $content = $content -replace "$pattern.*", $newLine
    } else {
        $content += $newLine
    }
    Set-Content -Path $Path -Value $content
}

try {
    docker version | Out-Null
} catch {
    Write-Error "Docker was not found. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/"
    exit 1
}
try {
    docker compose version | Out-Null
} catch {
    Write-Error "'docker compose' (Compose v2 plugin) was not found. It ships with current Docker Desktop."
    exit 1
}

Write-Host "== Integrated Writers Editor - setup ==" -ForegroundColor Cyan
Write-Host "This will create a .env file and start the app with Docker Compose."
Write-Host ""

$composeFile = "docker-compose.release.yml"
if (Ask-YesNo "Build the app from source instead of using prebuilt images? (slower, only needed if you're modifying the code)" "n") {
    $composeFile = "docker-compose.yml"
}
Write-Host "Using $composeFile"
Write-Host ""

if (Test-Path .env) {
    Write-Host ".env already exists - leaving it as-is. Delete it first if you want to redo setup from scratch."
    $services = @("db", "qdrant", "api", "web")
    if (Select-String -Path .env -Pattern '^OLLAMA_URL=http://ollama:11434' -Quiet) {
        $services = @("ollama") + $services
    }
    Write-Host "Starting: $($services -join ' ') (using the existing .env)"
    docker compose -f $composeFile up --build @services
    exit 0
}

Copy-Item .env.example .env

$services = @("web", "api")
$noDeps = @()

Write-Host "-- Database --"
if (Ask-YesNo "Run PostgreSQL in Docker for you? (recommended unless you already have one)" "y") {
    $services = @("db") + $services
} else {
    $extDb = Read-Host "Enter the DATABASE_URL of your existing PostgreSQL (e.g. postgresql+psycopg2://user:pass@host:5432/dbname)"
    Set-EnvValue .env "DATABASE_URL" $extDb
    $noDeps = @("--no-deps")
}
Write-Host ""

Write-Host "-- Vector search (Qdrant) --"
if (Ask-YesNo "Run Qdrant in Docker for you? (recommended unless you already have one)" "y") {
    $services = @("qdrant") + $services
} else {
    $extQdrant = Read-Host "Enter the QDRANT_URL of your existing Qdrant (e.g. http://host:6333)"
    Set-EnvValue .env "QDRANT_URL" $extQdrant
    $noDeps = @("--no-deps")
}
Write-Host ""

Write-Host "-- AI backend (Ollama) --"
if (Ask-YesNo "Run Ollama in Docker for you? (needs an NVIDIA GPU + Container Toolkit for good performance; CPU-only works but is slow for large models)" "n") {
    $services = @("ollama") + $services
    Set-EnvValue .env "OLLAMA_URL" "http://ollama:11434"
    Write-Host "Models must be pulled into the container after it starts, e.g.:"
    Write-Host "  docker compose exec ollama ollama pull qwen3:8b"
} elseif (Ask-YesNo "Will you use a local Ollama already running on this machine?" "y") {
    # keep .env.example's default OLLAMA_URL (http://host.docker.internal:11434)
} elseif (Ask-YesNo "Will you use Ollama running on a different machine?" "n") {
    $ollamaUrl = Read-Host "Enter its URL (e.g. http://192.168.1.10:11434)"
    Set-EnvValue .env "OLLAMA_URL" $ollamaUrl
} else {
    Write-Host "OK - configure a cloud AI provider (Claude/ChatGPT/Gemini) from 設定 > 接続設定 after logging in."
    Write-Host "Note: semantic search embeddings still need an Ollama instance reachable at OLLAMA_URL; local text search works even without one."
}
Write-Host ""

Write-Host "-- Admin login --"
if (Ask-YesNo "Generate a random ADMIN_PASSWORD for you?" "y") {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pw = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 24)
    Set-EnvValue .env "ADMIN_PASSWORD" $pw
    Write-Host "Generated ADMIN_PASSWORD: $pw" -ForegroundColor Yellow
    Write-Host "(also saved in .env - write it down, you'll need it to log in)"
} else {
    $pw = Read-Host "Enter the ADMIN_PASSWORD to use" -AsSecureString
    $plainPw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
    Set-EnvValue .env "ADMIN_PASSWORD" $plainPw
}
Write-Host ""

Write-Host "Starting: $($services -join ' ')" -ForegroundColor Cyan
docker compose -f $composeFile up --build @noDeps @services
