param(
  [string]$HostName = "112.213.87.124",
  [string]$User = "root",
  [string]$RemoteDir = "/var/www/real-estate-ai-cms",
  [string]$RemoteDump = "/tmp/real-estate-ai-prod-dump.sql",
  [string]$LocalDir = "data",
  [string]$LocalFile = "prod-dump.sql"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$remote = "${User}@${HostName}"
$localPath = Join-Path $root $LocalDir
$localDump = Join-Path $localPath $LocalFile

if (-not (Test-Path $localPath)) {
  New-Item -ItemType Directory -Path $localPath | Out-Null
}

Write-Host "==> Dump PostgreSQL on VPS" -ForegroundColor Cyan
Write-Host "    $remote ($RemoteDir)"

$remoteCommand = "cd $RemoteDir && if [ ! -f .env ]; then echo 'Missing .env on VPS' >&2; exit 1; fi && set -a && . ./.env && set +a && if [ -z `"`$DATABASE_URL`" ]; then echo 'DATABASE_URL empty on VPS' >&2; exit 1; fi && command -v pg_dump >/dev/null 2>&1 || { echo 'pg_dump not installed on VPS' >&2; exit 1; } && DB_URL=`"`${DATABASE_URL%%\?*}`" && pg_dump `"`$DB_URL`" --no-owner --clean --if-exists --format=plain -f $RemoteDump && ls -lh $RemoteDump"

ssh $remote $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Remote pg_dump failed (exit $LASTEXITCODE). Ensure VPS has PostgreSQL + DATABASE_URL in .env"
}

Write-Host ""
Write-Host "==> Download dump" -ForegroundColor Cyan
Write-Host "    $remote`:$RemoteDump"
Write-Host " -> $localDump"

scp "${remote}:${RemoteDump}" $localDump
if ($LASTEXITCODE -ne 0) {
  throw "scp failed (exit $LASTEXITCODE)"
}

if (-not (Test-Path $localDump)) {
  throw "Download failed: $localDump not found"
}

$sizeMb = [math]::Round((Get-Item $localDump).Length / 1MB, 2)
Write-Host "Downloaded ${sizeMb} MB -> $localDump" -ForegroundColor Green
Write-Host ""
Write-Host "Restore to local Postgres:" -ForegroundColor Yellow
Write-Host "  npm run db:sync-prod"
Write-Host "Or full pull + sync:" -ForegroundColor Yellow
Write-Host "  npm run db:pull-and-sync"
