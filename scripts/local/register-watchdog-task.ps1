# Register Windows Scheduled Task - lean keepalive (worker+CDP+PG, no CMS UI).
param(
  [string]$TaskName = 'RealEstateCMS-LocalWatchdog',
  [switch]$LeanMode,
  [int]$NodeMaxOldSpaceMb = 768
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Watchdog = Join-Path $Root 'scripts\local\watchdog-local.ps1'
$LogDir = Join-Path $Root 'runtime\watchdog\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Default lean unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('LeanMode')) { $LeanMode = $true }

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$extra = "-NodeMaxOldSpaceMb $NodeMaxOldSpaceMb"
if ($LeanMode) { $extra = "$extra -LeanMode" }
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Watchdog`" $extra"

$action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $Root
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $triggerLogon `
  -Settings $settings `
  -Principal $principal `
  -Description 'Minimal keepalive: Postgres + CDP Chrome + agent worker (no false hung kills)' |
  Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Registered + started: $TaskName"
Write-Host "  lean=$([bool]$LeanMode) nodeMb=$NodeMaxOldSpaceMb"
Write-Host "  mode=restart-only-if-dead"
Write-Host "  stop: npm run local:watchdog:stop"
