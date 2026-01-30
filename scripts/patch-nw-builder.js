#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to disable proxy auto-detection
 * Compatible with nw-builder 3.8.3
 * 
 * Note: downloadUrl is configured directly in gulpfile.js, so this only needs to disable proxy.
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
// Use flexible regex to handle variations in formatting
const proxyRegex = /rq\.proxy\s*=\s*true/;
if (!proxyRegex.test(content)) {
    console.warn("[patch-nw-builder] Proxy pattern not found; patch not applied. Expected nw-builder 3.8.3. Check if nw-builder version or code structure has changed.");
} else {
    content = content.replace(proxyRegex, "rq.proxy = false");
    if (content !== originalContent) {
        try {
            fs.writeFileSync(downloaderPath, content, "utf8");
            console.log("[patch-nw-builder] Disabled proxy auto-detection");
        } catch (error) {
            console.error("[patch-nw-builder] Error writing file:", error.message);
            process.exit(1);
        }
    }
}
