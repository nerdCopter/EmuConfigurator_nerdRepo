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
