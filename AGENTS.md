# AGENTS.md - Tasks

This document outlines the remaining tasks and known issues for getting the EmuConfigurator build workflows fully functional across all platforms.

## Linux

-   **Debug Build:** Completed. `yarn run start` successfully launches the GUI application with the correct executable name (`emuflight-configurator`).
-   **Release Build:** Completed. `npx gulp release` successfully creates `.zip`, `.deb`, and `.rpm` packages with the correct executable name (`emuflight-configurator`).

## Windows

-   **Debug Build:**
    -   **Task:** Implement cross-platform zip extraction for NW.js SDK download (currently uses `tar` for Linux, `unzip` for macOS, and `yauzl` was attempted for Windows but reverted).
    -   **Task:** Test `yarn run start` on a Windows environment.
    -   **Task:** Verify `getRunDebugAppCommand` correctly returns the path to `nw.exe` for Windows.

-   **Release Build:**
    -   **Task:** Implement cross-platform zip extraction for NW.js SDK download.
    -   **Task:** Test `npx gulp release` on a Windows environment.
    -   **Known Issue:** The `release_win` task passes `APP_BUNDLE_PATH` to `assets/windows/installer.nsi`. The `installer.nsi` script needs to be modified to correctly utilize this variable to package the application from the new bundle location.

## macOS

-   **Debug Build:**
    -   **Task:** Implement cross-platform zip extraction for NW.js SDK download.
    -   **Task:** Test `yarn run start` on a macOS environment.
    -   **Task:** Verify `getRunDebugAppCommand` correctly returns the path to `nwjs.app/Contents/MacOS/nwjs` for macOS.

-   **Release Build:**
    -   **Task:** Implement cross-platform zip extraction for NW.js SDK download.
    -   **Task:** Test `npx gulp release` on a macOS environment.
    -   **Known Issue:** The `release_osx64` task uses the correct `basepath` for `appdmg`. Need to verify that `appdmg` works as expected with the new bundle structure and that code signing (if enabled) functions correctly.

## General

-   **NW.js Download Location:** The original `nw-builder` issues stemmed from potential changes in NW.js download locations. The current solution bypasses `nw-builder` for downloading and uses `https://dl.nwjs.io` directly. This approach should be robust, but continued monitoring of NW.js download infrastructure is advisable.
-   **Yarn/Gulp Usage:** All solutions adhere to using Yarn and Gulp, avoiding the introduction of NPM/NPX where possible, as per user request.
-   **Deprecation Warnings:**
    -   `url.parse()`: A deprecation warning for `url.parse()` indicates an outdated and potentially insecure way of parsing URLs. This likely originates from a dependency and should be addressed by updating the relevant dependency.
    -   `fs.Stats` constructor: A deprecation warning for `fs.Stats` constructor indicates an outdated API usage, likely from a dependency. This should be addressed by updating the relevant dependency.
-   **Application Execution Errors:**
    -   `No net_fetcher for performing AIA chasing.`: This error relates to certificate verification and might impact features relying on HTTPS.
    -   `InitializeSandbox() called with multiple threads in process gpu-process.`: This suggests a problem with the Chromium sandbox, potentially leading to security vulnerabilities or instability.
    -   `Skia shader compilation error`: This is a graphics rendering error that could lead to visual glitches or performance issues in the application's UI.
-   **Deep Research & Fact-Checking:** Ongoing deep research and fact-checking will be performed as new issues arise during cross-platform implementation and testing.