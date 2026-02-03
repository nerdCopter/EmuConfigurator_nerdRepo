// Poll the Chrome remote debugging endpoint and inject a small script into any
// extension background pages to define nwNatives.getRoutingID if missing.

const http = require('http');
const WebSocket = require('ws');

const DEBUG_URL = process.env.DEBUG_REMOTE_URL || 'http://127.0.0.1:9222/json';
const EXT_CHECK = process.env.EXT_ID || ''; // optional extension ID filter
const MAX_TRIES = 300; // try for up to ~30 seconds at 100ms
const INTERVAL_MS = 100;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function tryInject() {
  console.log('[inject-nw-natives] starting injector, target URL=', DEBUG_URL, 'filter=', EXT_CHECK || '(any)');
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    try {
      const list = await fetchJson(DEBUG_URL);
      if (!Array.isArray(list)) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));
        continue;
      }
      for (const target of list) {
        try {
          // We care about extension background pages or extensions' generated pages
          if (!target.webSocketDebuggerUrl || !target.url) continue;
          if (target.url.startsWith('chrome-extension://') === false) continue;
          if (EXT_CHECK && target.url.indexOf(EXT_CHECK) === -1) continue;

          console.log('[inject-nw-natives] attempting inject into', target.url);
          // Connect and run Runtime.evaluate
          await injectIntoTarget(target.webSocketDebuggerUrl);
          console.log('[inject-nw-natives] injection attempt completed for', target.url);
        } catch (e) {
          console.warn('[inject-nw-natives] per-target inject error', e && e.message);
        }
      }
      // wait briefly before next poll
    } catch (e) {
      // ignore fetch errors
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  console.log('[inject-nw-natives] finished injector attempts');
}

function injectIntoTarget(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('open', () => {
      const expr = `(function(){try{window.nwNatives=window.nwNatives||{}; if(typeof window.nwNatives.getRoutingID !== 'function'){window.nwNatives.getRoutingID=function(){return 0}; console.log('[inject-nw-natives] installed fallback getRoutingID');}}catch(e){console.warn('[inject-nw-natives] injection failed', e);} })()`;
      const msg = { id: 1, method: 'Runtime.evaluate', params: { expression: expr } };
      ws.send(JSON.stringify(msg));
    });
    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload && payload.id === 1) {
          ws.close();
          resolve();
        }
      } catch (e) { /* ignore */ }
    });
    ws.on('error', (err) => reject(err));
    ws.on('close', () => resolve());
  });
}

// Run
tryInject().then(() => {
  console.log('[inject-nw-natives] finished attempts');
  process.exit(0);
}).catch((e) => {
  console.error('[inject-nw-natives] failed', e);
  process.exit(1);
});