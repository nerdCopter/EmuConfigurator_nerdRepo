#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to disable proxy auto-detection
 */

const fs = require("fs");
const path = require("path");

const downloaderPath = path.join(__dirname, "..", "node_modules", "nw-builder", "lib", "downloader.cjs");

// Exit silently if nw-builder is not installed (e.g., in dist/ folder)
if (!fs.existsSync(downloaderPath)) {
    process.exit(0);
}

let content;
try {
    content = fs.readFileSync(downloaderPath, "utf8");
} catch (error) {
    console.error("[patch-nw-builder] Error reading file:", error.message);
    process.exit(1);
}

const originalContent = content;


// Disable proxy auto-detection
content = content.replace(/\brq\.proxy\s*=\s*true\s*;?/i, "rq.proxy = false;");


// Patch NW.js download URLs for GitHub releases (Linux, Windows, OSX)
// Match Linux, Windows, and OSX (osx-x64, osx-ia32, etc.)
const githubRe = /https:\/\/dl\.nwjs\.io\/v([\d.]+)\/(nwjs(?:-sdk)?-v\1-(linux|win|osx)-(x64|ia32|x86|arm64|arm)\.(zip|tar\.gz))/g;
// OSX: match both nwjs-v{version}-osx-x64.zip and nwjs-sdk-v{version}-osx-x64.zip
const githubOsxUniversalRe = /https:\/\/dl\.nwjs\.io\/v([\d.]+)\/(nwjs(-sdk)?-v\1-osx-(x64|ia32|x86|arm64|arm)\.zip)/g;

// Replace Linux/Windows URLs
content = content.replace(githubRe, (match, version, filename, platform, arch, ext) => {
    let githubPlatform = platform;
    if (platform === 'win') githubPlatform = 'win';
    if (platform === 'linux') githubPlatform = 'linux';
    // Use .zip for win, .tar.gz for linux
    let realExt = (platform === 'linux') ? 'tar.gz' : 'zip';
    let flavor = filename.includes('-sdk-') ? '-sdk' : '';
    let archStr = arch === 'x64' ? 'x64' : (arch === 'ia32' || arch === 'x86') ? 'ia32' : arch;
    let newName = `nwjs${flavor}-v${version}-${githubPlatform}-${archStr}.${realExt}`;
    return `https://github.com/nwjs/nw.js/releases/download/v${version}/${newName}`;
});

// Replace OSX URLs (osx-x64, osx-ia32, etc.)
content = content.replace(githubOsxUniversalRe, (match, version, sdk, arch) => {
    // sdk is either undefined or '-sdk'
    let flavor = sdk || '';
    let archStr = arch === 'x64' ? 'x64' : (arch === 'ia32' || arch === 'x86') ? 'ia32' : arch;
    let newName = `nwjs${flavor}-v${version}-osx-${archStr}.zip`;
    return `https://github.com/nwjs/nw.js/releases/download/v${version}/${newName}`;
});

if (content !== originalContent) {
    try {
        fs.writeFileSync(downloaderPath, content, "utf8");
        console.log("[patch-nw-builder] Disabled proxy auto-detection");
    } catch (error) {
        console.error("[patch-nw-builder] Error writing file:", error.message);
        process.exit(1);
    }
}
