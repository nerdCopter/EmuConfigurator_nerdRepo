const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

// Build modes (set by npm scripts in package.json):
//   'dev'           - `yarn dev` sets NODE_ENV=development → devtools auto-open + menu item
//   'debug_package' - `yarn make:debug` sets EMUCFG_BUILD_MODE=debug_package → menu item only, no auto-open
//   'release'       - `yarn make` (default) → no devtools, no menu item
function getBuildMode() {
  if (process.env.NODE_ENV === 'development') return 'dev';
  try {
    // electron-forge extraMetadata bakes buildMode into the packaged package.json
    return require('./package.json').buildMode || 'release';
  } catch (e) {
    return 'release';
  }
}

function setupMenu(buildMode) {
  const showDevTools = buildMode !== 'release';
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }]
    }] : []),
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        ...(showDevTools ? [
          { type: 'separator' },
          { role: 'toggleDevTools', label: 'Toggle Developer Tools' }
        ] : [])
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'EmuFlight Documentation',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://github.com/emuflight/EmuFlight/wiki');
          }
        },
        {
          label: 'EmuFlight GitHub',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://github.com/emuflight');
          }
        },
        {
          label: 'EmuFlight Discord',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://discord.gg/BWqgBg3');
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Window size constraints
const MIN_WINDOW_WIDTH = 980;
const MIN_WINDOW_HEIGHT = 600;

// --- Serial port IPC bridge ---
let _serialPort = null; // active serialport instance

// IPC: list serial ports from main process
ipcMain.handle('serial-list-ports', async () => {
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    return ports.map(p => p.path);
  } catch (e) {
    console.error('main.js: serialport list failed, trying fs fallback:', e.message);
    try {
      const fs = require('fs');
      const entries = fs.readdirSync('/dev').filter(f => /^tty(USB|ACM|S)\d+$/.test(f));
      return entries.map(f => '/dev/' + f);
    } catch (fsErr) {
      return [];
    }
  }
});

