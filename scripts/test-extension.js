// Automated test suite for extension/ (MV3) + electron/extensionBridge.ts + Aria2Manager integration.
// Usage: npm run test:ext
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { Aria2Manager } = require('../dist-electron/electron/aria2Manager.js');
const {
  ExtensionBridgeServer,
  validateExtensionUrl,
  sanitizeSuggestedFileName,
  normalizeExtensionPort
} = require('../dist-electron/electron/extensionBridge.js');

const ROOT = 'D:\\Ai\\antigravity\\nbrsflow_downloads_test';
const scratch = path.join(ROOT, '__ext_selftest__');
const tmpStore = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-ext-'));
const proj = path.join(__dirname, '..');
const extDir = path.join(proj, 'extension');

let passed = 0;
const ok = (n) => { passed++; console.log('  ok -', n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error('Timeout waiting for: ' + label);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function startFileServer() {
  const payload = Buffer.alloc(64 * 1024, 'B');
  const seenHeaders = [];
  const srv = http.createServer((req, res) => {
    seenHeaders.push({
      url: req.url,
      referer: req.headers.referer,
      userAgent: req.headers['user-agent'],
      cookie: req.headers.cookie
    });
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(payload.length)
    });
    res.end(payload);
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      resolve({ server: srv, port: srv.address().port, size: payload.length, seenHeaders });
    });
  });
}

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });

  const fileSrv = await startFileServer();
  let aria2 = null;
  let bridge = null;

  try {
    // 1. Validate extension/ Manifest V3 files
    const pkg = JSON.parse(fs.readFileSync(path.join(proj, 'package.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, pkg.version);
    assert.ok(manifest.permissions.includes('downloads'));
    assert.ok(manifest.permissions.includes('storage'));
    assert.ok(manifest.host_permissions.includes('http://127.0.0.1/*'));
    assert.ok(fs.existsSync(path.join(extDir, manifest.background.service_worker)));
    assert.ok(fs.existsSync(path.join(extDir, manifest.action.default_popup)));
    for (const iconRel of Object.values(manifest.icons)) {
      const iconBuf = fs.readFileSync(path.join(extDir, iconRel));
      assert.equal(iconBuf.subarray(0, 4).toString('hex'), '89504e47', `valid PNG: ${iconRel}`);
    }
    ok('extension/manifest.json (MV3), version sync, and PNG icons are valid');

    // 2. Syntax-check background.js, popup.js, confirm.js, and verify popup.html
    const bgCode = fs.readFileSync(path.join(extDir, 'background.js'), 'utf8');
    const popupCode = fs.readFileSync(path.join(extDir, 'popup.js'), 'utf8');
    const confirmCode = fs.readFileSync(path.join(extDir, 'confirm.js'), 'utf8');
    const popupHtml = fs.readFileSync(path.join(extDir, 'popup.html'), 'utf8');
    const confirmHtml = fs.readFileSync(path.join(extDir, 'confirm.html'), 'utf8');
    new vm.Script(bgCode, { filename: 'background.js' });
    new vm.Script(popupCode, { filename: 'popup.js' });
    new vm.Script(confirmCode, { filename: 'confirm.js' });
    assert.ok(manifest.permissions.includes('cookies'));
    assert.ok(bgCode.includes('onDeterminingFilename'));
    assert.ok(bgCode.includes('suggest()'));
    assert.ok(bgCode.includes('X-Nbrsflow-Extension'));
    assert.ok(bgCode.includes('COOLDOWN_MS'));
    assert.ok(bgCode.includes('confirmBeforeSend'));
    assert.ok(bgCode.includes('chrome.cookies.getAll'));
    assert.ok(popupHtml.includes('popup.js') && popupHtml.includes('toggleBtn') && popupHtml.includes('confirmToggleBtn'));
    assert.ok(confirmHtml.includes('confirm.js') && confirmHtml.includes('sendBtn'));
    ok('extension/background.js, popup.js, confirm.js, and HTML syntax & structure valid');

    // 3. Unit helpers
    assert.equal(validateExtensionUrl('https://example.com/file.zip'), 'https://example.com/file.zip');
    assert.equal(validateExtensionUrl('javascript:alert(1)'), null);
    assert.equal(validateExtensionUrl('file:///C:/test.exe'), null);
    assert.equal(sanitizeSuggestedFileName('../../evil:name?.zip'), 'evil_name_.zip');
    assert.equal(normalizeExtensionPort(47832), 47832);
    assert.equal(normalizeExtensionPort(80), 47832);
    ok('URL, filename, and port validation helpers work');

    // 4. Start Aria2Manager + ExtensionBridgeServer on 127.0.0.1
    aria2 = new Aria2Manager({ storageDir: tmpStore, getRootDir: () => scratch });
    await aria2.start();
    let addDownloadCalls = 0;
    const testPort = await getFreePort();
    bridge = new ExtensionBridgeServer({
      port: testPort,
      enabled: true,
      appVersion: pkg.version,
      extensionPath: extDir,
      isEngineReady: () => aria2.getState().connected,
      onAddDownload: ({ url, fileName, referrer, userAgent, cookie }) => {
        addDownloadCalls++;
        return aria2.addDownload(url, scratch, fileName, { referrer, userAgent, cookie });
      }
    });
    const st = await bridge.start();
    assert.equal(st.listening, true);
    assert.equal(st.host, '127.0.0.1');
    assert.ok(st.port > 0);
    const baseUrl = `http://127.0.0.1:${st.port}`;
    ok(`ExtensionBridgeServer listening on ${baseUrl}`);

    // 5. Security checks: missing header & bad origin rejected
    const noHdr = await fetch(`${baseUrl}/api/status`);
    assert.equal(noHdr.status, 403);

    const badOrigin = await fetch(`${baseUrl}/api/status`, {
      headers: { Origin: 'https://evil.example', 'X-Nbrsflow-Extension': '1' }
    });
    assert.equal(badOrigin.status, 403);

    const extOrigin = 'chrome-extension://abcdefghijklmnop';
    const goodStatus = await fetch(`${baseUrl}/api/status`, {
      headers: { Origin: extOrigin, 'X-Nbrsflow-Extension': '1' }
    });
    assert.equal(goodStatus.status, 200);
    assert.equal(goodStatus.headers.get('access-control-allow-origin'), extOrigin);
    const statusJson = await goodStatus.json();
    assert.equal(statusJson.ok, true);
    assert.equal(statusJson.version, pkg.version);
    assert.equal(statusJson.port, st.port);
    assert.equal(statusJson.enabled, true);
    assert.equal(statusJson.listening, true);
    ok('Origin, X-Nbrsflow-Extension, and /api/status port/enabled/listening metadata enforced');

    // 6. Invalid download payload rejected & long signed CDN URL (>2500 chars) accepted
    const badDl = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        'X-Nbrsflow-Extension': '1'
      },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    });
    assert.equal(badDl.status, 400);
    const longSig = 'a'.repeat(2600);
    const longRes = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        'X-Nbrsflow-Extension': '1'
      },
      body: JSON.stringify({ url: `http://127.0.0.1:${fileSrv.port}/signed-long.zip?sig=${longSig}`, fileName: 'signed-long.zip' })
    });
    assert.equal(longRes.status, 200);
    ok('Invalid/non-HTTP download URL rejected with 400 and long signed URL (>2500 chars) accepted');

    // 7. Enqueue real download with Referer / User-Agent / Cookie via ExtensionBridgeServer -> Aria2Manager
    const dlUrl = `http://127.0.0.1:${fileSrv.port}/sample-ext.bin`;
    const dlRes = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        'X-Nbrsflow-Extension': '1'
      },
      body: JSON.stringify({
        url: dlUrl,
        fileName: 'ext-caught.bin',
        referrer: 'https://example.com/downloads',
        userAgent: 'NbrsTestUA/1.0',
        cookie: 'session=abc123; theme=dark'
      })
    });
    assert.equal(dlRes.status, 200);
    const dlJson = await dlRes.json();
    assert.equal(dlJson.ok, true);
    assert.equal(dlJson.deduplicated, false);
    assert.equal(dlJson.fileName, 'ext-caught.bin');

    const destFile = path.join(scratch, 'ext-caught.bin');
    await waitFor(() => fs.existsSync(destFile) && fs.statSync(destFile).size === fileSrv.size, 'extension download completed');
    const hdrs = fileSrv.seenHeaders.find((h) => h.url === '/sample-ext.bin');
    assert.ok(hdrs, 'HTTP server saw download request');
    assert.equal(hdrs.referer, 'https://example.com/downloads');
    assert.equal(hdrs.userAgent, 'NbrsTestUA/1.0');
    assert.equal(hdrs.cookie, 'session=abc123; theme=dark');
    ok('Real download enqueued via ExtensionBridgeServer forwarded Referer, User-Agent, and Cookie to aria2');

    // 7b. Cooldown deduplication: sending same URL within 5s does not enqueue a duplicate
    const dupRes = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        'X-Nbrsflow-Extension': '1'
      },
      body: JSON.stringify({
        url: dlUrl,
        fileName: 'ext-caught.bin'
      })
    });
    assert.equal(dupRes.status, 200);
    const dupJson = await dupRes.json();
    assert.equal(dupJson.ok, true);
    assert.equal(dupJson.deduplicated, true);
    assert.equal(addDownloadCalls, 2);
    ok('ExtensionBridgeServer deduplicates repeated URL within cooldown window');

    // 8. Reconfigure (disable -> stop, enable -> start)
    const stopped = await bridge.reconfigure(false);
    assert.equal(stopped.listening, false);
    await assert.rejects(() => fetch(`${baseUrl}/api/status`, { headers: { 'X-Nbrsflow-Extension': '1' } }));
    const restarted = await bridge.reconfigure(true, st.port);
    assert.equal(restarted.listening, true);
    ok('ExtensionBridgeServer reconfigure disable/enable lifecycle works');

    // 9. Background script confirmation window close (chrome.windows.onRemoved) -> immediate suggest()
    const bgSrc = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
    let onDeterminingCb = null;
    let onWinRemovedCb = null;
    let createdWinId = 777;
    const chromeMock = {
      storage: {
        local: {
          get: async () => ({ enabled: true, confirmBeforeSend: true, port: st.port, lang: 'en', lastNotice: null }),
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      },
      action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      contextMenus: { removeAll: (cb) => cb?.(), create: () => {}, onClicked: { addListener: () => {} } },
      runtime: {
        lastError: null,
        getURL: (p) => `chrome-extension://test/${p}`,
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onMessage: { addListener: () => {} }
      },
      downloads: {
        onDeterminingFilename: { addListener: (cb) => { onDeterminingCb = cb; } },
        cancel: async () => {},
        erase: async () => {}
      },
      windows: {
        create: (_opts, cb) => { setTimeout(() => cb({ id: createdWinId }), 10); },
        remove: () => {},
        onRemoved: { addListener: (cb) => { onWinRemovedCb = cb; } }
      },
      notifications: { create: () => {} },
      cookies: { getAll: async () => [] }
    };
    vm.runInNewContext(bgSrc, {
      chrome: chromeMock,
      fetch,
      URL,
      URLSearchParams,
      AbortController,
      navigator: { userAgent: 'TestBrowser/1.0' },
      setTimeout,
      clearTimeout,
      console
    });
    assert.ok(typeof onDeterminingCb === 'function' && typeof onWinRemovedCb === 'function');
    let suggestCalled = false;
    const tStart = Date.now();
    const suggestPromise = new Promise((resolve) => {
      onDeterminingCb(
        { id: 1, url: 'https://example.com/archive.zip', filename: 'archive.zip' },
        () => { suggestCalled = true; resolve(); }
      );
    });
    await sleep(40);
    onWinRemovedCb(createdWinId);
    await waitFor(() => suggestCalled, 'suggest() called immediately after confirmation window closed', 1500);
    await suggestPromise;
    assert.ok(Date.now() - tStart < 1500, 'did not wait for 30s confirmation timeout');
    ok('background.js resolves confirmation immediately and calls suggest() when popup window is closed');

    // 10. Auto-port sync, MV3 chrome.storage.local cooldown persistence, sendDirectUrl & noise filtering
    const bridgeSync = new ExtensionBridgeServer({
      port: 47835,
      enabled: true,
      appVersion: pkg.version,
      extensionPath: extDir,
      isEngineReady: () => true,
      getLanguage: () => 'en',
      onAddDownload: ({ url, fileName, referrer, userAgent, cookie }) =>
        aria2.addDownload(url, scratch, fileName, { referrer, userAgent, cookie })
    });
    const stSync = await bridgeSync.start();
    try {
      assert.equal(stSync.listening, true);
      const storageBacking = {
        enabled: true,
        confirmBeforeSend: false,
        port: 47899, // stale port
        lastWorkingPort: 47835,
        lang: 'ar',
        langManual: false,
        lastNotice: null,
        recentSentUrls: {}
      };
      let onAlarmCb = null;
      const createSw = () => {
        let onMsg = null;
        let onDet = null;
        let canceledIds = [];
        const mock = {
          storage: {
            local: {
              get: async (defaults) => {
                const out = { ...(defaults || {}) };
                for (const k of Object.keys(storageBacking)) out[k] = storageBacking[k];
                return out;
              },
              set: async (patch) => { Object.assign(storageBacking, patch); }
            },
            onChanged: { addListener: () => {} }
          },
          alarms: {
            create: () => {},
            onAlarm: { addListener: (cb) => { onAlarmCb = cb; } }
          },
          action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
          contextMenus: { removeAll: (cb) => cb?.(), create: () => {}, onClicked: { addListener: () => {} } },
          runtime: {
            lastError: null,
            getURL: (p) => `chrome-extension://test/${p}`,
            onInstalled: { addListener: () => {} },
            onStartup: { addListener: () => {} },
            onMessage: { addListener: (cb) => { onMsg = cb; } }
          },
          downloads: {
            onDeterminingFilename: { addListener: (cb) => { onDet = cb; } },
            cancel: async (id) => { canceledIds.push(id); },
            erase: async () => {}
          },
          windows: { create: () => {}, remove: () => {}, onRemoved: { addListener: () => {} } },
          notifications: { create: () => {} },
          cookies: { getAll: async () => [] }
        };
        vm.runInNewContext(bgSrc, {
          chrome: mock, fetch, URL, URLSearchParams, AbortController,
          navigator: { userAgent: 'TestBrowser/1.0' }, setTimeout, clearTimeout, console
        });
        return {
          sendMsg: (msg) => new Promise((resolve) => onMsg(msg, {}, resolve)),
          triggerDetermining: (item) => new Promise((resolve) => onDet(item, () => resolve())),
          getCanceled: () => canceledIds
        };
      };

      const sw1 = createSw();
      const stateRes = await sw1.sendMsg({ type: 'getState' });
      assert.equal(stateRes.bridge.connected, true);
      assert.equal(stateRes.bridge.port, stSync.port);
      assert.equal(stateRes.bridge.autoSyncedPort, true);
      assert.equal(storageBacking.port, stSync.port);
      assert.equal(storageBacking.lang, 'en');

      const directUrl = `http://127.0.0.1:${fileSrv.port}/direct-popup.bin`;
      const sendRes = await sw1.sendMsg({ type: 'sendDirectUrl', url: directUrl });
      assert.equal(sendRes.ok, true);
      assert.ok(storageBacking.recentSentUrls[directUrl] > 0);

      // Simulate MV3 Service Worker restart: new sw2 reads persisted recentSentUrls from chrome.storage.local
      const sw2 = createSw();
      await sw2.triggerDetermining({ id: 99, url: directUrl, filename: 'direct-popup.bin' });
      assert.ok(sw2.getCanceled().includes(99), 'persisted cooldown deduplicated after SW restart');

      // Noise filtering: favicon.ico should pass through via suggest() without cancelling
      await sw2.triggerDetermining({ id: 100, url: `http://127.0.0.1:${fileSrv.port}/favicon.ico`, filename: 'favicon.ico' });
      assert.ok(!sw2.getCanceled().includes(100), 'favicon.ico ignored by noise filter');

      // Domain exclusions: set excludedDomains and verify excluded host passes through without cancelling
      const exclRes = await sw2.sendMsg({ type: 'setExcludedDomains', domains: 'ignored.example, *.skip.test' });
      assert.equal(exclRes.ok, true);
      assert.deepEqual([...exclRes.excludedDomains], ['ignored.example', 'skip.test']);
      await sw2.triggerDetermining({ id: 101, url: 'https://cdn.ignored.example/archive.zip', filename: 'archive.zip' });
      assert.ok(!sw2.getCanceled().includes(101), 'excluded domain skipped interception');

      // Alarm-based auto-reconnect after SW wake-up with stale port
      storageBacking.port = 47899;
      assert.ok(typeof onAlarmCb === 'function');
      await onAlarmCb({ name: 'nbrsflow-keepalive' });
      await waitFor(() => storageBacking.port === stSync.port, 'keepalive alarm auto-resynced bridge port', 2000);

      ok('Auto-port sync, keepalive alarm reconnect, MV3 storage cooldown persistence, sendDirectUrl, noise filtering, and domain exclusions work');
    } finally {
      await bridgeSync.stop();
    }

    console.log(`\nALL ${passed} EXTENSION & BRIDGE TESTS PASSED`);
  } finally {
    await bridge?.stop();
    await aria2?.stop();
    fileSrv.server.close();
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(tmpStore, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
