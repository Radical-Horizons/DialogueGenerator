# Script to test the frontend (Windows PowerShell friendly).
# NOTE: Keep this file ASCII-only to avoid encoding issues in Windows PowerShell 5.1.

param(
    [switch]$E2E = $false,
    [switch]$Browser = $false
)

Write-Host "=== Frontend Tests ===" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$errors = @()

# 1. Build check
Write-Host "`n1. Build check..." -ForegroundColor Cyan
Set-Location frontend
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    $errors += "Build échoué"
    Write-Host "  X Build failed" -ForegroundColor Red
} else {
    Write-Host "  OK Build passed" -ForegroundColor Green
}

# 2. Lint check
Write-Host "`n2. Lint check..." -ForegroundColor Cyan
npm run lint 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    $errors += "Lint échoué"
    Write-Host "  X Lint failed" -ForegroundColor Red
} else {
    Write-Host "  OK Lint passed" -ForegroundColor Green
}

# 3. Tests unitaires
Write-Host "`n3. Unit tests (Vitest)..." -ForegroundColor Cyan
npm test 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    $errors += "Tests unitaires échoués"
    Write-Host "  X Unit tests failed" -ForegroundColor Red
} else {
    Write-Host "  OK Unit tests passed" -ForegroundColor Green
}

# 4. Tests E2E (optionnel)
if ($E2E) {
    Write-Host "`n4. E2E tests (Playwright)..." -ForegroundColor Cyan
    Set-Location $projectRoot
    npx playwright test 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $errors += "Tests E2E échoués"
        Write-Host "  X E2E tests failed" -ForegroundColor Red
    } else {
        Write-Host "  OK E2E tests passed" -ForegroundColor Green
    }
}

# Résumé
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
    Write-Host "OK All frontend checks passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "X Errors detected:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
    exit 1
}



