$Host.UI.RawUI.WindowTitle = 'Chrome CDP :9222'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location $Root

Write-Host 'Starting Chrome CDP (login Facebook in Chrome)...' -ForegroundColor Green
& powershell -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\fleet\start-cdp-chrome.ps1')
if ($LASTEXITCODE -ne 0) {
  Read-Host 'CDP failed — Enter to close'
  exit 1
}

Write-Host ''
Write-Host 'Chrome should be open. Keep Chrome running for agent scan.' -ForegroundColor Cyan
Write-Host 'CDP check: http://127.0.0.1:9222/json/version' -ForegroundColor DarkGray
Write-Host 'Close this window only after you stop Chrome.' -ForegroundColor DarkGray
Read-Host 'Enter to close (Chrome keeps running)'
