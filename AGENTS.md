# AGENTS.md - Tasks

This document outlines the remaining tasks and known issues for getting the EmuConfigurator build workflows fully functional across all platforms.

## Linux

-   **Debug Build:** Launches, but encounters application execution errors (No net_fetcher, InitializeSandbox, Skia shader compilation error). The previous `ENOENT` error is resolved.
-   **Release Build:** Completed. `npx gulp release` successfully creates `.zip`, `.deb`, and `.rpm` packages with the correct executable name (`emuflight-configurator`).

## Windows

-   **Debug Build:**
    -   **Task:** The `download-nwjs` task in `gulpfile.js` uses the `decompress` library, which should handle `.zip` files on Windows. This needs to be tested on a Windows environment to confirm it works as expected.
    -   **Task:** Test `yarn run start` on a Windows environment.
    -   **Task:** Verify `getRunDebugAppCommand` correctly returns the path to `nw.exe` for Windows. **Status:** Verified by code inspection. The function correctly returns `./nwjs-sdk/nw.exe` on the `win32` platform.

-   **Release Build:**
    -   **Task:** The `download-nwjs` task in `gulpfile.js` uses the `decompress` library, which should handle `.zip` files on Windows. This needs to be tested on a Windows environment to confirm it works as expected.
    -   **Task:** Test `npx gulp release` on a Windows environment.
    -   **Known Issue:** The `release_win` task passes `APP_BUNDLE_PATH` to `assets/windows/installer.nsi`. The `installer.nsi` script needs to be modified to correctly utilize this variable to package the application from the new bundle location. **Status:** Resolved. The `gulpfile.js` has been updated to pass the `APP_BUNDLE_PATH`, and the `installer.nsi` script was confirmed to use it correctly.

## macOS

-   **Debug Build:**
    -   **Task:** The `download-nwjs` task in `gulpfile.js` uses the `decompress` library, which should handle `.zip` files on macOS. This needs to be tested on a macOS environment to confirm it works as expected.
    -   **Task:** Test `yarn run start` on a macOS environment.
    -   **Task:** Verify `getRunDebugAppCommand` correctly returns the path to `nwjs.app/Contents/MacOS/nwjs` for macOS. **Status:** Verified by code inspection. The function correctly returns the expected path on the `darwin` platform.

-   **Release Build:**
    -   **Task:** The `download-nwjs` task in `gulpfile.js` uses the `decompress` library, which should handle `.zip` files on macOS. This needs to be tested on a macOS environment to confirm it works as expected.
    -   **Task:** Test `npx gulp release` on a macOS environment.
    -   **Known Issue:** The `release_osx64` task uses the correct `basepath` for `appdmg`. The application icon has been enabled. Need to verify that `appdmg` works as expected with the new bundle structure and that code signing (if enabled) functions correctly.

## General

-   **NW.js Download Location:** The original `nw-builder` issues stemmed from potential changes in NW.js download locations. The current solution bypasses `nw-builder` for downloading and uses `https://dl.nwjs.io` directly. This approach should be robust, but continued monitoring of NW.js download infrastructure is advisable.
-   **Yarn/Gulp Usage:** All solutions adhere to using Yarn and Gulp, avoiding the introduction of NPM/NPX where possible, as per user request.
-   **Deprecation Warnings:**
    -   `url.parse()`: A deprecation warning for `url.parse()` indicates an outdated and potentially insecure way of parsing URLs. This warning persists with Yarn Classic and is considered a known, unfixable warning for the current Yarn Classic setup without a significant upgrade to Yarn Berry or a manual audit of Yarn Classic's internal dependencies.
    -   `fs.Stats` constructor: A deprecation warning for `fs.Stats` constructor indicates an outdated API usage, likely from a dependency. This should be addressed by updating the relevant dependency.
    -   **Status:** Resolved by updating `gulp` to `^5.0.1`.
    `gulplog v1 is deprecated`: This warning indicates that one or more `gulp` plugins are using an outdated `gulplog` API. It is likely due to older `gulp` plugins that haven't been updated for `gulp` v5 or are no longer maintained, requiring significant refactoring to update or replace. **Status:** Resolved. Removed unused `gulp-concat` dependency which was causing this warning.
    **`gulp-debian` error (`undefined does not exist`):** This error occurred after updating `gulp-debian` to `0.3.2`. It is caused by `find.fileSync(undefined)` being called within `installConffiles` due to an undefined `pkg.conffiles` property. **Status:** Resolved. Workaround implemented by creating an empty directory (`./empty_conffiles`) and setting `conffiles: './empty_conffiles'` in the `deb` options in `release_deb` to provide a valid path to `find.fileSync`.
-   **Application Execution Errors:** These errors are now observed during the debug build process:
    -   `No net_fetcher for performing AIA chasing.`: This error relates to certificate verification and might impact features relying on HTTPS.
    -   `InitializeSandbox() called with multiple threads in process gpu-process.`: This suggests a problem with the Chromium sandbox, potentially leading to security vulnerabilities or instability.
    -   `Skia shader compilation error`: This is a graphics rendering error that could lead to visual glitches or performance issues in the application's UI.
-   **Raster Image Rendering Issue (JPG/PNG):** JPG and PNG images fail to display as background images or direct `<img>` elements, while SVG images render correctly. This suggests a specific issue with how the NW.js environment handles raster image decoding or rendering. This is likely related to the "Skia shader compilation error" observed during debug builds.
-   **Deep Research & Fact-Checking:** Ongoing deep research and fact-checking will be performed as new issues arise during cross-platform implementation and testing.