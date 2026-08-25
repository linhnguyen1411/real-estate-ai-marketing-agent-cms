# Register Windows Scheduled Task so local CMS+worker watchdog survives reboot/logon.
param(
  [string]$TaskName = 'RealEstateCMS-LocalWatchdog'
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Watchdog = Join-Path $Root 'scripts\local\watchdog-local.ps1'
$LogDir = Join-Path $Root 'runtime\watchdog\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Watchdog`""

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
  -Description 'Keep Real Estate AI CMS local Postgres/CDP/dev server/agent worker alive' |
  Out-Null

# Start immediately
Start-ScheduledTask -TaskName $TaskName

Write-Host "Registered + started Scheduled Task: $TaskName"
Write-Host "  script: $Watchdog"
Write-Host "  logs:   $LogDir"
Write-Host "  stop:   npm run local:watchdog:stop"
