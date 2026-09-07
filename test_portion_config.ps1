# Test Script for Portion Configuration API
# Usage: .\test_portion_config.ps1 -DeviceId "IOPAKAN_12345678"

param(
    [string]$DeviceId = "IOPAKAN_12345678",
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Testing Portion Config API" -ForegroundColor Cyan
Write-Host "Device ID: $DeviceId" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get default configuration
Write-Host "[TEST 1] Get Default Configuration" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/devices/$DeviceId/portion-config" -Method GET
    Write-Host "✅ Success:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Update configuration with valid values
Write-Host "[TEST 2] Update Configuration (Valid)" -ForegroundColor Yellow
$validConfig = @{
    sedikit = 4
    sedang = 8
    banyak = 12
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/devices/$DeviceId/portion-config" `
        -Method PUT `
        -Body $validConfig `
        -ContentType "application/json"
    Write-Host "✅ Success:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Get updated configuration
Write-Host "[TEST 3] Get Updated Configuration" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/devices/$DeviceId/portion-config" -Method GET
    Write-Host "✅ Success:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Update with invalid values (should fail)
Write-Host "[TEST 4] Update Configuration (Invalid - Zero Value)" -ForegroundColor Yellow
$invalidConfig = @{
    sedikit = 0
    sedang = 8
    banyak = 12
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/devices/$DeviceId/portion-config" `
        -Method PUT `
        -Body $invalidConfig `
        -ContentType "application/json"
    Write-Host "❌ Should have failed but succeeded!" -ForegroundColor Red
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "✅ Expected failure:" -ForegroundColor Green
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}
Write-Host ""

# Test 5: Update with missing fields (should fail)
Write-Host "[TEST 5] Update Configuration (Missing Field)" -ForegroundColor Yellow
$incompleteConfig = @{
    sedikit = 4
    sedang = 8
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/devices/$DeviceId/portion-config" `
        -Method PUT `
        -Body $incompleteConfig `
        -ContentType "application/json"
    Write-Host "❌ Should have failed but succeeded!" -ForegroundColor Red
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "✅ Expected failure:" -ForegroundColor Green
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}
Write-Host ""

# Test 6: Reset to default values
Write-Host "[TEST 6] Reset to Default Values" -ForegroundColor Yellow
$defaultConfig = @{
    sedikit = 3
    sedang = 6
    banyak = 10
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/devices/$DeviceId/portion-config" `
        -Method PUT `
        -Body $defaultConfig `
        -ContentType "application/json"
    Write-Host "✅ Success:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Testing Complete!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
