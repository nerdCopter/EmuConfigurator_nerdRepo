'use strict';

/**
 * Electron Preload — Chrome API Polyfills
 *
 * Provides window.chrome.serial, window.chrome.storage.local, and
 * window.chrome.usb implementations backed by native Electron/Node APIs.
 * This is the single place that bridges the NW.js-style renderer code to
 * Electron. serial.js, port_handler.js etc. are untouched and work as-is.
 */

const { ipcRenderer } = require('electron');

// ─── chrome.serial polyfill ────────────────────────────────────────────────

const chromeSerial = {
    _dataListeners: [],
    _errorListeners: [],

    getDevices: function (callback) {
        ipcRenderer.invoke('serial-list-ports').then(function (paths) {
            callback(paths.map(function (p) { return { path: p }; }));
        }).catch(function () { callback([]); });
    },

    connect: function (path, options, callback) {
        // Clean up any previous IPC listeners
        ipcRenderer.removeAllListeners('serial-data');
        ipcRenderer.removeAllListeners('serial-error');
        ipcRenderer.removeAllListeners('serial-close');

        ipcRenderer.invoke('serial-connect', path, options).then(function (info) {
            if (!info) { callback(undefined); return; }

            // Forward data events to chrome.serial.onReceive listeners
            ipcRenderer.on('serial-data', function (event, arrayBuffer) {
                chromeSerial.onReceive.dispatch({ connectionId: info.connectionId, data: arrayBuffer });
            });

            // Forward errors to chrome.serial.onReceiveError listeners
            ipcRenderer.on('serial-error', function (event, msg) {
                chromeSerial.onReceiveError.dispatch({ connectionId: info.connectionId, error: 'system_error', message: msg });
            });

            ipcRenderer.on('serial-close', function () {
                chromeSerial.onReceiveError.dispatch({ connectionId: info.connectionId, error: 'disconnected' });
            });

            callback(info);
        }).catch(function () { callback(undefined); });
    },

    disconnect: function (connectionId, callback) {
        ipcRenderer.removeAllListeners('serial-data');
        ipcRenderer.removeAllListeners('serial-error');
        ipcRenderer.removeAllListeners('serial-close');
        ipcRenderer.invoke('serial-disconnect').then(function (ok) {
            callback(ok);
        }).catch(function () { callback(false); });
    },

    send: function (connectionId, data, callback) {
        ipcRenderer.invoke('serial-send', Array.from(new Uint8Array(data))).then(function (info) {
            callback(info || { bytesSent: 0, error: 'unknown' });
        }).catch(function () { callback({ bytesSent: 0, error: 'ipc_error' }); });
    },

    getInfo: function (connectionId, callback) {
        // Return a minimal info object — paused:false is safe
        callback({ connectionId: connectionId, paused: false, persistent: false });
    },

    setPaused: function (connectionId, paused, callback) {
        if (callback) callback();
    },

    getControlSignals: function (connectionId, callback) {
        callback({ dcd: false, cts: true, ri: false, dsr: true });
    },

    setControlSignals: function (connectionId, signals, callback) {
        if (callback) callback(true);
    },

    // Event emitters — same interface chrome.serial.onReceive / onReceiveError
    onReceive: (function () {
        const listeners = [];
        return {
            addListener: function (fn) { listeners.push(fn); },
            removeListener: function (fn) {
                const i = listeners.indexOf(fn);
                if (i !== -1) listeners.splice(i, 1);
            },
            dispatch: function (info) { listeners.forEach(function (fn) { fn(info); }); },
        };
    })(),

    onReceiveError: (function () {
        const listeners = [];
        return {
            addListener: function (fn) { listeners.push(fn); },
            removeListener: function (fn) {
                const i = listeners.indexOf(fn);
                if (i !== -1) listeners.splice(i, 1);
            },
            dispatch: function (info) { listeners.forEach(function (fn) { fn(info); }); },
        };
    })(),
};

// ─── chrome.sockets.tcp polyfill (stub — TCP connect available separately) ──

const chromeSockets = {
    tcp: {
        create: function (props, callback) { callback({ socketId: -1 }); },
        connect: function (socketId, host, port, callback) { callback(-1); },
        send: function (socketId, data, callback) { callback({ resultCode: -1 }); },
        close: function (socketId, callback) { if (callback) callback(); },
        setNoDelay: function (socketId, delay, callback) { if (callback) callback(0); },
        onReceive: { addListener: function () {}, removeListener: function () {} },
        onReceiveError: { addListener: function () {}, removeListener: function () {} },
    },
};

// ─── chrome.storage.local polyfill (backed by localStorage) ────────────────

