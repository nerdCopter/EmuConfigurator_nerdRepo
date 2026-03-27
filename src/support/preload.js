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

// ─── chrome.sockets.tcp polyfill (IPC-backed — supports SITL/MSP-over-TCP) ──

const chromeSockets = {
    tcp: {
        _receiveListeners: [],
        _errorListeners: [],

        create: function (props, callback) {
            ipcRenderer.invoke('tcp-allocate').then(function (id) {
                callback({ socketId: id });
            }).catch(function () { callback({ socketId: -1 }); });
        },

        connect: function (socketId, host, port, callback) {
            // Register IPC event listeners for this socket before connecting
            ipcRenderer.removeAllListeners(`tcp-data`);
            ipcRenderer.removeAllListeners(`tcp-error`);
            ipcRenderer.removeAllListeners(`tcp-close`);

            ipcRenderer.on('tcp-data', function (event, id, arrayBuffer) {
                if (id !== socketId) return;
                chromeSockets.tcp.onReceive.dispatch({ socketId: id, data: arrayBuffer });
            });
            ipcRenderer.on('tcp-error', function (event, id, msg) {
                if (id !== socketId) return;
                chromeSockets.tcp.onReceiveError.dispatch({ socketId: id, resultCode: -1, message: msg });
            });
            ipcRenderer.on('tcp-close', function (event, id) {
                if (id !== socketId) return;
                chromeSockets.tcp.onReceiveError.dispatch({ socketId: id, resultCode: -100 });
            });

            ipcRenderer.invoke('tcp-connect', socketId, host, port).then(function (result) {
                callback(result); // 0 = success, negative = failure
            }).catch(function () { callback(-1); });
        },

        send: function (socketId, data, callback) {
            ipcRenderer.invoke('tcp-send', socketId, Array.from(new Uint8Array(data))).then(function (info) {
                callback(info || { resultCode: -1 });
            }).catch(function () { callback({ resultCode: -1 }); });
        },

        close: function (socketId, callback) {
            ipcRenderer.removeAllListeners('tcp-data');
            ipcRenderer.removeAllListeners('tcp-error');
            ipcRenderer.removeAllListeners('tcp-close');
            ipcRenderer.invoke('tcp-disconnect', socketId).then(function () {
                if (callback) callback();
            }).catch(function () { if (callback) callback(); });
        },

        setNoDelay: function (socketId, delay, callback) {
            // setNoDelay is applied in main.js at socket creation; ack immediately
            if (callback) callback(0);
        },

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
    },
};

// ─── chrome.storage.local polyfill (backed by localStorage) ────────────────

