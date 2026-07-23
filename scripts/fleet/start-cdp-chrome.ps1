# Start Chrome with remote debugging for Facebook CDP scan (one workstation).
# Profile is dedicated — never use %LOCALAPPDATA%\Google\Chrome\User Data.
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ProfileDir = if ($env:AGENT_CDP_PROFILE_DIR) { $env:AGENT_CDP_PROFILE_DIR } else { Join-Path $Root 'runtime\agent-cdp-profile' }
$CdpPort = if ($env:AGENT_CDP_PORT) { $env:AGENT_CDP_PORT } else { '9222' }
$StartUrl = if ($env:AGENT_LOGIN_START_URL) { $env:AGENT_LOGIN_START_URL } else { 'https://www.facebook.com/' }

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$Chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Chrome) {
  Write-Error 'Google Chrome not found. Install Chrome or set CHROME_PATH.'
}

if ($env:CHROME_PATH -and (Test-Path $env:CHROME_PATH)) {
  $Chrome = $env:CHROME_PATH
}

Write-Host '[fleet] CDP Chrome'
Write-Host "  profile: $ProfileDir"
Write-Host "  port:    $CdpPort"
Write-Host "  url:     $StartUrl"
Write-Host 'Log in to Facebook in this window and keep it open.'

Start-Process -FilePath $Chrome -ArgumentList @(
  "--remote-debugging-port=$CdpPort",
  "--user-data-dir=$ProfileDir",
  '--no-first-run',
  '--no-default-browser-check',
  $StartUrl
)
