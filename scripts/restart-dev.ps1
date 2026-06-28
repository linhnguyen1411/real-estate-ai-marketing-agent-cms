$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
Write-Host "==> Giai phong port dev + bat Postgres local (neu can)" -ForegroundColor Cyan
node scripts/free-dev-ports.mjs
node scripts/ensure-local-pg.mjs
Start-Sleep -Seconds 1
npm run dev
