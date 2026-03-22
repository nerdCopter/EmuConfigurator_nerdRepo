const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
    return devices.filter(d => {
      const desc = d.deviceDescriptor;
      return DFU_IDS.some(id => id.vendorId === desc.idVendor && id.productId === desc.idProduct);
    }).length;
  } catch (e) {
    return 0;
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

// IPC: truncate file to size
ipcMain.handle('dialog:truncate-file', async (event, filePath, size) => {
  return new Promise((resolve, reject) => {
    // Create file if it doesn't exist
    fs.writeFile(filePath, '', (err) => {
      if (err) {
        console.error(`Failed to create ${filePath}:`, err);
        reject(err);
        return;
      }
      fs.truncate(filePath, size, (err) => {
        if (err) {
          console.error(`Failed to truncate ${filePath}:`, err);
          reject(err);
        } else {
          console.log(`Successfully truncated ${filePath} to ${size} bytes`);
          resolve(size);
        }
      });
    });
  });
});

// IPC: write to file
ipcMain.handle('dialog:write-file', async (event, filePath, data) => {
  return new Promise((resolve, reject) => {
    // Convert received data back to Buffer (IPC serializes Uint8Array as object)
    let buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (Array.isArray(data)) {
      buffer = Buffer.from(data);
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else if (typeof data === 'object' && data !== null) {
      // Uint8Array serialized as {0: byte, 1: byte, ...}
      const values = Object.values(data).map(v => Number(v));
      buffer = Buffer.from(values);
    } else {
      reject(new Error(`Unsupported data type: ${typeof data}`));
      return;
    }
    
    fs.appendFile(filePath, buffer, (err) => {
      if (err) {
        console.error(`Failed to write to ${filePath}:`, err);
        reject(err);
      } else {
        console.log(`Successfully wrote ${buffer.length} bytes to ${filePath}`);
        resolve(buffer.length);
      }
    });
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'src/support/preload.js'),
    },
    icon: path.join(__dirname, 'assets/osx/app-icon.icns'),
  });
  win.loadFile('src/main.html');
  win.webContents.openDevTools();
  // Capture renderer console output and kill app on error
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
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
