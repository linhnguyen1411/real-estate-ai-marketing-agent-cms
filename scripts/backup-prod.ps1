# Production origin since 2026-11-06: 45.117.170.118.
param(
  [string]$HostName = $(if ($env:VPS_HOST) { $env:VPS_HOST } else { "45.117.170.118" }),
  [string]$User = "root",
  [string]$RemoteDir = "/var/www/real-estate-ai-cms",
  [string]$BackupDir = "/var/www/real-estate-ai-cms/backups",
  [switch]$DownloadLocal,
  [string]$LocalDir = "data/backups"
)

if (-not $HostName) {
  Write-Error "HostName resolved empty. Pass -HostName <IP/Host> (production: 45.117.170.118)."
  exit 1
}

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$remote = "${User}@${HostName}"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host ""
Write-Host "==> Production backup on VPS" -ForegroundColor Cyan
Write-Host "    $remote ($RemoteDir)"

# Sent over stdin: PowerShell mangles embedded double quotes on native command
# arguments, which previously produced empty (20-byte) dumps without failing.
$remoteScript = @'
set -euo pipefail
mkdir -p "@BACKUP_DIR@"
cd "@REMOTE_DIR@"
test -f .env || { echo "Missing .env on VPS" >&2; exit 1; }
set -a && . ./.env && set +a
test -n "${DATABASE_URL:-}" || { echo "DATABASE_URL empty on VPS" >&2; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump not installed on VPS" >&2; exit 1; }
DB_URL="${DATABASE_URL%%\?*}"
pg_dump "$DB_URL" --no-owner --clean --if-exists --format=plain | gzip -9 > "@BACKUP_DIR@/db-@TIMESTAMP@.sql.gz"
test -s "@BACKUP_DIR@/db-@TIMESTAMP@.sql.gz" || { echo "DB backup is empty" >&2; exit 1; }
if [ -d dist ]; then tar -czf "@BACKUP_DIR@/dist-@TIMESTAMP@.tar.gz" dist; fi
cp .env "@BACKUP_DIR@/env-@TIMESTAMP@.bak"
ls -t "@BACKUP_DIR@"/db-*.sql.gz 2>/dev/null | tail -n +4 | xargs -r rm -f
ls -t "@BACKUP_DIR@"/dist-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f
ls -t "@BACKUP_DIR@"/env-*.bak 2>/dev/null | tail -n +4 | xargs -r rm -f
ls -lh "@BACKUP_DIR@/db-@TIMESTAMP@.sql.gz" "@BACKUP_DIR@/dist-@TIMESTAMP@.tar.gz" 2>/dev/null || ls -lh "@BACKUP_DIR@/db-@TIMESTAMP@.sql.gz"
echo BACKUP_DB=@BACKUP_DIR@/db-@TIMESTAMP@.sql.gz
'@

$remoteScript = $remoteScript.Replace('@BACKUP_DIR@', $BackupDir).Replace('@REMOTE_DIR@', $RemoteDir).Replace('@TIMESTAMP@', $timestamp)
$remoteScript = $remoteScript -replace "`r`n", "`n"
$remoteScript | ssh $remote 'bash -s'
if ($LASTEXITCODE -ne 0) {
  throw "Production backup failed (exit $LASTEXITCODE)"
}

if ($DownloadLocal) {
  $localPath = Join-Path $root $LocalDir
  if (-not (Test-Path $localPath)) {
    New-Item -ItemType Directory -Path $localPath -Force | Out-Null
  }

  $remoteDb = "$BackupDir/db-$timestamp.sql.gz"
  $localDb = Join-Path $localPath "prod-db-$timestamp.sql.gz"

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
