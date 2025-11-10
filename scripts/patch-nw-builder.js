#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to:
 * 1. Disable proxy auto-detection
 * 2. Use GitHub releases as download source instead of dl.nwjs.io
 */

const fs = require("fs");
const path = require("path");

const downloaderPath = path.join(__dirname, "..", "node_modules", "nw-builder", "lib", "downloader.cjs");
const optionsPath = path.join(__dirname, "..", "node_modules", "nw-builder", "src", "constants", "Options.js");

// Exit silently if nw-builder is not installed
if (!fs.existsSync(downloaderPath) && !fs.existsSync(optionsPath)) {
    process.exit(0);
}

// Patch 1: Disable proxy auto-detection in downloader
if (fs.existsSync(downloaderPath)) {
    try {
        let content = fs.readFileSync(downloaderPath, "utf8");
        const originalContent = content;
        
        // Disable proxy auto-detection
        content = content.replace(/\brq\.proxy\s*=\s*true\s*;?/i, "rq.proxy = false;");
        
        if (content !== originalContent) {
            fs.writeFileSync(downloaderPath, content, "utf8");
            console.log("[patch-nw-builder] Disabled proxy auto-detection");
        }
    } catch (error) {
        console.error("[patch-nw-builder] Error patching downloader:", error.message);
    }
}

// Patch 2: Change downloadUrl from dl.nwjs.io to GitHub releases in Options.js
if (fs.existsSync(optionsPath)) {
    try {
        let content = fs.readFileSync(optionsPath, "utf8");
        const originalContent = content;
        
        // Replace the default downloadUrl to point to GitHub releases
        // From: downloadUrl: "https://dl.nwjs.io/"
        // To:   downloadUrl: "https://github.com/nwjs/nw.js/releases/download/"
        content = content.replace(
            /downloadUrl:\s*"https:\/\/dl\.nwjs\.io\/"/,
            'downloadUrl: "https://github.com/nwjs/nw.js/releases/download/"'
        );
        
        if (content !== originalContent) {
            fs.writeFileSync(optionsPath, content, "utf8");
            console.log("[patch-nw-builder] Redirected downloads to GitHub releases");
        }
    } catch (error) {
        console.error("[patch-nw-builder] Error patching Options.js:", error.message);
    }
}
