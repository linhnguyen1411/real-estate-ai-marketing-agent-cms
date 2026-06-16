$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Start-Process 'chrome' '--new-window chrome://extensions/' | Out-Null
Start-Sleep -Seconds 4

$rootEl = [System.Windows.Automation.AutomationElement]::RootElement
$winCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Window
)
$windows = $rootEl.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)

foreach ($win in $windows) {
  $title = $win.Current.Name
  if ($title -notmatch 'Chrome|Tiện ích|Extensions|Google Chrome') { continue }
  Write-Host "=== Window: $title ==="
  $btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  $buttons = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
  foreach ($btn in $buttons) {
    $n = $btn.Current.Name
    if ($n -match 'Estoria|Reload|Tải|Lead|Luu lead|Tai lai|Remove|Xóa|Details|Chi tiết') {
      Write-Host "  BTN: [$n]"
    }
  }
}
