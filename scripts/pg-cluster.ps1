param(
  [ValidateSet('start','stop','status')]
  [string]$Action = 'status'
)

$clusterData = Join-Path $env:LOCALAPPDATA "real-estate-cms-pg\data"
$clusterLog = Join-Path $env:LOCALAPPDATA "real-estate-cms-pg\postgres.log"
$pgCtl = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter pg_ctl.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $pgCtl -or -not (Test-Path $clusterData)) {
  Write-Host "Cluster chua tao. Chay: npm run db:setup-local"
  exit 1
}

switch ($Action) {
  'start' { & $pgCtl -D $clusterData -l $clusterLog start }
  'stop'  { & $pgCtl -D $clusterData stop }
  'status' { & $pgCtl -D $clusterData status }
}
