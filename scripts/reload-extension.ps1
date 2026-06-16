$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host '>> Build extension...'
npm run build:extension | Out-Host
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$manifestPath = Join-Path $root 'chrome-extension\manifest.json'
$manifestText = Get-Content $manifestPath -Raw
if ($manifestText -match '"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"') {
  $next = [int]$Matches[3] + 1
  $newVersion = "$($Matches[1]).$($Matches[2]).$next"
  $manifestText = [regex]::Replace($manifestText, '"version"\s*:\s*"\d+\.\d+\.\d+"', "`"version`": `"$newVersion`"", 1)
  Set-Content $manifestPath $manifestText -Encoding utf8 -NoNewline
  Write-Host ">> Manifest version -> $newVersion"
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Find-Descendant($parent, $condition) {
  return $parent.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

Write-Host '>> Mo chrome://extensions...'
Start-Process 'chrome' 'chrome://extensions/' | Out-Null
Start-Sleep -Seconds 2

$chrome = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1
if ($chrome) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
  [Win32]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 400
}

$rootEl = [System.Windows.Automation.AutomationElement]::RootElement
$nameCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::NameProperty,
  'Estoria Lead Collector'
)
$extCard = Find-Descendant $rootEl $nameCond

if (-not $extCard) {
  Write-Host '>> Khong tim thay card extension tren chrome://extensions.'
  Write-Host '>> Da build xong — bam nut Reload tren chrome://extensions.'
  exit 0
}

$reloadNames = @('Reload', 'Tải lại', 'Tai lai', 'Refresh')
$reloadBtn = $null
foreach ($name in $reloadNames) {
  $reloadCond = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Button
    )),
    (New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      $name
    ))
  )
  $reloadBtn = Find-Descendant $extCard $reloadCond
  if ($reloadBtn) { break }
}

if (-not $reloadBtn) {
  $btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  $buttons = $extCard.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
  foreach ($btn in $buttons) {
    $label = $btn.Current.Name
    if ($label -match 'reload|tải lại|refresh|remove|details|errors') {
      if ($label -notmatch 'remove|details|errors|xóa|chi tiết|lỗi') {
        $reloadBtn = $btn
        break
      }
    }
  }
}

if ($reloadBtn) {
  $pattern = $reloadBtn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $pattern.Invoke()
  Write-Host '>> Da bam Reload extension.'
} else {
  Write-Host '>> Tim thay extension nhung khong bam duoc Reload — bam tay tren chrome://extensions.'
}
