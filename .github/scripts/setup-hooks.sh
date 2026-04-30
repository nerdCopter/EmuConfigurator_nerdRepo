#!/bin/bash
# Setup git pre-commit hook (Linux & macOS)

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "[INFO] Setting up git pre-commit hook..."

# Copy hook script to .git/hooks
mkdir -p .git/hooks
cp .github/scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo "[OK] Hook installed at .git/hooks/pre-commit"
echo "[INFO] Testing the hook on your next commit..."
