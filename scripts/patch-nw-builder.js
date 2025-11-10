#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to:
 * 1. Disable proxy auto-detection in downloader
 * 2. Replace default downloadUrl to use GitHub releases
 */

const fs = require("fs");
const path = require("path");

// Patch the SOURCE file where the default downloadUrl is defined
const optionsPath = path.join(__dirname, "..", "node_modules", "nw-builder", "src", "constants", "Options.js");

// Exit silently if nw-builder source is not available
if (!fs.existsSync(optionsPath)) {
    process.exit(0);
}

let content;
try {
    content = fs.readFileSync(optionsPath, "utf8");
} catch (error) {
    console.error("[patch-nw-builder] Error reading Options.js:", error.message);
    process.exit(1);
}

const originalContent = content;

// Replace the default downloadUrl to point to GitHub releases instead of dl.nwjs.io
// This changes: downloadUrl: "https://dl.nwjs.io/",
// To:         downloadUrl: "https://github.com/nwjs/nw.js/releases/download/",
content = content.replace(
    /downloadUrl:\s*"https:\/\/dl\.nwjs\.io\/"/,
    'downloadUrl: "https://github.com/nwjs/nw.js/releases/download/"'
);

if (content !== originalContent) {
    try {
        fs.writeFileSync(optionsPath, content, "utf8");
        console.log("[patch-nw-builder] Redirected NW.js downloads to GitHub releases");
    } catch (error) {
        console.error("[patch-nw-builder] Error writing Options.js:", error.message);
        process.exit(1);
    }
}
