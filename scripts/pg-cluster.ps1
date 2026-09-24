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

function Test-PgClusterRunning {
  & $pgCtl -D $clusterData status *> $null
  return ($LASTEXITCODE -eq 0)
}

switch ($Action) {
  'start' {
    if (Test-PgClusterRunning) {
      Write-Host '[pg] Cluster da chay - bo qua start.' -ForegroundColor Green
      exit 0
    }
    & $pgCtl -D $clusterData -l $clusterLog start
    if ($LASTEXITCODE -ne 0) {
      if (Test-PgClusterRunning) {
        Write-Host '[pg] Cluster da chay - bo qua start.' -ForegroundColor Green
        exit 0
      }
      exit $LASTEXITCODE
    }
  }
  'stop' {
    & $pgCtl -D $clusterData stop
  }
  'status' {
    & $pgCtl -D $clusterData status
  }
}