// IPC: open serial port
ipcMain.handle('serial-connect', async (event, portPath, options) => {
  try {
    const { SerialPort } = require('serialport');
    if (_serialPort && _serialPort.isOpen) {
      await new Promise((resolve) => _serialPort.close(resolve));
    }
    _serialPort = new SerialPort({
      path: portPath,
      baudRate: options.bitrate || 115200,
      autoOpen: false,
    });
    await new Promise((resolve, reject) => {
      _serialPort.open((err) => err ? reject(err) : resolve());
    });
    // Forward incoming data to renderer
    _serialPort.on('data', (data) => {
      event.sender.send('serial-data', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    });
    _serialPort.on('error', (err) => {
      console.error('main.js serialport error:', err.message);
      event.sender.send('serial-error', err.message);
    });
    _serialPort.on('close', () => {
      event.sender.send('serial-close');
    });
    return { connectionId: 1, bitrate: options.bitrate || 115200 };
  } catch (e) {
    console.error('main.js: serial-connect failed:', e.message);
    return null;
  }
});

// IPC: send data over serial port
ipcMain.handle('serial-send', async (event, bufferData) => {
  if (!_serialPort || !_serialPort.isOpen) return { bytesSent: 0, error: 'not_connected' };
  const buf = Buffer.from(bufferData);
  return new Promise((resolve) => {
    _serialPort.write(buf, (err) => {
      if (err) {
        resolve({ bytesSent: 0, error: err.message });
      } else {
        _serialPort.drain(() => resolve({ bytesSent: buf.length }));
      }
    });
  });
});

// IPC: close serial port
ipcMain.handle('serial-disconnect', async () => {
  if (!_serialPort || !_serialPort.isOpen) return true;
  return new Promise((resolve) => {
    _serialPort.close((err) => {
      _serialPort = null;
      resolve(!err);
    });
  });
});

// IPC: detect DFU USB devices
const _usbOpenDevices = new Map();

function usbKeyFromDevice(device) {
  return `${device.busNumber}:${device.deviceAddress}`;
}

function findUsbDeviceByKey(key) {
  const { usb } = require('usb');
  return usb.getDeviceList().find((d) => usbKeyFromDevice(d) === key) || null;
}

function ensureUsbDeviceOpen(key) {
  let device = _usbOpenDevices.get(key) || findUsbDeviceByKey(key);
  if (!device) {
    throw new Error(`USB device not found: ${key}`);
  }
  if (!device.interfaces) {
    device.open();
  }
  _usbOpenDevices.set(key, device);
  return device;
}

function toBmRequestType(direction, requestType, recipient) {
  let bm = 0;
  if (direction === 'in') {
    bm |= 0x80;
  }

  if (requestType === 'class') {
    bm |= 0x20;
  } else if (requestType === 'vendor') {
    bm |= 0x40;
  }

  if (recipient === 'interface') {
    bm |= 0x01;
  } else if (recipient === 'endpoint') {
    bm |= 0x02;
  } else if (recipient === 'other') {
    bm |= 0x03;
  }

  return bm;
}

ipcMain.handle('usb-list-dfu', async () => {
  try {
    const { usb } = require('usb');
    const DFU_IDS = [
      { vendorId: 0x0483, productId: 0xDF11 },
      { vendorId: 0x2DAE, productId: 0x0003 },
    ];

    return usb.getDeviceList()
      .filter((d) => {
        const desc = d.deviceDescriptor || {};
        return DFU_IDS.some((id) => id.vendorId === desc.idVendor && id.productId === desc.idProduct);
      })
      .map((d) => ({
        device: usbKeyFromDevice(d),
        vendorId: d.deviceDescriptor.idVendor,
        productId: d.deviceDescriptor.idProduct,
        serialNumber: '',
        manufacturer: '',
        product: '',
      }));
  } catch (e) {
    console.error('usb-list-dfu error:', e.message);
    return [];
  }
});

ipcMain.handle('usb-open-device', async (event, deviceKey) => {
  try {
    ensureUsbDeviceOpen(deviceKey);
    return { success: true };
  } catch (e) {
    console.error('usb-open-device error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('usb-close-device', async (event, deviceKey) => {
  try {
    const device = _usbOpenDevices.get(deviceKey);
    if (device && device.interfaces) {
      device.close();
    }
    _usbOpenDevices.delete(deviceKey);
    return { success: true };
  } catch (e) {
    console.error('usb-close-device error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('usb-claim-interface', async (event, deviceKey, interfaceNumber) => {
  try {
    const device = ensureUsbDeviceOpen(deviceKey);
    const iface = device.interface(interfaceNumber);
    iface.claim();
    return { success: true };
  } catch (e) {
    console.error('usb-claim-interface error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('usb-release-interface', async (event, deviceKey, interfaceNumber) => {
  try {
    const device = ensureUsbDeviceOpen(deviceKey);
    const iface = device.interface(interfaceNumber);
    await new Promise((resolve, reject) => {
      iface.release(true, (err) => (err ? reject(err) : resolve()));
    });
    return { success: true };
  } catch (e) {
    console.error('usb-release-interface error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('usb-get-configuration', async (event, deviceKey) => {
  try {
    const device = ensureUsbDeviceOpen(deviceKey);
    const configDescriptor = device.configDescriptor || {};
    // Flatten ALL interface alternate settings — mirrors Chrome USB API config.interfaces
    // e.g. STM32 DFU has interface 0 with 4 alt settings (Internal Flash, Option Bytes, OTP, Device Info)
    const interfaces = [];
    ((configDescriptor.interfaces) || []).forEach((altSettings) => {
      altSettings.forEach((altSetting) => {
        interfaces.push({
          interfaceNumber: altSetting.bInterfaceNumber,
          alternateSetting: altSetting.bAlternateSetting,
          endpoints: (altSetting.endpoints || []).map((ep) => ({ address: ep.bEndpointAddress })),
        });
      });
    });

    console.log('usb-get-configuration: found', interfaces.length, 'interface alt settings');
    return {
      resultCode: 0,
      configurationValue: configDescriptor.bConfigurationValue || 1,
      interfaces,
    };
  } catch (e) {
    console.error('usb-get-configuration error:', e.message);
    return { resultCode: 1, interfaces: [] };
  }
});

ipcMain.handle('usb-control-transfer', async (event, deviceKey, options) => {
  try {
    const device = ensureUsbDeviceOpen(deviceKey);
    const bmRequestType = toBmRequestType(options.direction, options.requestType, options.recipient);
    const bRequest = options.request;
    const wValue = options.value || 0;
    const wIndex = options.index || 0;

    if (options.direction === 'in') {
      const length = options.length || 0;
      const data = await new Promise((resolve, reject) => {
        device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, length, (err, inData) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(inData || Buffer.alloc(0));
        });
      });

      return { resultCode: 0, bytesTransferred: data.length, data: Array.from(data) };
    }

    const outData = options.data ? Buffer.from(options.data) : Buffer.alloc(0);
    await new Promise((resolve, reject) => {
      device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, outData, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    return { resultCode: 0, bytesTransferred: outData.length };
  } catch (e) {
    if (e.message && e.message.includes('LIBUSB_TRANSFER_STALL')) {
      // STALL is a valid DFU device response (device in dfuERROR, protocol
      // clears it via DFU_CLRSTATUS). Not a fatal error — demote to warn.
      console.warn('usb-control-transfer: device stalled (expected during DFU error recovery)');
    } else {
      console.error('usb-control-transfer error:', e.message);
    }
    return { resultCode: 1, bytesTransferred: 0, data: [] };
  }
});

ipcMain.handle('usb-bulk-transfer', async (event, deviceKey, options) => {
  try {
    const device = ensureUsbDeviceOpen(deviceKey);
    const iface = device.interfaces[0];
    const endpointNumber = options.endpoint || 1;
    const endpointAddress = options.direction === 'in' ? (endpointNumber | 0x80) : endpointNumber;
    const endpoint = (iface.endpoints || []).find((ep) => ep.address === endpointAddress);

    if (!endpoint) {
      return { resultCode: 1, bytesTransferred: 0, data: [] };
    }

    if (options.direction === 'in') {
      const data = await new Promise((resolve, reject) => {
        endpoint.transfer(options.length || 64, (err, inData) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(inData || Buffer.alloc(0));
        });
      });
      return { resultCode: 0, bytesTransferred: data.length, data: Array.from(data) };
    }

    const outData = options.data ? Buffer.from(options.data) : Buffer.alloc(0);
    await new Promise((resolve, reject) => {
      endpoint.transfer(outData, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    return { resultCode: 0, bytesTransferred: outData.length };
  } catch (e) {
    console.error('usb-bulk-transfer error:', e.message);
    return { resultCode: 1, bytesTransferred: 0, data: [] };
  }
});

ipcMain.handle('usb-reset-device', async (event, deviceKey) => {
  try {
    const device = ensureUsbDeviceOpen(deviceKey);
    await new Promise((resolve, reject) => {
      device.reset((err) => (err ? reject(err) : resolve()));
    });
    return { success: true, resultCode: 0 };
  } catch (e) {
    console.error('usb-reset-device error:', e.message);
    return { success: false, resultCode: 1 };
  }
});

// --- File system dialog IPC bridge ---
const { dialog } = require('electron');
const fs = require('fs');

// IPC: show save file dialog
ipcMain.handle('dialog:choose-entry', async (event, options) => {
  const { type, suggestedName, accepts } = options;
  
  if (type === 'saveFile') {
    const filters = accepts ? accepts.map(a => ({ name: a.description, extensions: a.extensions })) : [];
    return await dialog.showSaveDialog({
      defaultPath: suggestedName,
      filters: filters.length > 0 ? filters : undefined,
    });
  } else if (type === 'openFile') {
    return await dialog.showOpenDialog({
      defaultPath: suggestedName,
      filters: accepts ? accepts.map(a => ({ name: a.description, extensions: a.extensions })) : [],
    });
  }
  return { canceled: true };
});

// IPC: write text content to file (single-shot, replaces truncate+write)
ipcMain.handle('dialog:write-text-file', async (event, filePath, text) => {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, text, 'utf8');
  console.log(`Saved ${text.length} chars to ${filePath}`);
  return text.length;
});

// IPC: read file as binary buffer
ipcMain.handle('file-read-binary', async (event, filePath) => {
  const data = await fs.promises.readFile(filePath);
  return data;
});

// IPC: truncate file to size (kept for compatibility)
ipcMain.handle('dialog:truncate-file', async (event, filePath, size) => {
  return size;
});

// IPC: write to file (kept for compatibility)
ipcMain.handle('dialog:write-file', async (event, filePath, data) => {
  return 0;
});

function createWindow() {
  const buildMode = getBuildMode();
  setupMenu(buildMode);

  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'src/support/preload.js'),
    },
    icon: path.join(__dirname, 'assets/osx/app-icon.icns'),
  });
  
  // Enforce minimum window size multiple ways for cross-platform compatibility
  win.setMinimumSize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);
  
  // Active enforcement: if window size falls below minimum after any resize, restore it
  win.on('resize', () => {
    const [width, height] = win.getSize();
    if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) {
      win.setSize(Math.max(width, MIN_WINDOW_WIDTH), Math.max(height, MIN_WINDOW_HEIGHT));
    }
  });
  
  // Also prevent moves that would resize
  win.on('moved', () => {
    const [width, height] = win.getSize();
    if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) {
      win.setSize(Math.max(width, MIN_WINDOW_WIDTH), Math.max(height, MIN_WINDOW_HEIGHT));
    }
  });
  
  win.loadFile(path.join(__dirname, 'dist', 'main.html'));
  
  // Reapply after window is fully loaded (some platforms need this)
  win.webContents.on('did-finish-load', () => {
    win.setMinimumSize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);
    const [width, height] = win.getSize();
    if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) {
      win.setSize(Math.max(width, MIN_WINDOW_WIDTH), Math.max(height, MIN_WINDOW_HEIGHT));
    }
  });
  
  // Intercept new window requests (e.g., target="_blank" links) and open in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the system default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const { shell } = require('electron');
      shell.openExternal(url);
      return { action: 'deny' }; // Prevent Electron from opening its own window
    }
    return { action: 'allow' };
  });
  
  if (buildMode === 'dev') {
    win.webContents.openDevTools();
  }
  
  // Intercept navigation to external URLs and open them in system browser
  win.webContents.on('will-navigate', (event, url) => {
    const appPath = 'file://' + path.join(__dirname, 'dist');
    if (!url.startsWith(appPath) && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault();
      const { shell } = require('electron');
      shell.openExternal(url);
    }
  });
  
  // Capture renderer console output and kill app on error
  // Levels: 0=verbose, 1=info, 2=warning, 3=error
  // Default (dev): show warnings+errors only. Set VERBOSE=1 to show all.
  // Uses Event<WebContentsConsoleMessageEventParams> object (Electron v41+)
  win.webContents.on('console-message', (event) => {
    const { level, message, line, sourceId } = event;
    if (message) {
      const verbose = process.env.VERBOSE === '1';
      if (verbose || level >= 2) {
        const tag = level >= 3 ? '[Renderer ERROR]' : level >= 2 ? '[Renderer WARN]' : '[Renderer]';
        console.log(`${tag} ${message} (${sourceId || ''}:${line || ''})`);
      }
      if (message.includes('is not defined')) {
        console.error('Fatal error detected in renderer, quitting Electron app.');
        app.quit();
      }
    }
  });
  win.webContents.on('crashed', () => {
    console.error('Renderer process crashed!');
  });
}

