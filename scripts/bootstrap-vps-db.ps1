param(
  [string]$HostName = "112.213.87.124",
  [string]$User = "root",
  [string]$RemoteDir = "/var/www/real-estate-ai-cms"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$remote = "${User}@${HostName}"
$scriptName = "vps-bootstrap-postgres.sh"
$localScript = Join-Path $PSScriptRoot $scriptName
$remoteScript = "/tmp/$scriptName"

Write-Host "==> Upload Prisma schema + bootstrap script" -ForegroundColor Cyan
scp $localScript "${remote}:${remoteScript}"
scp (Join-Path $root "prisma/schema.prisma") "${remote}:$RemoteDir/prisma/schema.prisma"

Write-Host "==> Run bootstrap on VPS (legacy -> PostgreSQL)" -ForegroundColor Cyan
ssh $remote "sed -i 's/\r$//' $remoteScript && chmod +x $remoteScript && APP_DIR=$RemoteDir bash $remoteScript"
if ($LASTEXITCODE -ne 0) {
  throw "VPS bootstrap failed (exit $LASTEXITCODE)"
}

Write-Host ""
Write-Host "Done. Pull DB to local:" -ForegroundColor Green
Write-Host "  npm run db:pull-and-sync"
