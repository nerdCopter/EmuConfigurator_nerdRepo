#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to redirect NW.js downloads to GitHub releases
 */

const fs = require("fs");
const path = require("path");

// Patch the compiled dist file where the default downloadUrl is baked in
const distPath = path.join(__dirname, "..", "node_modules", "nw-builder", "dist", "index.cjs");

// Exit silently if nw-builder dist is not available
if (!fs.existsSync(distPath)) {
    process.exit(0);
}

let content;
try {
    content = fs.readFileSync(distPath, "utf8");
} catch (error) {
    console.error("[patch-nw-builder] Error reading dist/index.cjs:", error.message);
    process.exit(1);
}

const originalContent = content;

// Replace all occurrences of the default downloadUrl in the minified code
// Pattern: downloadUrl:"https://dl.nwjs.io/" or downloadUrl: "https://dl.nwjs.io/"
content = content.replace(
    /downloadUrl:\s*"https:\/\/dl\.nwjs\.io\/"/g,
    'downloadUrl:"https://github.com/nwjs/nw.js/releases/download/"'
);

if (content !== originalContent) {
    try {
        fs.writeFileSync(distPath, content, "utf8");
        console.log("[patch-nw-builder] Redirected NW.js downloads to GitHub releases");
    } catch (error) {
        console.error("[patch-nw-builder] Error writing dist/index.cjs:", error.message);
        process.exit(1);
    }
}