app.whenReady().then(createWindow);

// Best-effort cleanup of hardware connections before the process exits.
// The OS will reclaim handles anyway, but explicit cleanup avoids libusb/serialport
// "device still open" warnings and ensures the device is left in a clean state.
app.on('before-quit', () => {
  // Attempt graceful DFU device exit: send DETACH command to return FC to normal mode
  // (avoids leaving device stuck in bootloader requiring unplug/replug)
  for (const [, device] of _usbOpenDevices) {
    try {
      // DFU DETACH: tells device to exit bootloader and run application firmware
      // bmRequestType: 0x21 (OUT, CLASS, INTERFACE)
      // bRequest: 0x00 (DETACH)
      // wValue: 0 (timeout, unused)
      // wIndex: 0 (interface 0)
      // wLength: 0 (no data)
      device.controlTransfer(0x21, 0x00, 0, 0, 0, (err) => {
        // Ignore errors; attempt close regardless
        try { device.close(); } catch { /* ignore */ }
      });
    } catch {
      // If DETACH fails, still attempt to close the device
      try { device.close(); } catch { /* ignore */ }
    }
  }
  _usbOpenDevices.clear();

  if (_serialPort && _serialPort.isOpen) {
    try {
      // Send exit command to CLI to gracefully close the serial session.
      // This ensures the FC isn't left in a connected state when the port closes.
      const exitCmd = 'exit\r';
      _serialPort.write(Buffer.from(exitCmd), () => {
        // Give it a moment to process the exit, then close
        setTimeout(() => {
          try { _serialPort.close(() => {}); } catch { /* ignore */ }
        }, 100);
      });
    } catch {
      // If write fails, still attempt to close
      try { _serialPort.close(() => {}); } catch { /* ignore */ }
    }
    _serialPort = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
