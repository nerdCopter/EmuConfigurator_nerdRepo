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
const distPath = path.join(__dirname, "..", "node_modules", "nw-builder", "dist", "index.cjs");

// Exit silently if nw-builder is not installed
if (!fs.existsSync(downloaderPath) && !fs.existsSync(optionsPath) && !fs.existsSync(distPath)) {
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

// Patch 2: Change downloadUrl in SOURCE Options.js (for future builds)
if (fs.existsSync(optionsPath)) {
    try {
        let content = fs.readFileSync(optionsPath, "utf8");
        const originalContent = content;
        
        // Replace the default downloadUrl to point to GitHub releases
        content = content.replace(
            /downloadUrl:\s*"https:\/\/dl\.nwjs\.io\/"/,
            'downloadUrl: "https://github.com/nwjs/nw.js/releases/download/"'
        );
        
        if (content !== originalContent) {
            fs.writeFileSync(optionsPath, content, "utf8");
            console.log("[patch-nw-builder] Patched Options.js source");
        }
    } catch (error) {
        console.error("[patch-nw-builder] Error patching Options.js:", error.message);
    }
}

// Patch 3: Change downloadUrl in COMPILED dist/index.cjs (for immediate effect)
if (fs.existsSync(distPath)) {
    try {
        let content = fs.readFileSync(distPath, "utf8");
        const originalContent = content;
        
        // Replace ALL occurrences of the old downloadUrl in the minified compiled code
        // Pattern can be: downloadUrl:"https://dl.nwjs.io/" or downloadUrl: "https://dl.nwjs.io/"
        content = content.replace(
            /downloadUrl:\s*"https:\/\/dl\.nwjs\.io\/"/g,
            'downloadUrl:"https://github.com/nwjs/nw.js/releases/download/"'
        );
        
        if (content !== originalContent) {
            fs.writeFileSync(distPath, content, "utf8");
            console.log("[patch-nw-builder] Patched dist/index.cjs compiled file");
        }
    } catch (error) {
        console.error("[patch-nw-builder] Error patching dist/index.cjs:", error.message);
    }
}
