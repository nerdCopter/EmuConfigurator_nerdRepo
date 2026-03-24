# Emuflight Configurator

**Emuflight Configurator** is a crossplatform configuration tool for the [Emuflight](https://github.com/emuflight) flight control system.

![Emuflight](.github/screenshot.png)

Supports quadcopters, hexacopters, octocopters, and fixed-wing aircraft. Configure any [supported Emuflight target](https://github.com/emuflight/EmuFlight/tree/master/src/main/target).

## Downloads

Please [download our releases](https://github.com/emuflight/EmuConfigurator/releases) at GitHub.

## Installation

Download the installer for your platform from the [Releases](https://github.com/emuflight/EmuConfigurator/releases) page.

**macOS:** Right-click the app and select **Open** to bypass Gatekeeper on first launch.

## Support

- [Emuflight Discord](https://discord.gg/gdP9CwE)
- [Configurator issues](https://github.com/nerdCopter/EmuConfigurator_nerdRepo/issues)
- [Firmware issues](https://github.com/emuflight/EmuFlight/issues)

---

## Development

### Requirements

1. [Node.js](https://nodejs.org/en/download/package-manager/) (LTS recommended)
2. Yarn: `npm install -g yarn`
3. `yarn install`

### Commands

| Command | Description |
|---------|-------------|
| `yarn dev` | Start dev mode with devtools |
| `yarn build` | Build `dist/` only |
| `yarn make` | Create release packages (all platforms) |
| `yarn make:debug` | Release packages with devtools |
| `yarn lint` | Run ESLint |

### Build Output

- `dist/` — assembled app sources
- `out/make/` — packaged applications and installers

**Platform packages:**
- **macOS**: `.zip` + branded `.dmg`
- **Windows**: `.exe` installer
- **Linux**: `.deb` + `.rpm`

### Platform Notes

**Linux: Serial Port Access**
```bash
sudo usermod -aG dialout $USER
# Log out and back in
```

**Linux: USB DFU Flashing**
Create `/etc/udev/rules.d/49-stm32dfu.rules`:
```
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev"
```
Then: `sudo udevadm control --reload-rules && sudo udevadm trigger`

---

![Emuflight](.github/EmuFlight.png)
