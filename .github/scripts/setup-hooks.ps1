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

$HookSource = ".github\scripts\pre-commit-hook.sh"
$HookDest = "$HooksDir\pre-commit"

# Back up existing hook if it exists
if (Test-Path $HookDest) {
  $Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $BackupPath = "$HookDest.bak.$Timestamp"
  Copy-Item -Path $HookDest -Destination $BackupPath -Force
  Write-Host "[INFO] Backed up existing hook to $(Split-Path -Leaf $BackupPath)" -ForegroundColor Yellow
}

Copy-Item -Path $HookSource -Destination $HookDest -Force

Write-Host "[OK] Hook installed at .git\hooks\pre-commit" -ForegroundColor Green
Write-Host "[INFO] Testing the hook on your next commit..." -ForegroundColor Yellow
