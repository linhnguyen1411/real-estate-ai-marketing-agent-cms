# Chuyển Ollama models sang ổ D: (khi ổ C: đầy). Chạy trong PowerShell:
#   .\scripts\setup-ollama-d-drive.ps1

$modelsDir = "D:\ollama\models"
$ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

Stop-Process -Name ollama, "ollama app" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
[Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $modelsDir, "User")
$env:OLLAMA_MODELS = $modelsDir

Write-Host "OLLAMA_MODELS = $modelsDir"
Write-Host "Free C: $([math]::Round((Get-PSDrive C).Free/1GB, 2)) GB"

if (-not (Test-Path $ollamaExe)) {
  Write-Host "Cai Ollama tu https://ollama.com truoc."
  exit 1
}

Write-Host "Pull qwen2.5 full (~4.7GB) vao o D:..."
& $ollamaExe pull qwen2.5

& $ollamaExe list
Write-Host "Xong. Mo lai Ollama app (tray) neu can. Trong CMS Settings: model qwen2.5"
