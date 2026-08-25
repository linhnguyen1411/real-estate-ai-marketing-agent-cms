param(
  [string]$PostgresPassword = $env:LOCAL_POSTGRES_PASSWORD,
  [string]$PostgresUser = "postgres",
  [int]$PreferredPort = 5432,
  [string]$DbName = "real_estate_ai",
  [string]$AppUser = "real_estate_ai",
  [string]$AppPassword = "localdev",
  [string]$ServiceName = "postgresql-x64-18",
  [switch]$SkipSync
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
$envFile = Join-Path $root ".env"
$secretsFile = Join-Path $root ".env.postgres"
$clusterDir = Join-Path $root "runtime\local-pg\real-estate-cms-pg"
$clusterData = Join-Path $clusterDir "data"
$clusterLog = Join-Path $clusterDir "postgres.log"
$clusterPort = 5434

if (-not $PostgresPassword -and (Test-Path $secretsFile)) {
  Get-Content $secretsFile | ForEach-Object {
    if ($_ -match '^\s*POSTGRES_PASSWORD\s*=\s*(.+)\s*$') {
      $PostgresPassword = $matches[1].Trim().Trim('"').Trim("'")
    }
  }
}

function Get-PgBin([string]$Name) {
  $bin = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "$Name.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
  if (-not $bin) {
    throw "Khong tim thay $Name.exe. Cai PostgreSQL: winget install PostgreSQL.PostgreSQL.18"
  }
  return $bin
}

function Write-EnvDatabaseUrl([string]$Url) {
  $lines = @()
  if (Test-Path $envFile) {
    $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^DATABASE_URL=' }
  } elseif (Test-Path (Join-Path $root ".env.example")) {
    $lines = Get-Content (Join-Path $root ".env.example") | Where-Object { $_ -notmatch '^DATABASE_URL=' }
  }
  $lines += "DATABASE_URL=$Url"
  Set-Content -Path $envFile -Value $lines -Encoding utf8
  Write-Host "DATABASE_URL -> $Url" -ForegroundColor Green
}

function Test-PortListen([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Invoke-Psql([string]$Psql, [int]$Port, [string]$Database, [string]$Sql, [string]$User, [string]$Password) {
  if ($Password) { $env:PGPASSWORD = $Password } else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  & $Psql -w -U $User -h localhost -p $Port -d $Database -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed on port $Port" }
}

function Setup-SystemPostgres([string]$Psql, [int]$Port, [string]$Password) {
  Write-Host "==> Dung PostgreSQL service tren port $Port" -ForegroundColor Cyan
  Invoke-Psql $Psql $Port "postgres" @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$AppUser') THEN
    CREATE ROLE $AppUser LOGIN PASSWORD '$AppPassword';
  ELSE
    ALTER ROLE $AppUser WITH PASSWORD '$AppPassword';
  END IF;
END
`$`$;
"@ $PostgresUser $Password

  $dbExists = & $Psql -w -U $PostgresUser -h localhost -p $Port -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
  if ($Password) { $env:PGPASSWORD = $Password }
  if ($dbExists.Trim() -ne "1") {
    Invoke-Psql $Psql $Port "postgres" "CREATE DATABASE $DbName OWNER $AppUser" $PostgresUser $Password
  }
  return "postgresql://${AppUser}:${AppPassword}@localhost:${Port}/${DbName}?schema=public"
}

function Ensure-UserCluster([string]$Initdb, [string]$PgCtl, [string]$Psql) {
  Write-Host "==> Tao cluster PostgreSQL local (port $clusterPort)" -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $clusterDir -Force | Out-Null

  if (-not (Test-Path (Join-Path $clusterData "PG_VERSION"))) {
    & $Initdb -D $clusterData -U $PostgresUser -A trust -E UTF8 --locale=C --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw "initdb failed" }
    $conf = Join-Path $clusterData "postgresql.conf"
    Add-Content -Path $conf -Value "`nport = $clusterPort`nlisten_addresses = 'localhost'`n"
  }

  $status = & $PgCtl -D $clusterData status 2>&1 | Out-String
  if ($status -notmatch 'server is running') {
    if (Test-Path $clusterLog) { Remove-Item $clusterLog -Force -ErrorAction SilentlyContinue }
    & $PgCtl -D $clusterData -l $clusterLog start -w -t 60
    if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed: $status" }
  }

  Invoke-Psql $Psql $clusterPort "postgres" @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$AppUser') THEN
    CREATE ROLE $AppUser LOGIN PASSWORD '$AppPassword';
  ELSE
    ALTER ROLE $AppUser WITH PASSWORD '$AppPassword';
  END IF;
END
`$`$;
"@ $PostgresUser $null

  $dbExists = & $Psql -w -U $PostgresUser -h localhost -p $clusterPort -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
  if ($dbExists.Trim() -ne "1") {
    Invoke-Psql $Psql $clusterPort "postgres" "CREATE DATABASE $DbName OWNER $AppUser" $PostgresUser $null
  }

  return "postgresql://${AppUser}:${AppPassword}@localhost:${clusterPort}/${DbName}?schema=public"
}

# Stop Docker (optional)
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try { docker rm -f re-cms-postgres 2>&1 | Out-Null } catch {}
}

$psql = Get-PgBin "psql"
$initdb = Get-PgBin "initdb"
$pgCtl = Get-PgBin "pg_ctl"

$url = $null
if ($PostgresPassword -and (Test-PortListen $PreferredPort)) {
  try {
    Invoke-Psql $psql $PreferredPort "postgres" "SELECT 1" $PostgresUser $PostgresPassword
    $url = Setup-SystemPostgres $psql $PreferredPort $PostgresPassword
  } catch {
    Write-Host "Password he thong khong dung, tao cluster rieng..." -ForegroundColor Yellow
  }
}

if (-not $url) {
  if ($PostgresPassword -and (Test-PortListen $PreferredPort)) {
    Write-Host "Tip: dat password dung trong .env.postgres de dung PostgreSQL port $PreferredPort" -ForegroundColor Yellow
  }
  $url = Ensure-UserCluster $initdb $pgCtl $psql
}

Write-EnvDatabaseUrl $url

Write-Host "==> Prisma push" -ForegroundColor Cyan
npm run prisma:push

$dump = Join-Path $root "data/prod-dump.sql"
if (-not $SkipSync -and (Test-Path $dump)) {
  Write-Host "==> Restore production dump" -ForegroundColor Cyan
  npm run db:sync-prod
}

Write-Host ""
Write-Host "PostgreSQL local san sang (khong Docker)." -ForegroundColor Green
Write-Host "Chay app: npm run dev"
