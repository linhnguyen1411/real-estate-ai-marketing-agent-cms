param(
  [switch]$LocalWorker,
  [string]$RuntimeUrl = '',
  [string]$WorkerId = ''
)

$Host.UI.RawUI.WindowTitle = if ($LocalWorker) { 'Agent local worker' } else { 'Agent automation (VPS)' }
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location $Root
. (Join-Path $PSScriptRoot '_env-bootstrap.ps1')

function Wait-ForCdp {
  param([int]$TimeoutSec = 90)
  $endpoint = if ($env:AGENT_CDP_ENDPOINT) { $env:AGENT_CDP_ENDPOINT.Trim() } else { 'http://127.0.0.1:9222' }
  $url = ($endpoint -replace '/$', '') + '/json/version'
  Write-Host "Waiting for Chrome CDP at $url ..." -ForegroundColor Yellow
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) {
        Write-Host 'CDP ready — starting agent.' -ForegroundColor Green
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  Write-Host 'ERROR: CDP not reachable. Open Chrome CDP window first (port 9222).' -ForegroundColor Red
  return $false
}

$env:AGENT_BROWSER_MODE = 'cdp'
if ($WorkerId) { $env:AGENT_WORKER_ID = $WorkerId }
if ($RuntimeUrl) { $env:AGENT_RUNTIME_URL = $RuntimeUrl }

Write-Host "Repo: $Root" -ForegroundColor DarkGray

if (-not (Wait-ForCdp)) {
  Read-Host 'Enter to close'
  exit 1
}

if ($LocalWorker) {
  $env:EXECUTION_AGENT_STATELESS = '0'
  Write-Host 'Starting local scan worker (DB on this machine)...' -ForegroundColor Green
  & powershell -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\fleet\start-scan-worker.ps1')
} else {
  $env:EXECUTION_AGENT_STATELESS = '1'
  Write-Host 'Starting automation-agent (AGENT_RUNTIME_URL from .env)...' -ForegroundColor Green
  & npm.cmd run automation-agent
}

Write-Host "Agent exited ($LASTEXITCODE)" -ForegroundColor Yellow
Read-Host 'Enter to close'
