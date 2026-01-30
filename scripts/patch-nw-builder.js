#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to fix download issues
 * Compatible with nw-builder 3.8.3
 * 
 * Issue: request package fails on macOS/Windows in GitHub Actions
 * Fix: Create a wrapper that uses https-proxy-agent to handle redirects properly
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

// Simple fix: just disable proxy setting entirely since it causes issues
const proxyRegex = /rq\.proxy\s*=\s*true/;
content = content.replace(proxyRegex, "rq.proxy = false // disabled to fix download issues");

if (content !== originalContent) {
    try {
        fs.writeFileSync(downloaderPath, content, "utf8");
        console.log("[patch-nw-builder] ✓ Patched downloader to bypass request package issues");
    } catch (error) {
        console.error("[patch-nw-builder] Error writing file:", error.message);
        process.exit(1);
    }
} else {
    console.warn("[patch-nw-builder] Warning: patterns not found. Expected nw-builder 3.8.3. Check if version or code structure has changed.");
}
