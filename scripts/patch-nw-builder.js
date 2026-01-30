#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to fix download issues
 * Compatible with nw-builder 3.8.3
 * 
 * Issue: request package fails on macOS ARM64 with Node.js 18+
 * Fix: On macOS, replace request with native https module + manual redirect handling
 *      On other platforms, enable redirect options
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

// For macOS: replace request with native https module
if (process.platform === "darwin") {
    // Replace require("request") with a native https wrapper
    if (/var request = require\("request"\);/.test(content)) {
        const httpsWrapper = `var url = require("url");
var https = require("https");
var request = function(urlString) {
  var options = url.parse(urlString);
  options.method = "GET";
  options.agent = false;
  var stream = null;
  var req = https.get(options, function(res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      req = request(res.headers.location);
    } else {
      stream = res;
    }
  });
  req.on("response", function(res) {
    if (!stream) stream = res;
  });
  return req;
};`;
        content = content.replace(
            /var request = require\("request"\);/,
            httpsWrapper
        );
        patched = true;
    }
} else {
    // For non-macOS: just enable redirect options
    if (/rq = request\(url\)/.test(content)) {
        content = content.replace(
            /rq = request\(url\)/,
            "rq = request(url, { followRedirect: true, followAllRedirects: true })"
        );
        patched = true;
    }
}

// Disable proxy on all platforms
if (/rq\.proxy\s*=\s*true/.test(content)) {
    content = content.replace(/rq\.proxy\s*=\s*true/, "rq.proxy = false");
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