const chromeStorageLocal = {
    get: function (keys, callback) {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
        keyList.forEach(function (k) {
            const val = localStorage.getItem(k);
            if (val !== null) {
                try { result[k] = JSON.parse(val); }
                catch (e) { result[k] = val; }
            }
        });
        callback(result);
    },
    set: function (items, callback) {
        Object.keys(items).forEach(function (k) {
            localStorage.setItem(k, JSON.stringify(items[k]));
        });
        if (callback) callback();
    },
    remove: function (keys, callback) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(function (k) { localStorage.removeItem(k); });
        if (callback) callback();
    },
    clear: function (callback) {
        localStorage.clear();
        if (callback) callback();
    },
};

// ─── chrome.usb polyfill (backed by IPC → usb native module) ───────────────

const chromeUsb = {
    getDevices: function (filters, callback) {
        ipcRenderer.invoke('usb-list-dfu').then(function (count) {
            // Return an array of stubs matching the count; actual device info not needed here
            const devices = [];
            for (let i = 0; i < count; i++) devices.push({ deviceId: i });
            callback(devices);
        }).catch(function () { callback([]); });
    },
};

// ─── chrome.runtime polyfill ────────────────────────────────────────────────

const chromeRuntime = {
    lastError: null,
    onSuspend: { addListener: function () {} },
};

// ─── chrome.app polyfill ────────────────────────────────────────────────────

const chromeApp = {
    window: {
        onClosed: { addListener: function () {} },
        current: function () { return null; },
    },
    runtime: {
        onLaunched: { addListener: function () {} },
    },
};

// ─── Inject into window.chrome ──────────────────────────────────────────────

if (typeof window.chrome === 'undefined' || !window.chrome.serial) {
    window.chrome = Object.assign(window.chrome || {}, {
        serial: chromeSerial,
        sockets: chromeSockets,
        storage: { local: chromeStorageLocal },
        usb: chromeUsb,
        runtime: chromeRuntime,
        app: chromeApp,
    });
    console.log('Electron: chrome API polyfills loaded (serial, storage, usb, app)');
}

// Polyfill for chrome.fileSystem (file save/load dialogs)
const chromeFileSystem = {
    chooseEntry: (options, callback) => {
        ipcRenderer.invoke('dialog:choose-entry', options).then(result => {
            if (result.canceled) {
                callback(null);
                return;
            }
            // showSaveDialog returns .filePath (string), showOpenDialog returns .filePaths (array)
            const filePath = options.type === 'saveFile' ? result.filePath : result.filePaths?.[0];
            if (!filePath) {
                callback(null);
                return;
            }
            // Return a mock entry object with createWriter
            const entry = {
                createWriter: (onWriter, onError) => {
                    const writer = {
                        length: 0,
                        onerror: null,
                        onwriteend: null,
                        truncate: (size) => {
                            console.log(`[preload] truncate() called with size=${size}, filePath=${filePath}`);
                            ipcRenderer.invoke('dialog:truncate-file', filePath, size).then(() => {
                                console.log(`[preload] truncate succeeded`);
                                writer.length = size;
                                if (writer.onwriteend) {
                                    console.log(`[preload] calling onwriteend after truncate`);
                                    writer.onwriteend();
                                }
                            }).catch(err => {
                                console.error(`[preload] truncate failed:`, err);
                                if (writer.onerror) writer.onerror(err);
                            });
                        },
                        write: (blob) => {
                            console.log(`[preload] write() called with blob, size=${blob.size}`);
                            blob.arrayBuffer().then(buf => {
                                // Convert ArrayBuffer to Uint8Array for IPC serialization
                                const uint8array = new Uint8Array(buf);
                                console.log(`[preload] invoking dialog:write-file for ${filePath}, ${uint8array.length} bytes`);
                                ipcRenderer.invoke('dialog:write-file', filePath, uint8array).then(written => {
                                    console.log(`[preload] write succeeded, ${written} bytes written`);
                                    writer.length += written;
                                    if (writer.onwriteend) {
                                        console.log(`[preload] calling onwriteend`);
                                        writer.onwriteend();
                                    }
                                }).catch(err => {
                                    console.error(`[preload] write failed:`, err);
                                    if (writer.onerror) writer.onerror(err);
                                });
                            }).catch(err => {
                                console.error(`[preload] arrayBuffer() failed:`, err);
                                if (writer.onerror) writer.onerror(err);
                            });
                        }
                    };
                    onWriter(writer);
                }
            };
            callback(entry);
        }).catch(err => {
            console.error('File dialog error:', err);
            callback(null);
        });
    }
};

if (typeof window.chrome === 'undefined' || !window.chrome.fileSystem) {
    window.chrome = Object.assign(window.chrome || {}, {
        fileSystem: chromeFileSystem,
    });
}
