# Setup git pre-commit hook (Windows PowerShell)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
Set-Location $ProjectRoot

Write-Host "[INFO] Setting up git pre-commit hook..." -ForegroundColor Green

# Copy hook script to .git/hooks
$HooksDir = ".git\hooks"
if (-not (Test-Path $HooksDir)) {
  New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null
}

Copy-Item -Path ".github\scripts\pre-commit-hook.sh" -Destination "$HooksDir\pre-commit" -Force

Write-Host "[OK] Hook installed at .git\hooks\pre-commit" -ForegroundColor Green
Write-Host "[INFO] Testing the hook on your next commit..." -ForegroundColor Yellow