const chromeStorageLocal = {
    get: function (keys, callback) {
        const result = {};
        if (typeof keys === 'object' && !Array.isArray(keys)) {
            // Object with defaults: { key: defaultValue, ... }
            Object.keys(keys).forEach(function (k) {
                const val = localStorage.getItem(k);
                if (val !== null) {
                    try { result[k] = JSON.parse(val); }
                    catch (e) { result[k] = val; }
                } else {
                    result[k] = keys[k]; // Use provided default
                }
            });
        } else {
            // String or array of keys
            const keyList = Array.isArray(keys) ? keys : [keys];
            keyList.forEach(function (k) {
                const val = localStorage.getItem(k);
                if (val !== null) {
                    try { result[k] = JSON.parse(val); }
                    catch (e) { result[k] = val; }
                }
            });
        }
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
    _openHandles: {},
    _handleCounter: 0,

    getDevices: function (filters, callback) {
        ipcRenderer.invoke('usb-list-dfu').then(function (devices) {
            // devices is array of {device, vendorId, productId, ...}
            callback(devices);
        }).catch(function () { callback([]); });
    },

    openDevice: function (device, callback) {
        const handleId = ++chromeUsb._handleCounter;
        chromeUsb._openHandles[handleId] = device;
        
        ipcRenderer.invoke('usb-open-device', device.device).then(function (_result) {
            callback({ handle: handleId, device: device });
        }).catch(function (err) {
            console.error('usb-open-device error:', err);
            callback(undefined);
        });
    },

    closeDevice: function (handle, callback) {
        if (handle && chromeUsb._openHandles[handle.handle]) {
            const device = chromeUsb._openHandles[handle.handle];
            ipcRenderer.invoke('usb-close-device', device.device).then(function () {
                delete chromeUsb._openHandles[handle.handle];
                if (callback) callback();
            }).catch(function (err) {
                console.error('usb-close-device error:', err);
                if (callback) callback();
            });
        } else {
            if (callback) callback();
        }
    },

    claimInterface: function (handle, interfaceNumber, callback) {
        if (handle && chromeUsb._openHandles[handle.handle]) {
            const device = chromeUsb._openHandles[handle.handle];
            ipcRenderer.invoke('usb-claim-interface', device.device, interfaceNumber).then(function () {
                if (callback) callback();
            }).catch(function (err) {
                console.error('usb-claim-interface error:', err);
                if (callback) callback();
            });
        } else {
            if (callback) callback();
        }
    },

    releaseInterface: function (handle, interfaceNumber, callback) {
        if (handle && chromeUsb._openHandles[handle.handle]) {
            const device = chromeUsb._openHandles[handle.handle];
            ipcRenderer.invoke('usb-release-interface', device.device, interfaceNumber).then(function () {
                if (callback) callback();
            }).catch(function (err) {
                console.error('usb-release-interface error:', err);
                if (callback) callback();
            });
        } else {
            if (callback) callback();
        }
    },

    controlTransfer: function (handle, options, callback) {
        if (handle && chromeUsb._openHandles[handle.handle]) {
            const device = chromeUsb._openHandles[handle.handle];
            ipcRenderer.invoke('usb-control-transfer', device.device, options).then(function (result) {
                if (result && result.data) {
                    // Convert serialized buffer data back to ArrayBuffer
                    if (Array.isArray(result.data)) {
                        result.data = new Uint8Array(result.data).buffer;
                    } else if (typeof result.data === 'object' && result.data.type === 'Buffer') {
                        // Handle Node.js Buffer serialization
                        result.data = new Uint8Array(result.data.data).buffer;
                    } else if (!(result.data instanceof ArrayBuffer)) {
                        result.data = new Uint8Array(0).buffer;
                    }
                }
                if (callback) callback(result);
            }).catch(function (err) {
                console.error('usb-control-transfer error:', err);
                if (callback) callback({ error: 'controlTransfer_error' });
            });
        } else {
            if (callback) callback({ error: 'device_not_open' });
        }
    },

    bulkTransfer: function (handle, options, callback) {
        if (handle && chromeUsb._openHandles[handle.handle]) {
            const device = chromeUsb._openHandles[handle.handle];
            ipcRenderer.invoke('usb-bulk-transfer', device.device, options).then(function (result) {
                if (result && result.data) {
                    // Convert serialized buffer data back to ArrayBuffer
                    if (Array.isArray(result.data)) {
                        result.data = new Uint8Array(result.data).buffer;
                    } else if (typeof result.data === 'object' && result.data.type === 'Buffer') {
                        result.data = new Uint8Array(result.data.data).buffer;
                    } else if (!(result.data instanceof ArrayBuffer)) {
                        result.data = new Uint8Array(0).buffer;
                    }
                }
                if (callback) callback(result);
            }).catch(function (err) {
                console.error('usb-bulk-transfer error:', err);
                if (callback) callback({ error: 'bulkTransfer_error' });
            });
        } else {
            if (callback) callback({ error: 'device_not_open' });
        }
    },

    resetDevice: function (handle, callback) {
        if (handle && chromeUsb._openHandles[handle.handle]) {
            const device = chromeUsb._openHandles[handle.handle];
            ipcRenderer.invoke('usb-reset-device', device.device).then(function (result) {
                if (callback) callback(result);
            }).catch(function (err) {
                console.error('usb-reset-device error:', err);
                if (callback) callback({ error: 'reset_error' });
            });
        } else {
            if (callback) callback({ error: 'device_not_open' });
        }
    },

    getConfiguration: function (handle, callback) {
        if (handle && chromeUsb._openHandles[handle.handle]) {
            const device = chromeUsb._openHandles[handle.handle];
            ipcRenderer.invoke('usb-get-configuration', device.device).then(function (result) {
                if (callback) {
                    callback({
                        configurationValue: result.configurationValue || 1,
                        interfaces: result.interfaces || []
                    });
                }
            }).catch(function (err) {
                console.error('usb-get-configuration error:', err);
                if (callback) {
                    callback({ configurationValue: 1, interfaces: [] });
                }
            });
        } else if (callback) {
            callback({ configurationValue: 1, interfaces: [] });
        }
    }
};

// ─── chrome.runtime polyfill ────────────────────────────────────────────────

const chromeRuntime = {
    lastError: null,
    onSuspend: { addListener: function () {} },
    getManifest: function () {
        // Use IPC to main process to get package.json data (renderer cannot require files outside dist)
        if (window._manifestCache) return window._manifestCache;
        const { ipcRenderer } = require('electron');
        // Synchronous IPC for simplicity; can be made async if needed
        const manifest = ipcRenderer.sendSync('get-manifest');
        window._manifestCache = manifest;
        return manifest;
    },
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
            // Return a mock entry object with file() and createWriter methods
            const entry = {
                _filePath: filePath,
                file: (success, error) => {
                    // Request main process to read file as binary
                    ipcRenderer.invoke('file-read-binary', filePath).then(buffer => {
                        // Convert buffer to Blob
                        const blob = new Blob([buffer], { type: 'application/octet-stream' });
                        success(blob);
                    }).catch(err => {
                        console.error('File read error:', err);
                        if (error) error(err);
                    });
                },
                createWriter: (onWriter, _onError) => {
                    const writer = {
                        length: 0,
                        onerror: null,
                        onwriteend: null,
                        truncate: (size) => {
                            writer.length = size;
                            if (writer.onwriteend) writer.onwriteend();
                        },
                        write: (blob) => {
                            blob.arrayBuffer().then(arrayBuffer => {
                                // Send as binary data via separate IPC channel
                                ipcRenderer.invoke('dialog:write-binary-file', filePath, Array.from(new Uint8Array(arrayBuffer))).then(written => {
                                    writer.length += written;
                                    if (writer.onwriteend) writer.onwriteend();
                                }).catch(err => {
                                    console.error(`[preload] write-binary-file failed:`, err);
                                    if (writer.onerror) writer.onerror(err);
                                });
                            }).catch(err => {
                                console.error(`[preload] blob.arrayBuffer() failed:`, err);
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
    },
    getDisplayPath: (fileEntry, callback) => {
        // Simply return the stored file path
        if (fileEntry && fileEntry._filePath) {
            callback(fileEntry._filePath);
        } else {
            callback('');
        }
    }
};

if (typeof window.chrome === 'undefined' || !window.chrome.fileSystem) {
    window.chrome = Object.assign(window.chrome || {}, {
        fileSystem: chromeFileSystem,
    });
}
