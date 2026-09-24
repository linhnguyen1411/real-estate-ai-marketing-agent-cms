# Start local stack — 3 separate PowerShell windows (Desktop shortcut safe).
#   powershell -ExecutionPolicy Bypass -File scripts/local/start-local-stack.ps1

param(
  [switch]$SkipPostgres,
  [switch]$SkipCdp,
  [switch]$LocalWorker,
  [string]$RuntimeUrl = '',
  [string]$WorkerId = ''
)

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$WinDir = Join-Path $PSScriptRoot 'windows'
Set-Location $Root

. (Join-Path $WinDir '_env-bootstrap.ps1')

function Start-StackWindow {
  param([string]$Label, [string]$ScriptPath, [string[]]$ExtraArgs = @())
  $args = @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-File', $ScriptPath
  ) + $ExtraArgs
  Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WorkingDirectory $Root -WindowStyle Normal
  Write-Host "[start-local] $Label" -ForegroundColor Green
}

Write-Host ''
Write-Host '=== Real Estate AI — local stack ===' -ForegroundColor Cyan
Write-Host "Repo: $Root"
Write-Host ''

if (-not $SkipPostgres) {
  Write-Host '==> Postgres (pg-cluster start)' -ForegroundColor Yellow
  $pgScript = Join-Path $Root 'scripts\pg-cluster.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pgScript -Action start
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Postgres start failed. Try: npm run db:pg-start' -ForegroundColor Red
  }
}

$cms = Join-Path $WinDir 'start-cms.ps1'
$cdp = Join-Path $WinDir 'start-cdp.ps1'
$agent = Join-Path $WinDir 'start-agent.ps1'

$agentArgs = @()
if ($LocalWorker) { $agentArgs += '-LocalWorker' }
if ($RuntimeUrl) { $agentArgs += '-RuntimeUrl'; $agentArgs += $RuntimeUrl }
if ($WorkerId) { $agentArgs += '-WorkerId'; $agentArgs += $WorkerId }

Start-StackWindow -Label 'CMS :3000' -ScriptPath $cms
Start-Sleep -Seconds 2

if (-not $SkipCdp) {
  Start-StackWindow -Label 'Chrome CDP :9222' -ScriptPath $cdp
  Start-Sleep -Seconds 8
}

Start-StackWindow -Label 'Agent' -ScriptPath $agent -ExtraArgs $agentArgs

Write-Host ''
Write-Host 'Opened windows:' -ForegroundColor Green
Write-Host '  CMS    -> http://localhost:3000'
Write-Host '  CDP    -> http://127.0.0.1:9222/json/version'
Write-Host '  Agent  -> reads .env (or -LocalWorker for scan on local DB)'
Write-Host ''
Write-Host 'Tip: wait ~10s then open CMS in browser.' -ForegroundColor DarkGray
Write-Host ''
