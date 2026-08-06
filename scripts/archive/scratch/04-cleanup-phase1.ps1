# Phase 1 cleanup — mechanical file moves only (docs + scripts archive).
# No package.json edit, no code edit here — that part goes to Cursor Agent (05-cursor-agent-prompt.md).
#
# Usage (PowerShell, tu thu muc goc repo):
#   .\04-cleanup-phase1.ps1                # dry-run mac dinh, chi in ra se lam gi
#   .\04-cleanup-phase1.ps1 -Apply         # chay that, tu tao branch rieng

param(
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $RepoRoot

$Branch = "chore/repo-cleanup-$(Get-Date -Format yyyyMMdd)"

function Invoke-Step {
  param([string]$Description, [scriptblock]$Action)
  if ($Apply) {
    Write-Host "+ $Description"
    & $Action
  } else {
    Write-Host "[dry-run] $Description"
  }
}

function Move-GitItem {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path $Source)) { return }
  Invoke-Step "git mv `"$Source`" -> `"$Destination`"" {
    $destDir = Split-Path $Destination -Parent
    if ($destDir -and -not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
    git mv $Source $Destination
  }
}

if ($Apply) {
  $dirty = git status --porcelain
  if ($dirty) {
    Write-Error "Working tree khong sach - commit/stash truoc da."
    exit 1
  }
  git checkout -b $Branch
}

Write-Host "== Docs =="
$archiveDirs = @(
  "docs/archive/refactor",
  "docs/archive/architecture",
  "docs/archive/production-release",
  "docs/archive/audit",
  "docs/archive/feature-reports"
)
foreach ($d in $archiveDirs) {
  Invoke-Step "mkdir $d" { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

# refactor/* except DATA-RETENTION-POLICY.md (keep at current path)
if (Test-Path "docs/refactor") {
  Get-ChildItem "docs/refactor" -File | Where-Object { $_.Name -ne "DATA-RETENTION-POLICY.md" } | ForEach-Object {
    Move-GitItem $_.FullName.Replace("$RepoRoot\", "").Replace('\','/') "docs/archive/refactor/$($_.Name)"
  }
}

# architecture/* -> archive
if (Test-Path "docs/architecture") {
  Get-ChildItem "docs/architecture" -File -Recurse | ForEach-Object {
    $rel = $_.FullName.Replace("$RepoRoot\", "").Replace('\','/')
    Move-GitItem $rel "docs/archive/architecture/$($_.Name)"
  }
}

# production, release, mission-engine -> production-release
foreach ($d in @("production","release","mission-engine")) {
  $path = "docs/$d"
  if (Test-Path $path) {
    Get-ChildItem $path -File -Recurse | ForEach-Object {
      $rel = $_.FullName.Replace("$RepoRoot\", "").Replace('\','/')
      Move-GitItem $rel "docs/archive/production-release/$($_.Name)"
    }
  }
}

if (Test-Path "docs/audit") {
  Get-ChildItem "docs/audit" -File | ForEach-Object {
    Move-GitItem "docs/audit/$($_.Name)" "docs/archive/audit/$($_.Name)"
  }
}

$featureDirs = @("telegram","publishing","automation","ai","ai-scanner-2","leads","media","roadmap","ui","testing","performance","admin","prompts","evolution")
foreach ($d in $featureDirs) {
  $path = "docs/$d"
  if (Test-Path $path) {
    Get-ChildItem $path -File -Recurse | ForEach-Object {
      $rel = $_.FullName.Replace("$RepoRoot\", "").Replace('\','/')
      Move-GitItem $rel "docs/archive/feature-reports/$($_.Name)"
    }
  }
}

# top-level loose docs (giu lai 5 file operational guide, phan con lai archive)
Get-ChildItem "docs" -File -Filter *.md | ForEach-Object {
  Move-GitItem "docs/$($_.Name)" "docs/archive/feature-reports/$($_.Name)"
}

Write-Host ""
Write-Host "== Scripts =="
foreach ($d in @("scripts/archive/tmp","scripts/archive/scratch","scripts/archive/manual-tests","scripts/archive/one-off-migrations")) {
  Invoke-Step "mkdir $d" { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

Get-ChildItem "scripts" -File -Filter "tmp-*" | ForEach-Object {
  Move-GitItem "scripts/$($_.Name)" "scripts/archive/tmp/$($_.Name)"
}

Get-ChildItem "scripts" -File -Filter "_*" | ForEach-Object {
  Move-GitItem "scripts/$($_.Name)" "scripts/archive/scratch/$($_.Name)"
}

$oneOffPatterns = @("backfill-*.ts","migrate-*.ts","recover-*.ts","purge-*.ts","fix-*.mjs")
foreach ($pattern in $oneOffPatterns) {
  Get-ChildItem "scripts" -File -Filter $pattern | ForEach-Object {
    Move-GitItem "scripts/$($_.Name)" "scripts/archive/one-off-migrations/$($_.Name)"
  }
}

Write-Host ""
Write-Host "NOTE: test-*.ts / smoke-*.ts KHONG move tu dong o day - nhieu cai con duoc goi qua npm scripts."
Write-Host "      Viec ra tung cai (con dung hay khong) + sua package.json de trong 05-cursor-agent-prompt.md."
Write-Host ""

if ($Apply) {
  Invoke-Step "git add -A" { git add -A }
  Invoke-Step "git commit" { git commit -m "chore: archive stale docs + one-off scripts (mechanical move, phase 1)" }
  Write-Host "Xong. Dang o branch $Branch - review 'git diff main --stat' roi tao PR."
} else {
  Write-Host "Day la dry-run. Chay '.\04-cleanup-phase1.ps1 -Apply' de thuc hien that tren branch moi."
}