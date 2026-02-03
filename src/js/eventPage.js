/*
    If an id is also specified and a window with a matching id has been shown before, the remembered bounds of the window will be used instead.

    In this JS we cannot use the i18n wrapper used in the rest of the application (it is not available). We must remain with the chrome one.
*/
'use strict';

// Capture-phase error handler and console.filter to suppress nwNatives.getRoutingID errors
try {
    window.addEventListener('error', function (e) {
        try {
            var msg = e && e.message ? e.message : '';
            if (typeof msg === 'string' && msg.indexOf('nwNatives.getRoutingID') !== -1) {
                console.warn('[filtered] suppressed nwNatives.getRoutingID error (eventPage)');
                e.preventDefault();
                e.stopImmediatePropagation();
                return true;
            }
        } catch (inner) { /* ignore */ }
    }, true);

    (function () {
        var origConsoleError = console.error;
        console.error = function () {
            try {
                for (var i = 0; i < arguments.length; i++) {
                    var a = arguments[i];
                    if (typeof a === 'string' && a.indexOf('nwNatives.getRoutingID') !== -1) {
                        console.warn('[filtered] suppressed nwNatives.getRoutingID console error');
                        return;
                    }
                }
            } catch (e) { /* ignore */ }
            return origConsoleError.apply(console, arguments);
        };
    })();

    // Shim: ensure internal NW native method exists to avoid extensions::nw.Window errors
    window.nwNatives = window.nwNatives || {};
    if (typeof window.nwNatives.getRoutingID !== 'function') {
        window.nwNatives.getRoutingID = function() { return 0; };
        console.log('[shim] injected nwNatives.getRoutingID fallback');
    }
} catch (e) { console.error('nwNatives shim error:', e); }

function startApplication() {
    var applicationStartTime = new Date().getTime();

    chrome.app.window.create('main.html', {
        id: 'main-window',
        frame: 'chrome',
        innerBounds: {
            minWidth: 1024,
            minHeight: 550
        }
    }, function (createdWindow) {
        if (getChromeVersion() >= 54) {
            createdWindow.icon = 'images/emu_icon_128.png';
        }
        createdWindow.onClosed.addListener(function () {
            // automatically close the port when application closes
            // save connectionId in separate variable before createdWindow.contentWindow is destroyed
            var connectionId = createdWindow.contentWindow.serial.connectionId,
                valid_connection = createdWindow.contentWindow.CONFIGURATOR.connectionValid,
                mincommand = createdWindow.contentWindow.MOTOR_CONFIG.mincommand;

            if (connectionId && valid_connection) {
                // code below is handmade MSP message (without pretty JS wrapper), it behaves exactly like MSP.send_message
                // sending exit command just in case the cli tab was open.
                // reset motors to default (mincommand)

                var bufferOut = new ArrayBuffer(5),
                bufView = new Uint8Array(bufferOut);

                bufView[0] = 0x65; // e
                bufView[1] = 0x78; // x
                bufView[2] = 0x69; // i
                bufView[3] = 0x74; // t
                bufView[4] = 0x0D; // enter

                chrome.serial.send(connectionId, bufferOut, function () { console.log('Send exit') });

                setTimeout(function() {
                    bufferOut = new ArrayBuffer(22);
                    bufView = new Uint8Array(bufferOut);
                    var checksum = 0;

                    bufView[0] = 36; // $
                    bufView[1] = 77; // M
                    bufView[2] = 60; // <
                    bufView[3] = 16; // data length
                    bufView[4] = 214; // MSP_SET_MOTOR

                    checksum = bufView[3] ^ bufView[4];

                    for (var i = 0; i < 16; i += 2) {
                        bufView[i + 5] = mincommand & 0x00FF;
                        bufView[i + 6] = mincommand >> 8;

                        checksum ^= bufView[i + 5];
                        checksum ^= bufView[i + 6];
                    }

                    bufView[5 + 16] = checksum;

                    chrome.serial.send(connectionId, bufferOut, function (sendInfo) {
                        chrome.serial.disconnect(connectionId, function (result) {
                            console.log('SERIAL: Connection closed - ' + result);
                        });
                    });
                }, 100);
            } else if (connectionId) {
                chrome.serial.disconnect(connectionId, function (result) {
                    console.log('SERIAL: Connection closed - ' + result);
                });
            }
        });
    });
}

chrome.app.runtime.onLaunched.addListener(startApplication);

function getChromeVersion () {
    var raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);

    return raw ? parseInt(raw[2], 10) : false;
}
