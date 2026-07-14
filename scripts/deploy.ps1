param(
  [string]$HostName = "112.213.87.124",
  [string]$User = "root",
  [string]$RemoteDir = "/var/www/real-estate-ai-cms",
  [string]$Pm2Name = "real-estate-ai-cms",
  [string]$ArchiveName = "deploy-real-estate-ai-cms-code.tar.gz",
  [string]$HealthUrl = "https://bdsdanang.site/api/health",
  [switch]$SkipBuild,
  [switch]$SkipLint
)

# DEPRECATED — uses prisma db push --accept-data-loss. Do NOT use for production.
# Prefer: npm run deploy:safe  →  scripts/deploy-safe.ps1 + tmp-vps-safe-deploy.sh
Write-Host "DEPRECATED: scripts/deploy.ps1 uses prisma db push --accept-data-loss." -ForegroundColor Red
Write-Host "Use npm run deploy:safe instead." -ForegroundColor Yellow
throw "Refusing to run deprecated deploy.ps1. Use npm run deploy:safe."

$ErrorActionPreference = "Stop"

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Command
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$remote = "${User}@${HostName}"
$remoteArchive = "/tmp/$ArchiveName"
$localArchive = Join-Path $root $ArchiveName

try {
  if (-not $SkipLint) {
    Run-Step "Type check" {
      npm.cmd run lint
      if ($LASTEXITCODE -ne 0) { throw "lint failed (exit $LASTEXITCODE)" }
    }
  }

  if (-not $SkipBuild) {
    Run-Step "Build (local, optional)" {
      npm.cmd run build
      if ($LASTEXITCODE -ne 0) {
        Write-Host "Local build failed; will build on VPS after upload." -ForegroundColor Yellow
      }
    }
  }

  Run-Step "Create deployment archive" {
    if (Test-Path $localArchive) {
      Remove-Item $localArchive -Force
    }

    tar -czf $ArchiveName `
      --exclude=.git `
      --exclude=node_modules `
      --exclude=data `
      --exclude=.env `
      --exclude=.env.* `
      --exclude=*.log `
      --exclude=db.json `
      --exclude=db.json.*.bak `
      --exclude=$ArchiveName `
      .
  }

  Run-Step "Upload archive to VPS" {
    scp $localArchive "${remote}:$remoteArchive"
  }

  Run-Step "Extract, build on VPS, restart PM2" {
    $remoteCommand = "cd $RemoteDir && rm -rf dist && tar -xzf $remoteArchive && npm install && npx prisma db push --accept-data-loss && npm run build && pm2 restart $Pm2Name --update-env && rm -f $remoteArchive"
    ssh $remote $remoteCommand
    if ($LASTEXITCODE -ne 0) { throw "Remote deploy failed (exit $LASTEXITCODE)" }
  }

  Run-Step "Health check" {
    Start-Sleep -Seconds 4
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 30
    $health | ConvertTo-Json -Depth 5
  }

  Write-Host ""
  Write-Host "Deploy complete." -ForegroundColor Green
} finally {
  if (Test-Path $localArchive) {
    Remove-Item $localArchive -Force
  }
}
