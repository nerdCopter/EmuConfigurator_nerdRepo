#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder to redirect NW.js downloads to GitHub releases
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Patch the SOURCE file where the default downloadUrl is defined
const optionsPath = path.join(__dirname, "..", "node_modules", "nw-builder", "src", "constants", "Options.js");
const nwBuilderDir = path.join(__dirname, "..", "node_modules", "nw-builder");

// Exit silently if nw-builder source is not available
if (!fs.existsSync(optionsPath)) {
    process.exit(0);
}

let content;
try {
    content = fs.readFileSync(optionsPath, "utf8");
} catch (error) {
    console.error("[patch-nw-builder] Error reading Options.js:", error.message);
    process.exit(1);
}

const originalContent = content;

// Replace the default downloadUrl to point to GitHub releases instead of dl.nwjs.io
// This changes: downloadUrl: "https://dl.nwjs.io/",
// To:         downloadUrl: "https://github.com/nwjs/nw.js/releases/download/",
content = content.replace(
    /downloadUrl:\s*"https:\/\/dl\.nwjs\.io\/"/,
    'downloadUrl: "https://github.com/nwjs/nw.js/releases/download/"'
);

if (content !== originalContent) {
    try {
        fs.writeFileSync(optionsPath, content, "utf8");
        console.log("[patch-nw-builder] Patched Options.js to use GitHub releases");
        
        // Rebuild nw-builder's dist files to apply the patch
        try {
            console.log("[patch-nw-builder] Rebuilding nw-builder...");
            execSync("npm run build", { cwd: nwBuilderDir, stdio: "inherit" });
            console.log("[patch-nw-builder] Successfully rebuilt nw-builder");
        } catch (buildError) {
            console.error("[patch-nw-builder] Warning: Could not rebuild nw-builder, trying with npx esbuild...");
            try {
                const esbuildPath = path.join(nwBuilderDir, "node_modules", ".bin", "esbuild");
                execSync(`${esbuildPath} src/index.js --bundle --minify --platform=node --outfile=./dist/index.cjs`, 
                    { cwd: nwBuilderDir, stdio: "inherit" });
                console.log("[patch-nw-builder] Successfully rebuilt with esbuild");
            } catch (esbuildError) {
                console.warn("[patch-nw-builder] Warning: Could not rebuild nw-builder, patch applied to source only");
            }
        }
    } catch (error) {
        console.error("[patch-nw-builder] Error writing Options.js:", error.message);
        process.exit(1);
    }
}
