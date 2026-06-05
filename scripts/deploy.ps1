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
    }
  }

  if (-not $SkipBuild) {
    Run-Step "Build" {
      npm.cmd run build
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
      --exclude=*.log `
      --exclude=db.json `
      --exclude=db.json.*.bak `
      --exclude=$ArchiveName `
      .
  }

  Run-Step "Upload archive to VPS" {
    scp $localArchive "${remote}:$remoteArchive"
  }

  Run-Step "Extract and restart PM2" {
    $remoteCommand = "cd $RemoteDir && rm -rf dist && tar -xzf $remoteArchive && pm2 restart $Pm2Name --update-env && rm -f $remoteArchive"
    ssh $remote $remoteCommand
  }

  Run-Step "Health check" {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 20
    $health | ConvertTo-Json -Depth 5
  }

  Write-Host ""
  Write-Host "Deploy complete." -ForegroundColor Green
} finally {
  if (Test-Path $localArchive) {
    Remove-Item $localArchive -Force
  }
}
