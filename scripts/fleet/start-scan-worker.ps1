# Start local scan/publish worker attached to CDP Chrome on this workstation.
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

$hostname = $env:COMPUTERNAME
if (-not $hostname) { $hostname = [System.Net.Dns]::GetHostName() }
$safe = ($hostname -replace '[^a-zA-Z0-9-]', '-').ToLowerInvariant()

if (-not $env:AGENT_WORKER_ID) { $env:AGENT_WORKER_ID = "worker-$safe" }
if (-not $env:AGENT_MACHINE_ID) { $env:AGENT_MACHINE_ID = $hostname }
if (-not $env:AGENT_DISPLAY_NAME) { $env:AGENT_DISPLAY_NAME = $hostname }
if (-not $env:AGENT_BROWSER_PROFILE_DIR) {
  $env:AGENT_BROWSER_PROFILE_DIR = Join-Path $Root 'runtime\agent-browser-profile'
}
$cdpPort = if ($env:AGENT_CDP_PORT) { $env:AGENT_CDP_PORT } else { '9222' }
if (-not $env:AGENT_CDP_ENDPOINT) { $env:AGENT_CDP_ENDPOINT = "http://127.0.0.1:$cdpPort" }
if (-not $env:AGENT_SCHEDULER_ENABLED) { $env:AGENT_SCHEDULER_ENABLED = 'true' }

Remove-Item Env:AGENT_RUNTIME_API_BASE_URL -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path $env:AGENT_BROWSER_PROFILE_DIR | Out-Null

Write-Host '[fleet] Scan worker'
Write-Host "  workerId:   $($env:AGENT_WORKER_ID)"
Write-Host "  machineId:  $($env:AGENT_MACHINE_ID)"
Write-Host "  cdp:        $($env:AGENT_CDP_ENDPOINT)"
Write-Host "  managed:    $($env:AGENT_BROWSER_PROFILE_DIR)"
Write-Host "  scheduler:  $($env:AGENT_SCHEDULER_ENABLED)"

try {
  $null = Invoke-WebRequest -Uri "$($env:AGENT_CDP_ENDPOINT)/json/version" -UseBasicParsing -TimeoutSec 3
} catch {
  Write-Error "CDP unreachable at $($env:AGENT_CDP_ENDPOINT). Run: .\scripts\fleet\start-cdp-chrome.ps1"
}

npm run agent:worker
