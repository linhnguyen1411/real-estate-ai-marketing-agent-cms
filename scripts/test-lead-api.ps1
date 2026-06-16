param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Email = "owner@example.com",
  [string]$Password = "owner123"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Estoria Lead API Test ===" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl"

# 0. Health (no auth)
Write-Host "`n[0] GET /api/leads/health" -ForegroundColor Yellow
$health = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/leads/health"
Write-Host "OK - api $($health.data.api) v$($health.data.version), endpoints: $($health.data.endpoints.Count)" -ForegroundColor Green

# 1. Login
Write-Host "`n[1] POST /api/auth/login" -ForegroundColor Yellow
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/auth/login" -ContentType "application/json" -Body $loginBody
if ($login.status -ne "success") { throw "Login failed" }
$token = $login.data.token
Write-Host "OK - token length: $($token.Length)" -ForegroundColor Green

$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}

# 2. Extract single
Write-Host "`n[2] POST /api/leads/extract" -ForegroundColor Yellow
$extractBody = @{
  raw_content = "Can Ban nhanh lo Thanh luong 16, Hoa Xuan, TP Da Nang. Block B1.54. Gia 5ty850. LH 0905274869"
  url = "https://facebook.com/groups/test"
} | ConvertTo-Json
$extract = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/leads/extract" -Headers $headers -Body $extractBody
Write-Host "OK - phone: $($extract.data.phone), demand: $($extract.data.demand_type)" -ForegroundColor Green

# 3. Extract batch
Write-Host "`n[3] POST /api/leads/extract-batch" -ForegroundColor Yellow
$batchExtractBody = @{
  items = @(
    @{ raw_content = "Can ban lo Hoa Xuan LH 0905274869 gia 5ty850"; source_url = "https://facebook.com/groups/bds"; block_id = "blk-001" },
    @{ raw_content = "Ban dat Cam Le LH 0911796192 gia 3 ty"; source_url = "https://facebook.com/groups/bds"; block_id = "blk-002" },
    @{ raw_content = "Cho thue shophouse Zalo 0935888999 Da Nang"; source_url = "https://facebook.com/groups/bds"; block_id = "blk-003" }
  )
} | ConvertTo-Json -Depth 5
$batchExtract = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/leads/extract-batch" -Headers $headers -Body $batchExtractBody
Write-Host "OK - count: $($batchExtract.data.count), with_phone: $($batchExtract.data.with_phone)" -ForegroundColor Green
$batchExtract.data.items | ForEach-Object { Write-Host "  - $($_.phone) | $($_.demand_type) | $($_.location)" }

# 4. Batch save
Write-Host "`n[4] POST /api/leads/batch-save" -ForegroundColor Yellow
$testPhone = "0905" + (Get-Random -Minimum 100000 -Maximum 999999)
$saveBody = @{
  source = "facebook-feed-auto"
  leads = @(
    @{
      phone = $testPhone
      raw_content = "Can ban lo test API LH $testPhone gia 4 ty Hoa Xuan"
      source_url = "https://facebook.com/groups/test-api"
      block_id = "test-script"
      demand_type = "sell"
      property_type = "Dat nen"
      location = "Hoa Xuan, Cam Le"
      budget = 4
    }
  )
} | ConvertTo-Json -Depth 5
$save = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/leads/batch-save" -Headers $headers -Body $saveBody
Write-Host "OK - saved: $($save.data.saved_count), duplicate: $($save.data.duplicate_count)" -ForegroundColor Green

# 5. List customers
Write-Host "`n[5] GET /api/customers" -ForegroundColor Yellow
$customers = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/customers" -Headers @{ Authorization = "Bearer $token" }
$count = ($customers.data | Measure-Object).Count
Write-Host "OK - total customers visible: $count" -ForegroundColor Green

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
Write-Host "CRM dashboard: $BaseUrl/admin/dashboard"
