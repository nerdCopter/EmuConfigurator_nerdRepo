#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to fix download issues
 * Compatible with nw-builder 3.8.3
 * 
 * Issue: request package fails on macOS/Windows with redirect handling
 * Fix: Disable proxy and enable explicit redirect following
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
let patched = false;

// Fix 1: Disable proxy setting which causes issues
if (/rq\.proxy\s*=\s*true/.test(content)) {
    content = content.replace(/rq\.proxy\s*=\s*true/, "rq.proxy = false");
    patched = true;
}

// Fix 2: Add explicit redirect following by modifying the request call
// This ensures redirects are followed on all platforms
if (/rq = request\(url\)/.test(content)) {
    content = content.replace(
        /rq = request\(url\)/,
        "rq = request(url, { followRedirect: true, followAllRedirects: true })"
    );
    patched = true;
}

if (patched && content !== originalContent) {
    try {
        fs.writeFileSync(downloaderPath, content, "utf8");
        console.log("[patch-nw-builder] ✓ Patched downloader for cross-platform download reliability");
    } catch (error) {
        console.error("[patch-nw-builder] Error writing file:", error.message);
        process.exit(1);
    }
} else if (!patched) {
    console.warn("[patch-nw-builder] Warning: no patches applied. Expected nw-builder 3.8.3. Check if version or code structure has changed.");
} else {
    console.log("[patch-nw-builder] No changes needed (already patched)");
}
