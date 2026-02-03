/*
    If an id is also specified and a window with a matching id has been shown before, the remembered bounds of the window will be used instead.
*/
'use strict';

function startApplication() {
    chrome.app.window.create('main.html', {
        id: 'main-window',
        frame: 'chrome',
        innerBounds: {
            minWidth: 1024,
            minHeight: 550,
        },
    }, function (createdWindow) {
        if (getChromeVersion() >= 54) {
            createdWindow.icon = 'images/emu_icon_128.png';
        }
    });
}

try {
    chrome.app.runtime.onLaunched.addListener(startApplication);
    // debug trace
    console.log('[eventPage] onLaunched listener registered');
    try {
        const fs = require('fs');
        fs.appendFileSync('/tmp/emuflight-eventpage.log', `[eventPage] onLaunched registered: ${new Date().toISOString()}\n`);
    } catch (e) { console.error('Failed writing event log:', e); }
} catch (e) {
    console.warn('[eventPage] onLaunched not available or failed:', e);
    try {
        const fs = require('fs');
        fs.appendFileSync('/tmp/emuflight-eventpage.log', `[eventPage] onLaunched not available, invoking startApplication directly: ${new Date().toISOString()}\n`);
    } catch (e2) { console.error('Failed writing event log:', e2); }
    // as a fail-safe in debug, call startApplication directly
    try { startApplication(); } catch (e3) { console.error('startApplication failed:', e3); }
}

function getChromeVersion () {
    const raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);

    return raw ? parseInt(raw[2], 10) : false;
}
