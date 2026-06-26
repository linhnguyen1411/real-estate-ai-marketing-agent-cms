param(
  [string]$HostName = "112.213.87.124",
  [string]$User = "root",
  [string]$RemoteDir = "/var/www/real-estate-ai-cms",
  [string]$BackupDir = "/var/www/real-estate-ai-cms/backups",
  [switch]$DownloadLocal,
  [string]$LocalDir = "data/backups"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$remote = "${User}@${HostName}"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host ""
Write-Host "==> Production backup on VPS" -ForegroundColor Cyan
Write-Host "    $remote ($RemoteDir)"

$remoteCommand = @"
set -e
mkdir -p '$BackupDir'
cd '$RemoteDir'
if [ ! -f .env ]; then echo 'Missing .env on VPS' >&2; exit 1; fi
set -a && . ./.env && set +a
if [ -z "`$DATABASE_URL" ]; then echo 'DATABASE_URL empty on VPS' >&2; exit 1; fi
command -v pg_dump >/dev/null 2>&1 || { echo 'pg_dump not installed on VPS' >&2; exit 1; }
DB_URL="`${DATABASE_URL%%\?*}"
DB_FILE='$BackupDir/db-$timestamp.sql'
pg_dump "`$DB_URL" --no-owner --clean --if-exists --format=plain -f "`$DB_FILE"
if [ -d dist ]; then
  tar -czf '$BackupDir/dist-$timestamp.tar.gz' dist
fi
if [ -f .env ]; then
  cp .env '$BackupDir/env-$timestamp.bak'
fi
ls -lh '$BackupDir/db-$timestamp.sql' '$BackupDir/dist-$timestamp.tar.gz' 2>/dev/null || ls -lh '$BackupDir/db-$timestamp.sql'
echo "BACKUP_DB=$BackupDir/db-$timestamp.sql"
"@

ssh $remote $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Production backup failed (exit $LASTEXITCODE)"
}

if ($DownloadLocal) {
  $localPath = Join-Path $root $LocalDir
  if (-not (Test-Path $localPath)) {
    New-Item -ItemType Directory -Path $localPath -Force | Out-Null
  }

  $remoteDb = "$BackupDir/db-$timestamp.sql"
  $localDb = Join-Path $localPath "prod-db-$timestamp.sql"

  Write-Host ""
  Write-Host "==> Download DB backup locally" -ForegroundColor Cyan
  scp "${remote}:${remoteDb}" $localDb
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to download backup (exit $LASTEXITCODE)"
  }

  $sizeMb = [math]::Round((Get-Item $localDb).Length / 1MB, 2)
  Write-Host "Saved ${sizeMb} MB -> $localDb" -ForegroundColor Green
}

Write-Host ""
Write-Host "Production backup complete ($timestamp)." -ForegroundColor Green
