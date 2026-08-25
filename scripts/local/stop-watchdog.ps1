# Stop local watchdog + managed CMS/worker processes for this repo only.
param(
  [string]$TaskName = 'RealEstateCMS-LocalWatchdog',
  [switch]$UnregisterTask
)

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$StateDir = Join-Path $Root 'runtime\watchdog'
$RepoMarker = 'real-estate-ai-marketing-agent-cms'

function Stop-Tree([int]$ProcessId) {
  if ($ProcessId -le 0) { return }
  try { & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null } catch {}
}

foreach ($name in @('watchdog.pid', 'cms.pid', 'worker.pid')) {
  $file = Join-Path $StateDir $name
  if (Test-Path $file) {
    $raw = (Get-Content $file -Raw -ErrorAction SilentlyContinue).Trim()
    if ($raw -match '^\d+$') {
      Write-Host "Stopping $name pid=$raw"
      Stop-Tree ([int]$raw)
    }
    Remove-Item $file -Force -ErrorAction SilentlyContinue
  }
}

# Also kill any lingering repo node procs (CMS/worker) started outside pid files
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '^(node|tsx|cmd)\.exe$' -and
    $_.CommandLine -and
    $_.CommandLine -match [regex]::Escape($RepoMarker) -and
    ($_.CommandLine -match 'agent-worker|tsx.*server\.ts|npm run (dev|agent:worker)|watchdog-local\.ps1')
  } |
  ForEach-Object {
    Write-Host "Stopping leftover pid=$($_.ProcessId)"
    Stop-Tree ([int]$_.ProcessId)
  }

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
  if ($UnregisterTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Unregistered task: $TaskName"
  } else {
    Write-Host "Stopped task: $TaskName (still registered for next logon)"
  }
}

Write-Host 'Local watchdog/CMS/worker stopped.'
