#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-install patch for nw-builder v4
 * Downloads and caches NW.js version manifest
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const cacheDir = path.join(__dirname, "..", "cache");
const manifestPath = path.join(cacheDir, "manifest.json");

// Create cache directory
if (!fs.existsSync(cacheDir)) {
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch (error) {
        // Silent
    }
}

// Pre-download manifest with proper redirect following
if (!fs.existsSync(manifestPath)) {
    const manifestUrl = "https://nwjs.io/versions.json";
    
    const downloadManifest = (url) => {
        const protocol = url.startsWith("https") ? https : http;
        
        protocol.get(url, (res) => {
            // Follow redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadManifest(res.headers.location);
                return;
            }
            
            if (res.statusCode === 200) {
                let data = "";
                res.on("data", (chunk) => { data += chunk; });
                res.on("end", () => {
                    try {
                        // v4 stores manifest with leading ')]}'' stripped
                        const cleanData = data.startsWith(")]}'" ) ? data.slice(4) : data;
                        fs.writeFileSync(manifestPath, cleanData, "utf8");
                        console.log("[patch-nw-builder] ✓ Cached NW.js version manifest");
                    } catch (err) {
                        // Silent
                    }
                });
            }
        }).on("error", () => {
            // Silent
        });
    };
    
    downloadManifest(manifestUrl);
}

// Removed local patch that modified the installed `nw-builder` source.
// Upstream `nw-builder` (>= 4.17.2) should include the manifestUrl handling, but some
// installs may still pull older dependencies. We keep the safe manifest pre-download above
// and apply a **small, idempotent** fix to the installed `@nwutils/getter` only if required.
try {
    const getterMain = path.join(__dirname, '..', 'node_modules', '@nwutils', 'getter', 'src', 'main.js');
    if (fs.existsSync(getterMain)) {
        let g = fs.readFileSync(getterMain, 'utf8');
        if (g.indexOf("const manifestUrl = (typeof options.manifestUrl") === -1 && g.indexOf("options.manifestUrl.startsWith('file://')") !== -1) {
            g = g.replace(
                "  const manifestFilePath = path.resolve(options.cacheDir, \"manifest.json\");\n  if (options.manifestUrl.startsWith('file://')) {\n    const filePath = url.fileURLToPath(options.manifestUrl);\n    fs.writeFileSync(manifestFilePath, fs.readFileSync(filePath, 'utf-8'));\n  } else {\n    await request(options.manifestUrl, manifestFilePath);\n  }\n  const manifestData = JSON.parse(await fs.promises.readFile(manifestFilePath, \"utf-8\"));",
                "  const manifestFilePath = path.resolve(options.cacheDir, \"manifest.json\");\n  const manifestUrl = (typeof options.manifestUrl === 'string') ? options.manifestUrl : 'https://nwjs.io/versions.json';\n  if (manifestUrl.startsWith('file://')) {\n    const filePath = url.fileURLToPath(manifestUrl);\n    fs.writeFileSync(manifestFilePath, fs.readFileSync(filePath, 'utf-8'));\n  } else {\n    await request(manifestUrl, manifestFilePath);\n  }\n  const manifestData = JSON.parse(await fs.promises.readFile(manifestFilePath, \"utf-8\"));"
            );
            fs.writeFileSync(getterMain, g, 'utf8');
            console.log('[patch-nw-builder] Patched @nwutils/getter to guard manifestUrl usage');
        }
    }
} catch (e) {
    // Non-fatal
}

// Ensure nw-builder passes manifestUrl into getter (idempotent; minimal and safe)
try {
    const nwBuilderIndex = path.join(__dirname, '..', 'node_modules', 'nw-builder', 'src', 'index.js');
    if (fs.existsSync(nwBuilderIndex)) {
        let idx = fs.readFileSync(nwBuilderIndex, 'utf8');
        if (idx.indexOf('manifestUrl: options.manifestUrl') === -1) {
            idx = idx.replace(
                "      downloadUrl: options.downloadUrl,\n      cacheDir: options.cacheDir,",
                "      downloadUrl: options.downloadUrl,\n      manifestUrl: options.manifestUrl, // ensure getter receives manifestUrl\n      cacheDir: options.cacheDir,"
            );
            fs.writeFileSync(nwBuilderIndex, idx, 'utf8');
            console.log('[patch-nw-builder] Patched nw-builder to pass manifestUrl to getter');
        }
    }
} catch (e) {
    // Non-fatal
}

