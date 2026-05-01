#!/bin/bash
# Setup git pre-commit hook (Linux & macOS)

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "[INFO] Setting up git pre-commit hook..."

# Copy hook script to .git/hooks
mkdir -p .git/hooks

HOOK_DEST=".git/hooks/pre-commit"
HOOK_SOURCE=".github/scripts/pre-commit-hook.sh"

# Back up existing hook if it exists
if [ -f "$HOOK_DEST" ]; then
  TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
  BACKUP_PATH="${HOOK_DEST}.bak.${TIMESTAMP}"
  cp "$HOOK_DEST" "$BACKUP_PATH"
  echo "[INFO] Backed up existing hook to $(basename "$BACKUP_PATH")"
fi

cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "[OK] Hook installed at .git/hooks/pre-commit"
echo "[INFO] Testing the hook on your next commit..."
