$ErrorActionPreference = "Stop"

$ports = 3000, 24678
foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Start-Sleep -Seconds 1
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
npm run dev
