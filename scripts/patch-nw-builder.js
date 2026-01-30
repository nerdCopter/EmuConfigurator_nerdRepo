#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to fix macOS ARM64 download issues
 * Compatible with nw-builder 3.8.3
 * 
 * Issue: request package has ARM64 incompatibility on macOS with Node.js 18+
 * Fix: Replace request with follow-redirects (already in dependencies)
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

// Replace require("request") with follow-redirects
content = content.replace(
    /var request = require\("request"\);/,
    "var http = require(\"http\");\nvar https = require(\"https\");\nvar { http: httpRedirect, https: httpsRedirect } = require(\"follow-redirects\");\nvar request = function(url) { return url.startsWith(\"https\") ? httpsRedirect.get(url) : httpRedirect.get(url); };"
);

// Remove proxy setting (not needed with follow-redirects)
content = content.replace(
    /rq\.proxy = false;/,
    "// proxy auto-handling enabled by follow-redirects"
);

if (content !== originalContent) {
    try {
        fs.writeFileSync(downloaderPath, content, "utf8");
        console.log("[patch-nw-builder] ✓ Patched downloader for ARM64 macOS compatibility (replaced request with follow-redirects)");
    } catch (error) {
        console.error("[patch-nw-builder] Error writing file:", error.message);
        process.exit(1);
    }
} else {
    console.warn("[patch-nw-builder] Warning: patterns not found. Expected nw-builder 3.8.3. Check if version or code structure has changed.");
}
