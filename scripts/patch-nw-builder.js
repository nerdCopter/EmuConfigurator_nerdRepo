#!/usr/bin/env node
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

let content = fs.readFileSync(downloaderPath, "utf8");
const originalContent = content;

// Disable proxy auto-detection
content = content.replace(/rq\.proxy = true;/, "rq.proxy = false;");

if (content !== originalContent) {
    fs.writeFileSync(downloaderPath, content, "utf8");
    console.log("[patch-nw-builder] Disabled proxy auto-detection");
}
