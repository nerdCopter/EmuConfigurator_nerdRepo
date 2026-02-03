# nw-builder ↔ NW.js compatibility (summary)

This project uses `nw-builder` (devDependency) to download/build NW.js runtime for debug and release builds. Different `nw-builder` v4.x releases were tested and shipped roughly alongside specific NW.js major/minor versions. Below is a short compatibility lookup (compiled from `nw-builder` release notes and the NW.js versions manifest):

- `nw-builder` 4.14.x → NW.js v0.102.x (Node 24.5.0 / Node 24.x series)
- `nw-builder` 4.15.x → NW.js v0.102.1
- `nw-builder` 4.16.0 → NW.js v0.103.0 / 0.104.0 (Node 24.x)
- `nw-builder` 4.16.1 → NW.js v0.104.1
- `nw-builder` 4.17.x → (newer NW.js, recommend latest 4.17.x for 0.106/0.107)

Recommendation for this repo

- Use NW.js v0.107.0 (stable as of 2026-01) to get Chromium/Node features and security fixes.
- Bump `nw-builder` to a recent 4.17.x release (e.g., `^4.17.2`) so the builder's defaults and helpers match NW.js 0.106/0.107-era runtimes.
- Pin local Node via `.nvmrc` to the Node version used by the target NW.js release. For NW.js v0.107.0 Node is `25.2.1`.

What I changed

- Added `engines.node` to the repo `package.json` to indicate `>=25.2.1 <26`.
- Updated `devDependencies` in `package.json` to: `"nw-builder": "^4.17.2"` and added `"nw": "0.107.0"` as a dev dependency to make the runtime explicit for developers.
- Updated `.nvmrc` to `25.2.1`.

Follow-up actions (recommended)

1. Test locally by switching Node via `nvm use` (or equivalent) and running `yarn` then `yarn gulp debug`.
2. If CI exists, add an explicit Node version to the CI config to align with `.nvmrc`.
3. Optionally add a `scripts` check (e.g., `preinstall`) that warns when Node doesn't match `.nvmrc`.

If you want, I can:
- Run a fresh debug build while using `.nvmrc` Node and confirm whether the `nwNatives.getRoutingID` error goes away with `nw`/`nw-builder` versions aligned.
- Add a `preinstall` script that checks Node version and prints a friendly error.
