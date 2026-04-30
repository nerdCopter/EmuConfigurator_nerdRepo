# Git Pre-Commit Hook Setup

Automatic lint enforcement before commits.

## Setup

**All platforms (Linux, macOS, Windows):**

```bash
yarn setup:hooks
```

Or manually for specific platform:

### Linux & macOS

```bash
bash .github/scripts/setup-hooks.sh
```

### Windows (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File .github/scripts/setup-hooks.ps1
```

## How It Works

On every commit:
1. Checks if `node_modules` exists
2. If missing, runs `yarn install`
3. Runs `yarn lint`
4. Blocks commit if lint errors found
5. Allows commit if no errors (warnings are OK)

## Usage

```bash
git commit -m "Your message"
```

If lint passes: ✅ commit succeeds  
If lint fails: ❌ commit blocked

### Fixing Lint Errors

```bash
yarn lint -- --fix     # Auto-fix where possible
git add <files>
git commit -m "Fix: resolve lint issues"
```

### Emergency Bypass

```bash
git commit --no-verify
```

⚠️ Only use for urgent fixes — CI/CD will still check lint.

## Files

- `.github/scripts/pre-commit-hook.sh` — The hook script
- `.github/scripts/setup-hooks.js` — Cross-platform setup (auto-detects OS)
- `.github/scripts/setup-hooks.sh` — Setup for Linux/macOS (manual)
- `.github/scripts/setup-hooks.ps1` — Setup for Windows (manual)
- `.git/hooks/pre-commit` — Installed hook (created by setup script)
