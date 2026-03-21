const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// IPC: list serial ports from main process (native addon works reliably here)
ipcMain.handle('serial-list-ports', async () => {
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    return ports.map(p => p.path + (p.manufacturer ? ' (' + p.manufacturer + ')' : ''));
  } catch (e) {
    console.error('main.js: serialport list failed, trying fs fallback:', e.message);
    // Filesystem fallback for Linux
    try {
      const fs = require('fs');
      const entries = fs.readdirSync('/dev').filter(f => /^tty(USB|ACM|S)\d+$/.test(f));
      return entries.map(f => '/dev/' + f);
    } catch (fsErr) {
      return [];
    }
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
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
