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
    // macOS signing: uses certificate if available, falls back to ad-hoc
    // For CI: set APPLE_TEAM_ID, APPLE_SIGNING_IDENTITY
    // For local: uses ad-hoc signing (no certs needed)
    ...(process.platform === 'darwin' ? {
      osxSign: {
        identity: process.env.APPLE_SIGNING_IDENTITY || null,
        hardenedRuntime: true,
        entitlements: require('path').resolve(__dirname, 'sign/entitlements.plist'),
        entitlementsInherit: require('path').resolve(__dirname, 'sign/entitlements.plist'),
        signingFlags: ['--deep', '--force'],
      },
    } : {}),
    // macOS notarization (optional, for app distribution outside App Store)
    // Requires: APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID
    // When enabled, will notarize the DMG during build
    ...(process.platform === 'darwin' && process.env.APPLE_ID ? {
      osxNotarize: {
        tool: 'notarytool',
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      },
    } : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        certificateFile: process.env.WINDOWS_CERT_FILE,
        certificatePassword: process.env.WINDOWS_CERT_PASSWORD,
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
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'UDZO',
        background: require('path').resolve(__dirname, 'assets/osx/dmg-background.png'),
      },
    },
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
