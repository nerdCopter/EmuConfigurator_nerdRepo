const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: require('path').resolve(__dirname, 'assets/osx/app-icon'),
    // Bake build mode into packaged package.json so main.js can read it at runtime
    extraMetadata: {
      buildMode: process.env.EMUCFG_BUILD_MODE || 'release'
    },
    // macOS signing: ad-hoc by default (works without certs)
    // To use certificate: set APPLE_SIGNING_IDENTITY environment variable
    ...(process.platform === 'darwin' ? {
      osxSign: {
        ...(process.env.APPLE_SIGNING_IDENTITY ? { identity: process.env.APPLE_SIGNING_IDENTITY } : {}),
        hardenedRuntime: true,
        entitlements: require('path').resolve(__dirname, 'sign/entitlements.plist'),
        entitlementsInherit: require('path').resolve(__dirname, 'sign/entitlements.plist'),
        signingFlags: ['--deep', '--force'],
      },
    } : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-nsis',
      platforms: ['win32'],
      config: {
        // NSIS options for professional Windows installer experience
        installerIcon: require('path').resolve(__dirname, 'assets/windows/emu_installer.ico'),
        uninstallerIcon: require('path').resolve(__dirname, 'assets/windows/emu_uninstaller.ico'),
        // Critical fix: disable runAfterInstall to prevent app launching during setup
        // (Avoids confusing user experience where app starts, closes, and restarts)
        // Users must manually launch app from Start Menu or Desktop shortcut after installation
        runAfterInstall: false,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux'],
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'nerdCopter',
          homepage: 'https://github.com/nerdCopter/EmuConfigurator_nerdRepo',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          homepage: 'https://github.com/nerdCopter/EmuConfigurator_nerdRepo',
        },
      },
    },
    // DMG maker: Skip in CI (macos-alias native module doesn't build reliably in CI)
    // Users can build DMG locally with: yarn make (macOS only)
    // ZIP is sufficient for distribution on macOS
    ...(!process.env.CI && process.platform === 'darwin' ? [{
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'UDZO',
        background: require('path').resolve(__dirname, 'assets/osx/dmg-background.png'),
      },
    }] : []),
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
