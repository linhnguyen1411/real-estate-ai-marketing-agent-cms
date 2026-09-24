# Minimal local keepalive: PG + CDP + agent worker (lean).
# Only restarts when a process is actually dead. Does NOT kill idle workers.
param(
  [int]$PollSeconds = 30,
  [int]$NodeMaxOldSpaceMb = 768,
  [switch]$LeanMode,
  [switch]$Once
)

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

# Default lean: no CMS UI (jobs come from VPS).
if (-not $PSBoundParameters.ContainsKey('LeanMode')) { $LeanMode = $true }
if ($env:LOCAL_WATCHDOG_LEAN -eq '0') { $LeanMode = $false }
if ($env:LOCAL_WATCHDOG_LEAN -eq '1') { $LeanMode = $true }
if ($env:LOCAL_WATCHDOG_NODE_MB -match '^\d+$') { $NodeMaxOldSpaceMb = [int]$env:LOCAL_WATCHDOG_NODE_MB }

$StateDir = Join-Path $Root 'runtime\watchdog'
$LogDir = Join-Path $StateDir 'logs'
New-Item -ItemType Directory -Force -Path $StateDir, $LogDir | Out-Null

$WorkerPidFile = Join-Path $StateDir 'worker.pid'
$WatchdogPidFile = Join-Path $StateDir 'watchdog.pid'
$MainLog = Join-Path $LogDir 'watchdog.log'
$CdpPort = if ($env:AGENT_CDP_PORT) { $env:AGENT_CDP_PORT } else { '9222' }
$RepoMarker = 'real-estate-ai-marketing-agent-cms'
$HeartbeatEvery = 20
$loopCount = 0

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $MainLog -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-PidAlive([int]$ProcessId) {
  if ($ProcessId -le 0) { return $false }
  try {
    $null = Get-Process -Id $ProcessId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Read-PidFile([string]$Path) {
  if (-not (Test-Path $Path)) { return 0 }
  $raw = (Get-Content $Path -Raw -ErrorAction SilentlyContinue)
  if (-not $raw) { return 0 }
  $raw = $raw.Trim()
  if ($raw -match '^\d+$') { return [int]$raw }
  return 0
}

function Write-PidFile([string]$Path, [int]$ProcessId) {
  Set-Content -Path $Path -Value $ProcessId -Encoding ascii
}

function Get-WorkerNodes {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match '^(node|tsx)\.exe$' -and
      $_.CommandLine -and
      $_.CommandLine -match 'agent-worker' -and
      (
        $_.CommandLine -match [regex]::Escape($RepoMarker) -or
        $_.CommandLine -match 'server[/\\]agent-worker'
      )
    })
}

function Get-CmsNodes {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match '^(node|tsx)\.exe$' -and
      $_.CommandLine -and
      $_.CommandLine -match [regex]::Escape($RepoMarker) -and
      $_.CommandLine -match 'ensure-local-pg\.mjs|tsx.*server\.ts|[\\/]server\.ts'
    })
}

function Get-WorkerCmdWrappers {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -eq 'cmd.exe' -and
      $_.CommandLine -and
      $_.CommandLine -match [regex]::Escape($RepoMarker) -and
      $_.CommandLine -match 'npm run agent:worker'
    })
}

function Ensure-Postgres {
  $pgScript = Join-Path $Root 'scripts\pg-cluster.ps1'
  $status = cmd /c "powershell -NoProfile -ExecutionPolicy Bypass -File `"$pgScript`" -Action status 2>&1"
  $text = "$status"
  if ($text -match 'server is running') { return }
  if ($text -match 'recovery|starting up|in recovery') {
    Write-Log 'Postgres in recovery - waiting (not restarting)'
    return
  }
  Write-Log 'Postgres down - starting cluster once'
  cmd /c "powershell -NoProfile -ExecutionPolicy Bypass -File `"$pgScript`" -Action start 2>&1" | Out-Null
}

