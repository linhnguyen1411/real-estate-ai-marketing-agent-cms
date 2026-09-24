$Host.UI.RawUI.WindowTitle = 'CMS :3000'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location $Root
. (Join-Path $PSScriptRoot '_env-bootstrap.ps1')

$env:AGENT_SCHEDULER_ENABLED = 'false'
$env:PORT = '3000'
$env:HOST = '127.0.0.1'
$env:SKIP_FREE_DEV_PORTS = '1'

Write-Host "Repo: $Root" -ForegroundColor DarkGray
Write-Host 'Starting CMS http://localhost:3000 ...' -ForegroundColor Green

& node scripts/ensure-local-pg.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Postgres not ready. Try: npm run db:pg-start' -ForegroundColor Red
  Read-Host 'Enter to close'
  exit 1
}

& node --import tsx server.ts
Write-Host "CMS exited ($LASTEXITCODE)" -ForegroundColor Yellow
Read-Host 'Enter to close'
