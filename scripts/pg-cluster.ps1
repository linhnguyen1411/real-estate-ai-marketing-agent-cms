param(
  [ValidateSet('start','stop','status')]
  [string]$Action = 'status'
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$clusterDir = Join-Path $root "runtime\local-pg\real-estate-cms-pg"
$clusterData = Join-Path $clusterDir "data"
$clusterLog = Join-Path $clusterDir "postgres.log"
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
