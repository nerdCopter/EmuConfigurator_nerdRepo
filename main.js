const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
ipcMain.handle('usb-list-dfu', async () => {
  try {
    const { usb } = require('usb');
    const DFU_IDS = [
      { vendorId: 0x0483, productId: 0xDF11 },
      { vendorId: 0x2DAE, productId: 0x0003 },
    ];
    const devices = usb.getDeviceList();
    const dfuDevices = devices.filter(d => {
      const desc = d.deviceDescriptor;
      return DFU_IDS.some(id => id.vendorId === desc.idVendor && id.productId === desc.idProduct);
    }).map((d, idx) => ({
      device: idx, // ID for IPC
      vendorId: d.deviceDescriptor.idVendor,
      productId: d.deviceDescriptor.idProduct,
      serialNumber: d.serialNumber || '',
      manufacturer: d.allConfigDescriptors[0]?.iManufacturer || '',
      product: d.allConfigDescriptors[0]?.iProduct || '',
      _device: d // store actual device reference for later operations
    }));
    return dfuDevices;
  } catch (e) {
    console.error('usb-list-dfu error:', e);
    return [];
  }
});

// USB device operation stubs - proper implementation would require node-usb library
ipcMain.handle('usb-open-device', async (event, deviceId) => {
  console.log('USB device opening:', deviceId);
  return { success: true };
});

ipcMain.handle('usb-close-device', async (event, deviceId) => {
  console.log('USB device closed:', deviceId);
  return { success: true };
});

ipcMain.handle('usb-claim-interface', async (event, deviceId, interfaceNumber) => {
  console.log(`USB claiming interface ${interfaceNumber} on device ${deviceId}`);
  return { success: true };
});

ipcMain.handle('usb-release-interface', async (event, deviceId, interfaceNumber) => {
  console.log(`USB releasing interface ${interfaceNumber} on device ${deviceId}`);
  return { success: true };
});

ipcMain.handle('usb-control-transfer', async (event, deviceId, options) => {
  // Stub for control transfer - return empty binary data with headers
  console.log('USB control transfer:', options);
  // Return a buffer that matches the expected format
  // For descriptor requests, return a minimal valid response
  const buffer = Buffer.alloc(options.length || 255);
  // Fill with minimal descriptor structure if it's a GET_DESCRIPTOR request
  if (options.request === 6) { // GET_DESCRIPTOR
    buffer[0] = 4; // length
    buffer[1] = 0x21; // DFU functional descriptor type
  }
  return { 
    data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    bytesTransferred: buffer.length,
    resultCode: 0
  };
});

ipcMain.handle('usb-bulk-transfer', async (event, deviceId, options) => {
  // Stub for bulk transfer - return empty binary data
  console.log('USB bulk transfer:', options);
  const buffer = Buffer.alloc(options.length || 64);
  return { 
    data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    bytesTransferred: buffer.length,
    resultCode: 0
  };
});

ipcMain.handle('usb-reset-device', async (event, deviceId) => {
  console.log('USB device reset:', deviceId);
  return { success: true };
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
  const win = new BrowserWindow({
    width: 1200,
    height: 700,
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
  
  win.webContents.openDevTools();
  // Capture renderer console output and kill app on error
  win.webContents.on('console-message', (event, params) => {
    const { level, message, line, sourceId } = params;
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
    if (message && message.includes('is not defined')) {
      console.error('Fatal error detected in renderer, quitting Electron app.');
      app.quit();
    }
  });
  win.webContents.on('crashed', () => {
    console.error('Renderer process crashed!');
  });
}

app.whenReady().then(createWindow);

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
