# Local keepalive for CMS + agent worker on this workstation.
# Process supervisor only - does not modify Runtime/Fleet/Queue/Browser lease.
param(
  [int]$PollSeconds = 20,
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

$StateDir = Join-Path $Root 'runtime\watchdog'
$LogDir = Join-Path $StateDir 'logs'
New-Item -ItemType Directory -Force -Path $StateDir, $LogDir | Out-Null

$CmsPidFile = Join-Path $StateDir 'cms.pid'
$WorkerPidFile = Join-Path $StateDir 'worker.pid'
$WatchdogPidFile = Join-Path $StateDir 'watchdog.pid'
$MainLog = Join-Path $LogDir 'watchdog.log'
$CdpPort = if ($env:AGENT_CDP_PORT) { $env:AGENT_CDP_PORT } else { '9222' }
$RepoMarker = 'real-estate-ai-marketing-agent-cms'

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $MainLog -Value $line -Encoding UTF8
  Write-Host $line
}

function Get-RepoNodeProcs([string]$Pattern) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match '^(node|tsx)\.exe$' -and
      $_.CommandLine -and
      $_.CommandLine -match $Pattern -and
      (
        $_.CommandLine -match [regex]::Escape($RepoMarker) -or
        $_.CommandLine -match 'server[/\\]agent-worker' -or
        $_.CommandLine -match 'ensure-local-pg\.mjs'
      )
    }
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

function Ensure-Postgres {
  $pgScript = Join-Path $Root 'scripts\pg-cluster.ps1'
  $status = & powershell -NoProfile -ExecutionPolicy Bypass -File $pgScript -Action status 2>&1 | Out-String
  if ($status -match 'server is running') { return }
  Write-Log 'Postgres down - starting cluster'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $pgScript -Action start 2>&1 | Out-Null
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
  Write-Log ("CDP down on :{0} - restarting Chrome profile" -f $CdpPort)
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'remote-debugging-port=9222|agent-cdp-profile' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\fleet\start-cdp-chrome.ps1')
  Start-Sleep -Seconds 4
  if (-not (Test-Cdp)) {
    Write-Log 'WARN: CDP still unreachable after restart'
  } else {
    Write-Log 'CDP is up'
  }
}

function Start-ManagedNpm([string]$NpmScript, [string]$LogName) {
  $outLog = Join-Path $LogDir ("{0}.out.log" -f $LogName)
  $errLog = Join-Path $LogDir ("{0}.err.log" -f $LogName)
  # Use cmd file redirection (not Start-Process -Redirect*) so npm children survive parent exit.
  $cmd = 'npm run {0} >> "{1}" 2>> "{2}"' -f $NpmScript, $outLog, $errLog
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $cmd) `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -PassThru
  return $proc.Id
}

function Ensure-Cms {
  $existing = @(Get-RepoNodeProcs 'ensure-local-pg\.mjs|tsx.*server\.ts|[\\/]server\.ts')
  if ($existing.Count -gt 0) {
    Write-PidFile $CmsPidFile ([int]$existing[0].ProcessId)
    return
  }

  $stored = Read-PidFile $CmsPidFile
  if (Test-PidAlive $stored) { return }

  Write-Log 'CMS down - starting npm run dev'
  $newPid = Start-ManagedNpm 'dev' 'cms'
  Write-PidFile $CmsPidFile $newPid
  Write-Log ("CMS started pid={0}" -f $newPid)
}

function Ensure-Worker {
  $existing = @(Get-RepoNodeProcs 'agent-worker')
  if ($existing.Count -gt 0) {
    Write-PidFile $WorkerPidFile ([int]$existing[0].ProcessId)
    return
  }

  $stored = Read-PidFile $WorkerPidFile
  if (Test-PidAlive $stored) { return }

  Write-Log 'Worker down - starting npm run agent:worker'
  $newPid = Start-ManagedNpm 'agent:worker' 'worker'
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
Write-Log ("Watchdog started pid={0} root={1} poll={2}s" -f $myPid, $Root, $PollSeconds)

try {
  do {
    try {
      Ensure-Postgres
      Ensure-Cdp
      Ensure-Cms
      Ensure-Worker
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
