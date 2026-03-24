# Emuflight Configurator

**Emuflight Configurator** is a crossplatform configuration tool for the [Emuflight](https://github.com/emuflight) flight control system.

![Emuflight](.github/screenshot.png)

Supports quadcopters, hexacopters, octocopters, and fixed-wing aircraft. Configure any [supported Emuflight target](https://github.com/emuflight/EmuFlight/tree/master/src/main/target).

## Table of Contents
- [Quick Start](#quick-start)
- [Downloads](#downloads)
- [Installation](#installation)
- [Development](#development)
- [Notes](#notes)
- [Support](#support)

## Quick Start

```bash
yarn install
yarn dev        # build dist/ and start the app in dev mode (devtools enabled)
```

## Downloads

Please [download our releases](https://github.com/emuflight/EmuConfigurator/releases) at GitHub.

## Installation

Download the installer for your platform from the [Releases](https://github.com/emuflight/EmuConfigurator/releases) page.

**macOS:** Right-click the app and select **Open** to bypass Gatekeeper on first launch.

## Development

### Requirements

1. [Node.js](https://nodejs.org/en/download/package-manager/) (LTS recommended)
2. Yarn: `npm install -g yarn`
3. `yarn install`

### Commands

| Command | Description |
|---------|-------------|
| `yarn dev` | Build `dist/` and start with devtools auto-open (development mode) |
| `yarn dev:verbose` | Same as `dev` but with full log output |
| `yarn build` | Build `dist/` only (no app launch) |
| `yarn make` | Build `dist/` and create release installers in `out/make/` |
| `yarn make:debug` | Same as `make` but devtools menu enabled in the packaged app |
| `yarn package` | Build `dist/` and package the app without creating installers |
| `yarn package:debug` | Same as `package` but with devtools menu enabled |
| `yarn lint` | Run ESLint linter |

### Build modes

| Mode | How triggered | Devtools menu | Auto-open devtools |
|------|--------------|---------------|--------------------|
| `dev` | `yarn dev` | Yes | Yes |
| `debug_package` | `yarn make:debug` / `yarn package:debug` | Yes | No |
| `release` | `yarn make` / `yarn package` | No | No |

### Build output

- `dist/` — assembled app sources (built by `scripts/build.js`)
- `out/` — packaged Electron app and installers

### Code Quality

The project uses **ESLint** for code quality: `yarn lint`

**Testing:** Unit tests have been removed in favor of manual testing and linting. For a configuration UI tool like EmuConfigurator, manual testing via `yarn dev` is more effective for catching real-world issues.

### Building Packages

**All Platforms:**
- `yarn make` builds release packages per platform
- Output goes to `out/make/` directory

**macOS (Darwin):**
- **ZIP** (`*.zip`) — Portable app archive
- **DMG** (`*.dmg`) — Branded disk image installer (requires `macos-alias` on macOS)
- Code signing: Uses ad-hoc signing by default
- For certificate-based signing: Set `APPLE_SIGNING_IDENTITY` environment variable
- For notarization: Set `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

**Windows:**
- **EXE** (`*.exe`) — Squirrel.Windows installer
- Code signing: Uses certificate from `sign/EmuCert.p12` if `WINDOWS_CERT_FILE` and `WINDOWS_CERT_PASSWORD` are set
- For CI: Configure these as GitHub repository secrets

**Linux:**
- **DEB** — Debian/Ubuntu package
- **RPM** — Red Hat/Fedora package

### Code Signing Configuration

**Local Development (no certificates required):**
```bash
yarn make  # Uses ad-hoc signing on macOS, no signing on other platforms
```

**CI/Distribution with Certificates:**

Set GitHub repository secrets:
- `WINDOWS_CERT_FILE`: Path or base64-encoded EmuCert.p12
- `WINDOWS_CERT_PASSWORD`: Certificate password
- `APPLE_SIGNING_IDENTITY`: Apple Distribution certificate name (optional, for macOS)
- `APPLE_TEAM_ID`: Apple Team ID (required if code signing)
- `APPLE_ID`: Apple ID email (optional, for notarization)
- `APPLE_PASSWORD`: App-specific password (optional, for notarization)

## Notes

### Linux: serial port access

Add your user to the `dialout` group:

```bash
sudo usermod -aG dialout $USER
```
Then log out and back in.

### Linux: USB DFU flashing

USB access without `sudo` requires a udev rule. Create `/etc/udev/rules.d/49-stm32dfu.rules`:

```
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev"
```

Then: `sudo udevadm control --reload-rules && sudo udevadm trigger`

## Support

- [Emuflight Discord](https://discord.gg/gdP9CwE)
- [Configurator issues](https://github.com/emuflight/EmuConfigurator/issues)
- [Firmware issues](https://github.com/emuflight/EmuFlight/issues)

---

![Emuflight](.github/EmuFlight.png)
