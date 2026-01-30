#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to fix download issues
 * Compatible with nw-builder 3.8.3
 * 
 * Issue: request package proxy auto-detection causes download failures
 * Fix: Disable proxy in nw-builder downloader
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

// Disable proxy setting which causes download issues on all platforms
if (/rq\.proxy\s*=\s*true/.test(content)) {
    content = content.replace(/rq\.proxy\s*=\s*true/, "rq.proxy = false");
}

if (content !== originalContent) {
    try {
        fs.writeFileSync(downloaderPath, content, "utf8");
        console.log("[patch-nw-builder] ✓ Disabled proxy auto-detection in nw-builder downloader");
    } catch (error) {
        console.error("[patch-nw-builder] Error writing file:", error.message);
        process.exit(1);
    }
}
