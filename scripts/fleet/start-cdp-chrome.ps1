# Start Chrome with remote debugging for Facebook CDP scan (one workstation).
# Profile is dedicated - never use %LOCALAPPDATA%\Google\Chrome\User Data.
# Enhanced with Self-Healing, SingletonLock auto-cleanup, and Healthcheck.
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$rawProfile = if ($env:AGENT_CDP_PROFILE_DIR) { $env:AGENT_CDP_PROFILE_DIR } else { 'runtime\agent-cdp-profile' }
$ProfileDir = [System.IO.Path]::GetFullPath((Join-Path $Root ($rawProfile -replace '^\.[\\/]', '')))
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

# 1. Healthcheck: Check if Chrome CDP is ALREADY running and responding on port
$cdpTestUrl = "http://127.0.0.1:$CdpPort/json/version"
try {
  $testResponse = Invoke-RestMethod -Uri $cdpTestUrl -TimeoutSec 2 -ErrorAction Stop
  if ($testResponse.Browser) {
    Write-Host "[fleet] Chrome CDP is ALREADY active on port $CdpPort ($($testResponse.Browser))" -ForegroundColor Green
    Write-Host "  Profile: $ProfileDir"
    exit 0
  }
} catch {
  # Port is not responding, proceeding to cleanup and launch
}

# 2. Self-Healing: Clean orphaned SingletonLock if Chrome is not running
$lockFile = Join-Path $ProfileDir 'SingletonLock'
$socketFile = Join-Path $ProfileDir 'SingletonSocket'
$cookieFile = Join-Path $ProfileDir 'SingletonCookie'

if (Test-Path $lockFile) {
  Write-Host "[fleet] Detected stale SingletonLock file at $ProfileDir. Cleaning up..." -ForegroundColor Yellow
  try {
    Remove-Item -Force $lockFile -ErrorAction SilentlyContinue
    Remove-Item -Force $socketFile -ErrorAction SilentlyContinue
    Remove-Item -Force $cookieFile -ErrorAction SilentlyContinue
    Write-Host "[fleet] Stale lock files removed successfully." -ForegroundColor Green
  } catch {
    Write-Warning "[fleet] Could not remove lock file: $_"
  }
}

Write-Host '[fleet] Starting CDP Chrome' -ForegroundColor Cyan
Write-Host "  profile: $ProfileDir"
Write-Host "  port:    $CdpPort"
Write-Host "  url:     $StartUrl"
Write-Host 'Log in to Facebook in this window and keep it open.'

# Standard flags for dedicated CDP session with optimized memory
$args = @(
  "--remote-debugging-port=$CdpPort",
  "--user-data-dir=$ProfileDir",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  $StartUrl
)

Start-Process -FilePath $Chrome -ArgumentList $args -WindowStyle Normal

# 3. Post-launch Healthcheck verification
Start-Sleep -Seconds 3
$verified = $false
for ($attempt = 1; $attempt -le 5; $attempt++) {
  try {
    $verRes = Invoke-RestMethod -Uri $cdpTestUrl -TimeoutSec 2 -ErrorAction Stop
    if ($verRes.Browser) {
      Write-Host "[fleet] Chrome CDP successfully connected on port $CdpPort ($($verRes.Browser))" -ForegroundColor Green
      $verified = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $verified) {
  Write-Warning "[fleet] Chrome launched but port $CdpPort did not respond immediately. Please verify the window opened."
}
