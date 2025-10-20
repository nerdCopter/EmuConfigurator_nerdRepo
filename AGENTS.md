# AGENTS.md - Tasks

This document outlines the remaining tasks and known issues for getting the EmuConfigurator build workflows fully functional across all platforms.

## Linux

-   **Debug Build:** Completed. `yarn run start` successfully launches the GUI application.
-   **Release Build:** Completed. `npx gulp release` successfully creates `.zip`, `.deb`, and `.rpm` packages.

## Windows

-   **Debug Build:**
    -   **Task:** Test `yarn run start` on a Windows environment.
    -   **Known Issue:** The `download-nwjs` task currently uses the `unzip` shell command, which is not natively available on Windows. This needs to be replaced with a Node.js-based zip extraction library (e.g., `yauzl`, `adm-zip`) or a Windows-native command (e.g., PowerShell `Expand-Archive`).
    -   **Task:** Verify `getRunDebugAppCommand` correctly returns the path to `nw.exe` for Windows.

-   **Release Build:**
    -   **Task:** Test `npx gulp release` on a Windows environment.
    -   **Known Issue:** The `release_win` task now passes `APP_BUNDLE_PATH` to `assets/windows/installer.nsi`. The `installer.nsi` script needs to be modified to correctly utilize this variable to package the application from the new bundle location.

## macOS

-   **Debug Build:**
    -   **Task:** Test `yarn run start` on a macOS environment.
    -   **Known Issue:** The `download-nwjs` task uses the `unzip` shell command, which should work on macOS, but needs verification.
    -   **Task:** Verify `getRunDebugAppCommand` correctly returns the path to `nwjs.app/Contents/MacOS/nwjs` for macOS.

-   **Release Build:**
    -   **Task:** Test `npx gulp release` on a macOS environment.
    -   **Known Issue:** The `release_osx64` task now uses the correct `basepath` for `appdmg`. Need to verify that `appdmg` works as expected with the new bundle structure and that code signing (if enabled) functions correctly.

## General

-   **NW.js Download Location:** The original `nw-builder` issues stemmed from potential changes in NW.js download locations. The current solution bypasses `nw-builder` for downloading and uses `https://dl.nwjs.io` directly. This approach should be robust, but continued monitoring of NW.js download infrastructure is advisable.
-   **Yarn/Gulp Usage:** All solutions adhere to using Yarn and Gulp, avoiding the introduction of NPM/NPX where possible, as per user request.
-   **Deep Research & Fact-Checking:** Ongoing deep research and fact-checking will be performed as new issues arise during cross-platform implementation and testing.