function Test-Cdp {
  try {
    $null = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/json/version" -f $CdpPort) -UseBasicParsing -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

function Ensure-Cdp {
  if (Test-Cdp) { return }
  Write-Log ("CDP down on :{0} - starting Chrome" -f $CdpPort)
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\fleet\start-cdp-chrome.ps1')
  Start-Sleep -Seconds 5
  if (-not (Test-Cdp)) {
    Write-Log 'WARN: CDP still unreachable'
  } else {
    Write-Log 'CDP is up'
  }
}

function Ensure-NoCms {
  if (-not $LeanMode) { return }
  $cms = Get-CmsNodes
  if ($cms.Count -eq 0) { return }
  Write-Log ("LeanMode: stopping {0} CMS process(es)" -f $cms.Count)
  foreach ($p in $cms) {
    try { & taskkill.exe /PID $p.ProcessId /T /F 2>$null | Out-Null } catch {}
  }
}

function Start-Worker {
  $existingCmd = Get-WorkerCmdWrappers
  if ($existingCmd.Count -gt 0) {
    Write-Log ("Worker cmd already running pid={0}" -f $existingCmd[0].ProcessId)
    return [int]$existingCmd[0].ProcessId
  }

  $outLog = Join-Path $LogDir 'worker.out.log'
  $errLog = Join-Path $LogDir 'worker.err.log'
  $nodeOpts = "--max-old-space-size={0}" -f $NodeMaxOldSpaceMb
  $cmd = 'set NODE_OPTIONS={0}&& npm run agent:worker >> "{1}" 2>> "{2}"' -f $nodeOpts, $outLog, $errLog
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $cmd) `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -PassThru
  return $proc.Id
}

function Ensure-Worker {
  $nodes = Get-WorkerNodes
  if ($nodes.Count -gt 0) {
    Write-PidFile $WorkerPidFile ([int]$nodes[0].ProcessId)
    return
  }

  $wrappers = Get-WorkerCmdWrappers
  if ($wrappers.Count -gt 0) {
    # npm still starting - give it time, do not spawn a second worker
    Write-PidFile $WorkerPidFile ([int]$wrappers[0].ProcessId)
    return
  }

  Write-Log 'Worker process missing - starting npm run agent:worker'
  $newPid = Start-Worker
  Write-PidFile $WorkerPidFile $newPid
  Write-Log ("Worker started pid={0}" -f $newPid)
}

# Single-instance guard
$myPid = $PID
$oldWatchdog = Read-PidFile $WatchdogPidFile
if ($oldWatchdog -gt 0 -and $oldWatchdog -ne $myPid -and (Test-PidAlive $oldWatchdog)) {
  $old = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $oldWatchdog) -ErrorAction SilentlyContinue
  if ($old -and $old.CommandLine -match 'watchdog-local\.ps1') {
    Write-Log ("Another watchdog already running (pid={0}) - exiting" -f $oldWatchdog)
    exit 0
  }
}
Write-PidFile $WatchdogPidFile $myPid
Write-Log ("Watchdog v2 started pid={0} poll={1}s nodeMb={2} lean={3} (restart-only-if-dead)" -f $myPid, $PollSeconds, $NodeMaxOldSpaceMb, [bool]$LeanMode)

try {
  do {
    try {
      Ensure-Postgres
      Ensure-Cdp
      Ensure-NoCms
      Ensure-Worker
      $loopCount++
      if (($loopCount % $HeartbeatEvery) -eq 0) {
        $wn = (Get-WorkerNodes).Count
        Write-Log ("heartbeat ok loop={0} workerNodes={1}" -f $loopCount, $wn)
      }
    } catch {
      Write-Log ('ERROR: ' + $_.Exception.Message)
    }
    if ($Once) { break }
    Start-Sleep -Seconds $PollSeconds
  } while ($true)
} finally {
  $current = Read-PidFile $WatchdogPidFile
  if ($current -eq $myPid) {
    Remove-Item $WatchdogPidFile -Force -ErrorAction SilentlyContinue
  }
  Write-Log 'Watchdog stopped'
}
