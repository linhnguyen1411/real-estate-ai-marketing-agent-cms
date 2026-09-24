# Ensure node/npm on PATH when launched from Desktop shortcut (no user profile).
$nodeDir = Join-Path ${env:ProgramFiles} 'nodejs'
if ((Test-Path $nodeDir) -and ($env:Path -notlike "*$nodeDir*")) {
  $env:Path = "$nodeDir;$env:Path"
}
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
  Write-Host 'ERROR: npm not found. Install Node.js or add it to PATH.' -ForegroundColor Red
  Read-Host 'Enter to close'
  exit 1
}
