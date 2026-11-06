# Production origin since 2026-11-06: 45.117.170.118. The previous host
# (112.213.87.124) is a standby that only proxies HTTPS traffic.
param(
  [string]$HostName = $(if ($env:VPS_HOST) { $env:VPS_HOST } else { "45.117.170.118" }),
  [string]$User = "root",
  [string]$ArchiveName = "deploy-agent-safe.tar.gz",
  [string]$HealthUrl = "https://bdsdanang.site/api/health",
  [switch]$SkipLint,
  [switch]$SkipBackup
)

if (-not $HostName) {
  Write-Error "HostName resolved empty. Pass -HostName <IP/Host> (production: 45.117.170.118)."
  exit 1
}

# SAFE DEPLOY ENTRYPOINT — never calls deploy.ps1 / db push.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
$remote = "${User}@${HostName}"
$localArchive = Join-Path $root $ArchiveName
$remoteScript = Join-Path $root "scripts\tmp-vps-safe-deploy.sh"

Write-Host "SAFE DEPLOY - prisma migrate deploy only (NO db push)" -ForegroundColor Yellow

if (-not $SkipBackup) {
  Write-Host "==> backup:prod" -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "backup-prod.ps1") -HostName $HostName -DownloadLocal
  if ($LASTEXITCODE -ne 0) { throw "backup failed" }
}

if (-not $SkipLint) {
  Write-Host "==> lint" -ForegroundColor Cyan
  npm.cmd run lint
  if ($LASTEXITCODE -ne 0) { throw "lint failed" }
}

Write-Host "==> Create archive" -ForegroundColor Cyan
if (Test-Path $localArchive) { Remove-Item $localArchive -Force }
# Exclude root runtime state (QA artifacts, session cookies, watchdog logs) and
# production-managed media (content-images/agent-avatars/blog-covers) so a deploy
# never overwrites live uploads. Never exclude server/**/runtime source modules.
tar -czf $ArchiveName `
  --exclude=.git `
  --exclude=node_modules `
  --exclude=data `
  --exclude=.env `
  --exclude=.env.* `
  --exclude=*.log `
  --exclude=*.tar.gz `
  --exclude=*.zip `
  --exclude=db.json `
  --exclude=scratch `
  --exclude=scratch/** `
  --exclude=.dev `
  --exclude=.dev/** `
  --exclude=desktop/dist `
  --exclude=desktop/dist/** `
  --exclude=./runtime `
  --exclude=./runtime/** `
  --exclude=./public/content-images `
  --exclude=./public/content-images/** `
  --exclude=./public/agent-avatars `
  --exclude=./public/agent-avatars/** `
  --exclude=./public/blog-covers `
  --exclude=./public/blog-covers/** `
  --exclude=./runtime/local-pg `
  --exclude=./runtime/local-pg/** `
  --exclude=./runtime/installer-build `
  --exclude=./runtime/installer-build/** `
  --exclude=./runtime/agent-browser-profile `
  --exclude=./runtime/agent-cdp-profile `
  --exclude=./runtime/agent-vps-heartbeat-profile `
  --exclude=./runtime/agent-cdp-profile/** `
  --exclude=./runtime/agent-browser-profile/** `
  --exclude=./runtime/publish-evidence/** `
  --exclude=./runtime/screenshots `
  --exclude=./runtime/debug `
  --exclude=./runtime/tmp `
  --exclude=./runtime/outbox-dumps `
  --exclude=./runtime/logs `
  --exclude=./runtime/dual-host-report* `
  --exclude=$ArchiveName `
  .
$tarExit = $LASTEXITCODE
if ($tarExit -gt 1) { throw "tar failed (exit $tarExit)" }
tar -tzf $ArchiveName > $null
if ($LASTEXITCODE -ne 0) { throw "archive verification failed" }
if ($tarExit -eq 1) { Write-Warning "tar reported files changed during read; archive verified OK" }

Write-Host "==> Upload" -ForegroundColor Cyan
scp $localArchive "${remote}:/tmp/$ArchiveName"
if ($LASTEXITCODE -ne 0) { throw "scp archive failed" }
scp $remoteScript "${remote}:/tmp/tmp-vps-safe-deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "scp script failed" }

Write-Host "==> Remote migrate+build+restart" -ForegroundColor Cyan
ssh $remote "sed -i 's/\r`$//' /tmp/tmp-vps-safe-deploy.sh; bash /tmp/tmp-vps-safe-deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "remote deploy failed" }

Write-Host "==> Health" -ForegroundColor Cyan
Start-Sleep -Seconds 5
Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 30 | ConvertTo-Json -Depth 5

if (Test-Path $localArchive) { Remove-Item $localArchive -Force }
Write-Host "Safe deploy complete." -ForegroundColor Green
