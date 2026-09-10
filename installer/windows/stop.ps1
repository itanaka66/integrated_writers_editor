# Stops INE (containers only — no data is deleted; database/Qdrant/episode
# volumes persist for next launch).

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Set-Location $PSScriptRoot

docker compose -f docker-compose.yml down
[System.Windows.Forms.MessageBox]::Show("INE を停止しました。データは保持されています。`n`nINE has been stopped. Your data is preserved.", "Integrated writers Editor (INE)") | Out-Null
