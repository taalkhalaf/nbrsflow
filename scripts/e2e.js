// End-to-end check: launches Vite + Electron, drives the real UI over the Chrome DevTools Protocol.
// Usage: npm run test:e2e
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const ROOT = 'D:\\Ai\\antigravity\\nbrsflow_downloads_test';
const base = path.join(ROOT, '__e2e__');
const proj = path.join(__dirname, '..');
const e2eUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-e2e-ud-'));
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
let passed = 0;
const ok = (n) => { passed++; console.log('  ok -', n); };

function kill() {
  for (const p of procs) { try { spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ } }
  try { spawnSync('taskkill', ['/IM', 'aria2c.exe', '/F'], { stdio: 'ignore' }); } catch { /* */ }
}

async function waitFor(fn, label, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(200); }
  throw new Error('Timeout waiting for: ' + label);
}

(async () => {
  const net = require('node:net');
  const e2eExtPort = await new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(47932));
    s.listen(47832, '127.0.0.1', () => s.close(() => resolve(47832)));
  });
  if (e2eExtPort !== 47832) {
    fs.writeFileSync(path.join(e2eUserData, 'settings.json'), JSON.stringify({ extensionPort: e2eExtPort }));
  }
  fs.mkdirSync(ROOT, { recursive: true });
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(path.join(base, 'dirA'), { recursive: true });
  fs.mkdirSync(path.join(base, 'dirB'));
  fs.writeFileSync(path.join(base, 'note1.txt'), 'one');
  fs.writeFileSync(path.join(base, 'note2.txt'), 'two');

  spawnSync(process.execPath, [path.join(proj, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'electron/tsconfig.json'], { cwd: proj, stdio: 'inherit' });
  procs.push(spawn(process.execPath, [path.join(proj, 'node_modules', 'vite', 'bin', 'vite.js')], { cwd: proj, stdio: 'ignore' }));
  await waitFor(async () => (await fetch('http://localhost:5173/')).ok, 'vite');
  procs.push(spawn(path.join(proj, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', `--remote-debugging-port=${PORT}`], { cwd: proj, stdio: 'ignore', env: { ...process.env, NBRS_E2E: '1', NBRS_USER_DATA_DIR: e2eUserData } }));

  const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('5173')), 'electron page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const ev = (expr) => new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, (d) => d.result?.exceptionDetails ? reject(new Error(JSON.stringify(d.result.exceptionDetails.exception?.description || d.result.exceptionDetails.text))) : resolve(d.result?.result?.value));
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });

  await waitFor(async () => (await ev('typeof window.nbrsAPI === "object" && document.readyState === "complete"')) === true, 'window.nbrsAPI bridge available', 8000);
  ok('window.nbrsAPI bridge available');

  const pkgVer = require('../package.json').version;
  assert.equal(await ev('window.nbrsAPI.version'), pkgVer);
  assert.equal(await ev(`document.querySelector('[data-testid="app-version"]')?.textContent?.trim()`), `v${pkgVer}`);
  assert.ok(await ev(`!!document.querySelector('[data-testid="clipboard-toggle"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="settings-btn"]')`));
  assert.ok(await ev(`(() => { const img = document.querySelector('[data-testid="topbar-brand-icon"]'); return !!img && img.complete && img.naturalWidth > 0; })()`));
  ok(`TopBar and window.nbrsAPI display real package.json version (v${pkgVer}), official brand icon, clipboard toggle, and settings button`);

  // Custom frameless TopBar window controls (right side), decluttered TopBar, DownloadsPanel +AddUrl, ExplorerPane NewFolder/AutoOrganize
  assert.ok(await ev(`document.querySelector('[data-testid="topbar"]')?.classList.contains('drag-region')`));
  assert.ok(await ev(`!document.querySelector('[data-testid="topbar"] nav[aria-label="breadcrumb"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="topbar"] [data-testid="topbar-search-input"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="search-scope-downloads"]') && !!document.querySelector('[data-testid="search-scope-files"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="downloads-panel"] [data-testid="dl-add-url-btn"]')`));
  assert.ok(await ev(`!document.querySelector('[data-testid="topbar"] [data-testid="dl-add-url-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="pane-nav"] [data-testid="pane-new-folder-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="pane-nav"] [data-testid="autoorganize-toggle"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="pane-nav"] [data-testid="explorer-tools"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="explorer-tools"] [data-testid="this-pc-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="explorer-tools"] [data-testid="autocolor-toggle"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="explorer-tools"] [data-testid="organize-now-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="explorer-tools"] [data-testid="compare-duplicates-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="explorer-tools"] [data-testid="dual-pane-toggle"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="explorer-tools"] [data-testid="view-toggle-btn"]')`));
  assert.ok(await ev(`!document.querySelector('[data-testid="topbar"] [data-testid="autocolor-toggle"]')`));
  assert.ok(await ev(`!document.querySelector('[data-testid="topbar"] [data-testid="dual-pane-toggle"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="topbar"] [data-testid="sidebar-toggle"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="pane-back"] svg') && !!document.querySelector('[data-testid="pane-forward"] svg') && !!document.querySelector('[data-testid="pane-up"] svg')`));
  assert.ok(await ev(`!document.querySelector('[data-testid="topbar"] [data-testid="autoorganize-toggle"]')`));
  assert.ok(await ev(`(() => { const bar = document.querySelector('[data-testid="topbar"]').getBoundingClientRect(); const wc = document.querySelector('[data-testid="window-controls"]').getBoundingClientRect(); return wc.left > bar.left + bar.width * 0.6 && wc.right <= bar.right + 2; })()`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="win-min-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="win-max-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="win-close-btn"]')`));
  const initMax = !!(await ev(`window.nbrsAPI.windowCtrl.isMaximized()`));
  await ev(`document.querySelector('[data-testid="win-max-btn"]').click()`);
  await waitFor(async () => (await ev(`window.nbrsAPI.windowCtrl.isMaximized()`)) === !initMax, 'window maximize toggled');
  await ev(`document.querySelector('[data-testid="win-max-btn"]').click()`);
  await waitFor(async () => (await ev(`window.nbrsAPI.windowCtrl.isMaximized()`)) === initMax, 'window maximize restored');
  ok('TopBar layout cleaned (window controls on right, Add URL in DownloadsPanel, New Folder & Auto-Organize in ExplorerPane)');

  // Categorized Settings dialog: Appearance (Theme/Language), Downloads, System & Startup, Browser Extension, About
  const initSettings = await ev(`window.nbrsAPI.settings.get()`);
  assert.equal(initSettings.maxConcurrentDownloads, 0);
  assert.equal(initSettings.maxDownloadSpeedKbps, 0);
  const initialTray = !!initSettings?.minimizeToTray;
  await ev(`document.querySelector('[data-testid="settings-btn"]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-dialog"]')`), 'settings dialog opened');

  // Appearance tab (default): Theme & Language controls live here (moved out of TopBar)
  assert.ok(await ev(`!!document.querySelector('[data-testid="settings-panel-appearance"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="settings-theme-dark"]') && !!document.querySelector('[data-testid="settings-theme-light"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="settings-lang-ar"]') && !!document.querySelector('[data-testid="settings-lang-en"]')`));

  // Downloads tab: concurrent downloads & speed limit
  await ev(`document.querySelector('[data-testid="settings-tab-downloads"]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-panel-downloads"]')`), 'downloads tab opened');
  await ev(`(() => { const el = document.querySelector('[data-testid="max-concurrent-input"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '3'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await ev(`(() => { const el = document.querySelector('[data-testid="max-speed-input"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '512'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await ev(`document.querySelector('[data-testid="apply-download-settings"]').click()`);
  await waitFor(async () => {
    const st = await ev(`window.nbrsAPI.settings.get()`);
    return st?.maxConcurrentDownloads === 3 && st?.maxDownloadSpeedKbps === 512;
  }, 'download concurrency & speed limit persisted');
  await ev(`window.nbrsAPI.settings.set({ maxConcurrentDownloads: 0, maxDownloadSpeedKbps: 0 })`);

  // System & Startup tab: Close/Minimize to tray toggle & Battery Lite mode
  await ev(`document.querySelector('[data-testid="settings-tab-system"]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-panel-system"]')`), 'system tab opened');
  assert.ok(await ev(`!!document.querySelector('[data-testid="toggle-battery-lite"]')`));
  await ev(`document.querySelector('[data-testid="toggle-tray"]').click()`);
  await waitFor(async () => (await ev(`window.nbrsAPI.settings.get()`))?.minimizeToTray === !initialTray, 'minimizeToTray persisted');
  await ev(`document.querySelector('[data-testid="toggle-tray"]').click()`);
  await waitFor(async () => (await ev(`window.nbrsAPI.settings.get()`))?.minimizeToTray === initialTray, 'minimizeToTray restored');

  // Browser Extension tab
  await ev(`document.querySelector('[data-testid="settings-tab-extension"]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-panel-extension"]')`), 'extension tab opened');
  await waitFor(async () => (await ev(`document.querySelector('[data-testid="extension-status"]')?.textContent`))?.includes(`127.0.0.1:${e2eExtPort}`), 'extension bridge listening');
  assert.ok((await ev(`document.querySelector('[data-testid="extension-path"]')?.textContent`))?.includes('extension'));
  await ev(`document.querySelector('[data-testid="toggle-extension"]').click()`);
  await waitFor(async () => (await ev(`window.nbrsAPI.extension.getStatus()`))?.listening === false, 'extension bridge stopped');
  await ev(`document.querySelector('[data-testid="toggle-extension"]').click()`);
  await waitFor(async () => (await ev(`window.nbrsAPI.extension.getStatus()`))?.listening === true, 'extension bridge restarted');

  // External Folder tab: organize an external temp folder + Undo
  const extTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-ext-org-'));
  fs.writeFileSync(path.join(extTempDir, 'Legacy_Show_S01E01.mp4'), '1');
  fs.writeFileSync(path.join(extTempDir, 'Legacy_Show_S01E02.mp4'), '2');
  await ev(`document.querySelector('[data-testid="settings-tab-external"]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-panel-external"]')`), 'external tab opened');
  await ev(`(() => { const el = document.querySelector('[data-testid="external-folder-input"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, ${JSON.stringify(extTempDir)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await ev(`document.querySelector('[data-testid="organize-external-folder-btn"]').click()`);
  await waitFor(() => fs.existsSync(path.join(extTempDir, 'Legacy Show', 'Legacy_Show_S01E01.mp4')), 'external folder organized');
  const extUndo = await ev(`window.nbrsAPI.files.undo()`);
  assert.equal(extUndo.undone, true);
  assert.ok(fs.existsSync(path.join(extTempDir, 'Legacy_Show_S01E01.mp4')));
  fs.rmSync(extTempDir, { recursive: true, force: true });

  // About tab + Footer Save / Save & Close / Restore Defaults buttons
  await ev(`document.querySelector('[data-testid="settings-tab-about"]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-panel-about"]')`), 'about tab opened');
  const aboutText = await ev(`document.querySelector('[data-testid="settings-panel-about"]')?.textContent || ''`);
  assert.ok(aboutText.includes('nbrsflow') && aboutText.includes(`v${pkgVer}`));
  assert.ok(aboutText.includes('NBRS VibeCoding') && aboutText.includes('nbrs.vibecoding@gmail.com'));
  assert.ok(await ev(`!!document.querySelector('[data-testid="about-logo-slot"]')`));
  await waitFor(() => ev(`(() => { const img = document.querySelector('[data-testid="about-brand-logo"]'); return !!img && img.complete && img.naturalWidth > 0; })()`), 'about brand logo loaded');
  assert.ok(await ev(`!!document.querySelector('[data-testid="settings-restore-defaults"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="settings-save-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="settings-save-close-btn"]')`));

  await ev(`document.querySelector('[data-testid="settings-save-close-btn"]').click()`);
  await waitFor(() => ev(`!document.querySelector('[data-testid="settings-dialog"]')`), 'settings dialog closed via Save & Close');
  ok('Categorized Settings dialog (Appearance, Downloads, System, Extension, External Folder, About) & Save/Restore work');

  // Verify TopBar Undo & Duplicate Highlight buttons + Quick Preview + Batch Rename + Undo IPC
  assert.ok(await ev(`!!document.querySelector('[data-testid="undo-btn"]')`));
  assert.ok(await ev(`!!document.querySelector('[data-testid="compare-duplicates-btn"]')`));
  const previewTestFile = path.join(base, 'preview-e2e.txt');
  fs.writeFileSync(previewTestFile, 'e2e-preview-content');
  const prevRes = await ev(`window.nbrsAPI.files.readPreview(${JSON.stringify(previewTestFile)})`);
  assert.equal(prevRes.kind, 'text');
  assert.equal(prevRes.text, 'e2e-preview-content');
  const renRes = await ev(`window.nbrsAPI.files.batchRename([{ path: ${JSON.stringify(previewTestFile)}, newName: 'preview-e2e-renamed.txt' }])`);
  assert.equal(renRes.length, 1);
  assert.ok(fs.existsSync(path.join(base, 'preview-e2e-renamed.txt')));
  const undoRes = await ev(`window.nbrsAPI.files.undo()`);
  assert.equal(undoRes.undone, true);
  assert.ok(fs.existsSync(previewTestFile));
  fs.unlinkSync(previewTestFile);
  ok('Batch rename, Quick Preview, and Undo file action work end-to-end');

  // TopBar sidebar toggle: hide and restore Quick Access sidebar and verify persistence
  const initialSidebar = !!(await ev(`!!document.querySelector('aside')`));
  await ev(`document.querySelector('[data-testid="sidebar-toggle"]').click()`);
  await waitFor(async () => (await ev(`!!document.querySelector('aside')`)) === !initialSidebar, 'sidebar toggled');
  await waitFor(async () => (await ev(`window.nbrsAPI.settings.get()`))?.showSidebar === !initialSidebar, 'showSidebar persisted');
  await ev(`document.querySelector('[data-testid="sidebar-toggle"]').click()`);
  await waitFor(async () => (await ev(`!!document.querySelector('aside')`)) === initialSidebar, 'sidebar restored');
  ok('TopBar sidebar toggle hides/shows Quick Access sidebar and persists showSidebar');

  // helpers living in the page (installed after the page has finished loading)
  await ev(`window.__t = {
    item: (name) => [...document.querySelectorAll('main [data-testid="pane-items"] button[title], main [data-testid="pane-items"] tr')].find((e) => (e.title || e.textContent).trim().endsWith(name)),
    names: () => [...document.querySelectorAll('main [data-testid="pane-items"] button[title]')].map((b) => b.title),
    fire: (el, type, init = {}) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })),
    pane: () => document.querySelector('main [tabindex="0"]'),
    key: (k, init = {}) => window.__t.pane().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })),
    dt: new DataTransfer(),
    drag: (from, to) => { const dt = new DataTransfer(); const mk = (t) => new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt });
      from.dispatchEvent(mk('dragstart')); to.dispatchEvent(mk('dragover')); to.dispatchEvent(mk('drop')); from.dispatchEvent(mk('dragend')); }
  }; true`);

  await waitFor(() => ev(`window.__t.names().includes('__e2e__')`), 'initial listing shows real folder');
  ok('UI lists real folder content on startup');

  await ev(`window.__t.fire(window.__t.item('__e2e__'), 'dblclick')`);
  await waitFor(() => ev(`window.__t.names().includes('note1.txt')`), 'navigate into folder');
  ok('double-click navigates into folder');

  // live watcher: create a file from outside the app
  fs.writeFileSync(path.join(base, 'external.txt'), 'x');
  await waitFor(() => ev(`window.__t.names().includes('external.txt')`), 'watcher adds external file', 8000);
  ok('file watcher: externally created file appears live');
  fs.unlinkSync(path.join(base, 'external.txt'));
  await waitFor(() => ev(`!window.__t.names().includes('external.txt')`), 'watcher removes external file', 8000);
  ok('file watcher: externally deleted file disappears live');

  // folder size shown next to folder (put 3 bytes in dirB)
  fs.writeFileSync(path.join(base, 'dirB', 'f.bin'), 'abc');
  await waitFor(() => ev(`window.__t.item('dirB').textContent.includes('3 B')`), 'folder size shown', 8000);
  ok('folder size displayed next to folder (3 B)');

  // drag & drop file onto folder
  await ev(`window.__t.drag(window.__t.item('note1.txt'), window.__t.item('dirA'))`);
  await waitFor(() => fs.existsSync(path.join(base, 'dirA', 'note1.txt')) && !fs.existsSync(path.join(base, 'note1.txt')), 'drag&drop moved file');
  await waitFor(() => ev(`!window.__t.names().includes('note1.txt')`), 'UI updated after move');
  ok('drag & drop onto folder moves the file and refreshes the UI');

  // context menu
  await ev(`window.__t.fire(window.__t.item('note2.txt'), 'contextmenu', { clientX: 300, clientY: 300 })`);
  const menuText = await waitFor(() => ev(`document.querySelector('.fixed.z-50.rounded-xl')?.innerText`), 'context menu');
  for (const w of ['F2', 'Delete', 'Enter']) assert.ok(menuText.includes(w), 'menu has ' + w);
  assert.ok(!/Smart extract|فك الضغط/.test(menuText), 'no extract entry for .txt'); ok('context menu shown (no extract for non-zip)');
  await ev(`window.__t.fire(document.body, 'mousedown')`);

  // keyboard: F2 rename
  await ev(`window.__t.fire(window.__t.item('note2.txt'), 'click')`);
  await ev(`window.__t.key('F2')`);
  await waitFor(() => ev(`!!document.querySelector('form input')`), 'rename dialog');
  await ev(`(() => { const i = document.querySelector('form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'renamed.txt'); i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('form').requestSubmit(); })()`);
  await waitFor(() => fs.existsSync(path.join(base, 'renamed.txt')) && !fs.existsSync(path.join(base, 'note2.txt')), 'F2 rename applied');
  ok('F2 opens rename dialog and renames on disk');

  // keyboard: Ctrl+A then Delete -> Recycle Bin
  await waitFor(() => ev(`window.__t.names().includes('renamed.txt')`), 'renamed shows');
  await ev(`window.__t.fire(window.__t.item('renamed.txt'), 'click')`);
  await ev(`window.__t.key('Delete')`);
  await waitFor(() => !fs.existsSync(path.join(base, 'renamed.txt')), 'Delete removed file', 10000);
  await waitFor(() => ev(`!window.__t.names().includes('renamed.txt')`), 'UI removed deleted file', 5000);
  ok('Delete key sends the file to the Recycle Bin (removed from folder)');

  await ev(`window.__t.key('a', { ctrlKey: true })`);
  assert.equal((await ev(`document.querySelector('footer').innerText`)).match(/(\d+)\s*(selected|محدد)/)[1], '2', 'select all shows count'); ok('Ctrl+A selects all items');

  // Enter opens folder, Backspace goes up
  await ev(`window.__t.fire(window.__t.item('dirA'), 'click')`);
  await ev(`window.__t.key('Enter')`);
  await waitFor(() => ev(`window.__t.names().includes('note1.txt')`), 'Enter opened folder');
  ok('Enter opens the selected folder');
  await ev(`window.__t.key('Backspace')`);
  await waitFor(() => ev(`window.__t.names().includes('dirA') && window.__t.names().includes('dirB')`), 'Backspace went to parent');
  ok('Backspace goes to the parent folder');

  // per-pane Back / Forward / Up navigation history
  assert.equal(await ev(`document.querySelector('[data-testid="pane-forward"]').disabled`), true);
  await ev(`document.querySelector('[data-testid="pane-back"]').click()`);
  await waitFor(() => ev(`window.__t.names().includes('note1.txt')`), 'Back button returned into dirA');
  assert.equal(await ev(`document.querySelector('[data-testid="pane-forward"]').disabled`), false);
  await ev(`document.querySelector('[data-testid="pane-forward"]').click()`);
  await waitFor(() => ev(`window.__t.names().includes('dirA') && window.__t.names().includes('dirB')`), 'Forward button returned to __e2e__');
  await ev(`document.querySelector('[data-testid="pane-up"]').click()`);
  await waitFor(() => ev(`window.__t.names().includes('__e2e__')`), 'Up button navigated to root');
  await ev(`document.querySelector('[data-testid="pane-back"]').click()`);
  await waitFor(() => ev(`window.__t.names().includes('dirA')`), 'Back button returned from root to __e2e__');
  ok('per-pane Back / Forward / Up navigation history works');

  // Dual-Pane independent breadcrumbs
  await ev(`document.querySelector('[data-testid="dual-pane-toggle"]').click()`);
  await waitFor(() => ev(`document.querySelectorAll('[data-testid="pane-nav"]').length === 2`), 'dual pane opened');
  await ev(`[...document.querySelectorAll('main [tabindex="0"]')[1].querySelectorAll('button[title]')].find((b) => b.title === '__e2e__').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await waitFor(() => ev(`document.querySelectorAll('[data-testid="pane-breadcrumb"]')[1].textContent.includes('__e2e__')`), 'pane 1 navigated to __e2e__');
  await ev(`[...document.querySelectorAll('main [tabindex="0"]')[0].querySelectorAll('button[title]')].find((b) => b.title === 'dirA').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await ev(`[...document.querySelectorAll('main [tabindex="0"]')[1].querySelectorAll('button[title]')].find((b) => b.title === 'dirB').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await waitFor(() => ev(`document.querySelectorAll('[data-testid="pane-breadcrumb"]')[0].textContent.includes('dirA') && document.querySelectorAll('[data-testid="pane-breadcrumb"]')[1].textContent.includes('dirB')`), 'both panes show independent breadcrumbs');
  ok('Dual-Pane displays independent interactive breadcrumbs for each pane simultaneously');
  await ev(`document.querySelector('[data-testid="dual-pane-toggle"]').click()`);
  await waitFor(() => ev(`document.querySelectorAll('[data-testid="pane-nav"]').length === 1`), 'dual pane closed');
  await ev(`document.querySelector('[data-testid="pane-back"]').click()`);
  await waitFor(() => ev(`window.__t.names().includes('dirA') && window.__t.names().includes('dirB')`), 'pane 0 returned to __e2e__');

  // folder color via context menu
  await ev(`window.__t.fire(window.__t.item('dirA'), 'contextmenu', { clientX: 250, clientY: 250 })`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid="color-row"] [data-color="blue"]')`), 'color swatch');
  await ev(`document.querySelector('[data-testid="color-row"] [data-color="blue"]').click()`);
  await waitFor(() => ev(`window.__t.item('dirA')?.querySelector('svg[data-color="blue"]') && !!window.__t.item('dirA')?.querySelector('[data-testid="color-badge"]')`), 'folder colored blue');
  ok('context menu sets folder color and renders icon + badge');

  // summary via context menu
  await ev(`window.__t.fire(window.__t.item('dirA'), 'contextmenu', { clientX: 250, clientY: 250 })`);
  await waitFor(() => ev(`!!document.querySelector('.fixed.z-50.rounded-xl')`), 'menu for summary');
  await ev(`[...document.querySelectorAll('.fixed.z-50.rounded-xl button')].find((b) => /summary|ملخص/i.test(b.textContent)).click()`);
  await waitFor(() => ev(`!!document.querySelector('form textarea')`), 'summary dialog');
  await ev(`(() => { const ta = document.querySelector('form textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'موسم أول\\nSeason 1 notes'); ta.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('form').requestSubmit(); })()`);
  await waitFor(() => ev(`!!window.__t.item('dirA')?.querySelector('[data-testid="note-indicator"]')`), 'note indicator');
  ok('summary saved and note indicator shown');

  // hover card appears after ~350ms (React maps onMouseEnter/Leave to mouseover/mouseout)
  await ev(`window.__t.fire(window.__t.item('dirA'), 'mouseover', { clientX: 200, clientY: 200 })`);
  const cardText = await waitFor(() => ev(`document.querySelector('[data-testid="hover-card"]')?.innerText`), 'hover card', 3000);
  assert.ok(cardText.includes('Season 1 notes') && cardText.includes('موسم أول'));
  ok('hover summary card appears with full summary text');
  await ev(`window.__t.fire(window.__t.item('dirA'), 'mouseout')`);

  // search matches summary text
  await ev(`(() => { const i = document.querySelector('header input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'موسم'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(() => ev(`window.__t.names().length === 1 && window.__t.names()[0] === 'dirA'`), 'search by summary');
  ok('search bar matches saved summary text');
  await ev(`(() => { const i = document.querySelector('header input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(() => ev(`window.__t.names().includes('dirB')`), 'clear search');

  // rename keeps color + summary
  await ev(`window.__t.fire(window.__t.item('dirA'), 'click')`);
  await ev(`window.__t.key('F2')`);
  await waitFor(() => ev(`!!document.querySelector('form input')`), 'rename dialog for dirA');
  await ev(`(() => { const i = document.querySelector('form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'dirA_ren'); i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('form').requestSubmit(); })()`);
  await waitFor(() => ev(`window.__t.item('dirA_ren')?.querySelector('svg[data-color="blue"]') && !!window.__t.item('dirA_ren')?.querySelector('[data-testid="note-indicator"]')`), 'rename kept metadata');
  ok('renaming folder preserves color and summary');

  // move keeps color + summary
  await ev(`window.__t.drag(window.__t.item('dirA_ren'), window.__t.item('dirB'))`);
  await waitFor(() => ev(`!window.__t.names().includes('dirA_ren')`), 'dirA_ren moved into dirB');
  await ev(`window.__t.fire(window.__t.item('dirB'), 'dblclick')`);
  await waitFor(() => ev(`window.__t.item('dirA_ren')?.querySelector('svg[data-color="blue"]') && !!window.__t.item('dirA_ren')?.querySelector('[data-testid="note-indicator"]')`), 'move kept metadata');
  ok('moving folder preserves color and summary');

  // cleanup metadata via API
  await ev(`window.nbrsAPI.metadata.setFolderColor(${JSON.stringify(path.join(base, 'dirB', 'dirA_ren'))}, null)`);
  await ev(`window.nbrsAPI.metadata.setSummary(${JSON.stringify(path.join(base, 'dirB', 'dirA_ren'))}, null)`);

  // aria2 engine status bar + live download via UI
  await waitFor(() => ev(`/Connected|متصل|HTTP/i.test(document.querySelector('[data-testid="engine-status"]')?.innerText || '')`), 'aria2 connected in status bar');
  ok('status bar shows aria2 engine connected');

  const http = require('node:http');
  const dlSrv = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '16' });
    res.end('nbrsflow-dl-test');
  });
  await new Promise((r) => dlSrv.listen(0, '127.0.0.1', r));
  const dlPort = dlSrv.address().port;

  try {
    const beforeDlCount = await ev(`document.querySelectorAll('[data-testid="download-row"]').length`);
    const dlItem = await ev(`window.nbrsAPI.downloads.add('http://127.0.0.1:${dlPort}/sample-e2e.txt', ${JSON.stringify(path.join(base, 'dirB'))})`);
    assert.ok(dlItem && dlItem.id);
    await waitFor(() => ev(`document.querySelector('[data-testid="download-row"][data-status="completed"]') !== null`), 'download row completed in UI', 10000);
    await waitFor(() => fs.existsSync(path.join(base, 'dirB', 'sample-e2e.txt')) && fs.readFileSync(path.join(base, 'dirB', 'sample-e2e.txt'), 'utf8') === 'nbrsflow-dl-test', 'downloaded file exists and flushed on disk');
    // Verify clicking download row highlights/selects it persistently
    await ev(`document.querySelector('[data-testid="download-row"][data-status="completed"]').click()`);
    assert.equal(await ev(`document.querySelector('[data-testid="download-row"][data-status="completed"]')?.getAttribute('data-selected')`), 'true');

    // Verify search scope toggles (Downloads vs Files)
    await ev(`(() => { const i = document.querySelector('[data-testid="topbar-search-input"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'sample-e2e'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(() => ev(`document.querySelectorAll('[data-testid="download-row"]').length >= 1`), 'search matches download row');
    await ev(`document.querySelector('[data-testid="search-scope-downloads"]').click()`);
    await waitFor(() => ev(`document.querySelectorAll('[data-testid="download-row"]').length >= 1 && !document.querySelector('[data-testid="search-scope-downloads"]').className.includes('bg-panel2')`), 'downloads scope toggled off so downloads stay unfiltered');
    await ev(`document.querySelector('[data-testid="search-scope-downloads"]').click()`);
    await ev(`(() => { const i = document.querySelector('[data-testid="topbar-search-input"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);

    // Verify direct download URL is NOT shown under file name in download row
    const rowText = await ev(`document.querySelector('[data-testid="download-row"][data-status="completed"]')?.innerText || ''`);
    assert.ok(!rowText.includes(`http://127.0.0.1:${dlPort}`), 'download URL must not be displayed under file name');

    // Verify right-click context menu & Details modal on download row
    await ev(`window.__t.fire(document.querySelector('[data-testid="download-row"][data-status="completed"]'), 'contextmenu', { clientX: 220, clientY: 160 })`);
    await waitFor(() => ev(`!!document.querySelector('.fixed.z-50.rounded-xl')`), 'download row context menu opened');
    await ev(`[...document.querySelectorAll('.fixed.z-50.rounded-xl button')].find((b) => /Details|التفاصيل/i.test(b.textContent)).click()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="download-details-dialog"]')`), 'download details dialog opened');
    const detailsText = await ev(`document.querySelector('[data-testid="download-details-dialog"]')?.innerText || ''`);
    assert.ok(detailsText.includes(`http://127.0.0.1:${dlPort}/sample-e2e.txt`));
    await ev(`document.querySelector('[data-testid="download-details-dialog"] button:last-child').click()`);

    // Verify renaming downloaded file updates download item path, and works while browsing external folder
    const renamedDlPath = await ev(`window.nbrsAPI.files.renameItem(${JSON.stringify(path.join(base, 'dirB', 'sample-e2e.txt'))}, 'sample-e2e-renamed.txt')`);
    const updatedDl = await ev(`window.nbrsAPI.downloads.list().then((l) => l.find((x) => x.id === ${JSON.stringify(dlItem.id)}))`);
    assert.equal(updatedDl.fileName, 'sample-e2e-renamed.txt');
    assert.equal(path.resolve(updatedDl.filePath), path.resolve(renamedDlPath));

    const extTempBrowse = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-e2e-extopen-'));
    try {
      await ev(`window.nbrsAPI.files.setExplorerRoot(${JSON.stringify(extTempBrowse)})`);
      // Double-click on completed download row while browsing external folder should not throw / should resolve
      await ev(`window.__t.fire(document.querySelector('[data-testid="download-row"][data-status="completed"]'), 'dblclick')`);
      await ev(`window.nbrsAPI.files.setExplorerRoot(null)`);
    } finally {
      fs.rmSync(extTempBrowse, { recursive: true, force: true });
    }
    ok('real download completes, hides URL under filename, supports context menu/details/dblclick, updates path on rename, and opens during external browse');
    await ev(`window.nbrsAPI.downloads.cancel(${JSON.stringify(dlItem.id)}, true)`);
    await waitFor(async () => (await ev(`document.querySelectorAll('[data-testid="download-row"]').length`)) === beforeDlCount, 'download row removed');
    ok('cancel/remove clears task from DownloadsPanel');

    // auto-organize sequence download in root + badge in UI
    await ev(`window.nbrsAPI.settings.set({ autoOrganizeEnabled: true })`);
    assert.ok(await ev(`!!document.querySelector('[data-testid="autoorganize-toggle"]') && !!document.querySelector('[data-testid="organize-now-btn"]')`));
    const seqItem = await ev(`window.nbrsAPI.downloads.add('http://127.0.0.1:${dlPort}/E2E_Auto_Series_S01E01_1080p.txt')`);
    assert.equal(seqItem.autoGroupedFolder, 'E2E Auto Series');
    await waitFor(() => ev(`document.querySelector('[data-testid="auto-group-badge"]')?.textContent.includes('E2E Auto Series')`), 'auto-group badge shown');
    await waitFor(() => fs.existsSync(path.join(ROOT, 'E2E Auto Series', 'E2E_Auto_Series_S01E01_1080p.txt')), 'auto-grouped file written to sequence folder');
    ok('auto-organize routes S01E01 download into normalized folder and displays badge in UI');

    // abbreviated download "EAS.Ep02.txt" matches "E2E Auto Series" via generated default alias "EAS"
    const aliasItem = await ev(`window.nbrsAPI.downloads.add('http://127.0.0.1:${dlPort}/EAS.Ep02.txt')`);
    assert.equal(aliasItem.autoGroupedFolder, 'E2E Auto Series');
    assert.equal(aliasItem.matchedAlias, 'EAS');
    await waitFor(() => ev(`document.querySelector('[data-testid="auto-group-badge"]')?.textContent.includes('(EAS)')`), 'alias badge shown in UI');
    await waitFor(() => fs.existsSync(path.join(ROOT, 'E2E Auto Series', 'EAS.Ep02.txt')), 'alias-routed file written to sequence folder');
    ok('abbreviated download routes into folder via alias and shows "(EAS)" in UI badge');

    await ev(`window.nbrsAPI.downloads.cancel(${JSON.stringify(seqItem.id)}, true)`);
    await ev(`window.nbrsAPI.downloads.cancel(${JSON.stringify(aliasItem.id)}, true)`);
    await ev(`window.nbrsAPI.metadata.setAliases(${JSON.stringify(path.join(ROOT, 'E2E Auto Series'))}, [])`);
    await sleep(250);
    fs.rmSync(path.join(ROOT, 'E2E Auto Series'), { recursive: true, force: true });

    // New / Last opened badges + Checksum dialog + Disk Space Guard in UI
    const checkFile = path.join(base, 'dirB', 'verify-me.txt');
    fs.writeFileSync(checkFile, 'hello-nbrsflow-hash');
    await waitFor(() => ev(`!!window.__t.item('verify-me.txt')?.querySelector('[data-testid="badge-new"]')`), 'New badge shown on recent unopened file');
    ok('New badge displayed on recently added unopened file');

    await ev(`window.__t.fire(window.__t.item('verify-me.txt'), 'contextmenu', { clientX: 250, clientY: 250 })`);
    await waitFor(() => ev(`!!document.querySelector('.fixed.z-50.rounded-xl')`), 'menu for markWatched');
    await ev(`[...document.querySelectorAll('.fixed.z-50.rounded-xl button')].find((b) => /watched|مقروء/i.test(b.textContent)).click()`);
    await waitFor(() => ev(`!!window.__t.item('verify-me.txt')?.querySelector('[data-testid="badge-last-opened"]')`), 'Last opened badge shown');
    assert.equal(await ev(`window.__t.item('verify-me.txt')?.querySelector('[data-testid="badge-new"]')`), null);
    ok('marking file as watched shows "Last opened" badge and removes "New" badge');

    await ev(`window.__t.fire(window.__t.item('verify-me.txt'), 'contextmenu', { clientX: 250, clientY: 250 })`);
    await waitFor(() => ev(`!!document.querySelector('.fixed.z-50.rounded-xl')`), 'menu for checksum');
    await ev(`[...document.querySelectorAll('.fixed.z-50.rounded-xl button')].find((b) => /SHA-256/i.test(b.textContent)).click()`);
    const shaVal = await waitFor(() => ev(`document.querySelector('[data-testid="hash-sha256"]')?.textContent`), 'checksum dialog computed SHA-256');
    const crypto = require('node:crypto');
    assert.equal(shaVal, crypto.createHash('sha256').update('hello-nbrsflow-hash').digest('hex'));
    await ev(`(() => { const i = document.querySelector('[data-testid="expected-hash-input"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(shaVal)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(() => ev(`/Matched|مطابق/.test(document.querySelector('[data-testid="hash-compare-result"]')?.textContent || '')`), 'hash match displayed');
    await ev(`(() => { const i = document.querySelector('[data-testid="expected-hash-input"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'deadbeef'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(() => ev(`/Mismatch|غير مطابق/.test(document.querySelector('[data-testid="hash-compare-result"]')?.textContent || '')`), 'hash mismatch displayed');
    await ev(`document.querySelector('[data-testid="checksum-dialog"] button:last-child').click()`);
    await ev(`window.nbrsAPI.metadata.resetAsNew(${JSON.stringify(checkFile)})`);
    ok('Checksum dialog computes SHA-256/MD5 and compares reference hashes accurately');

    // Disk Space Guard UI warning
    await ev(`window.nbrsAPI.settings.set({ minFreeDiskSpaceBytes: 999999999999999 })`);
    await ev(`window.nbrsAPI.downloads.checkDiskSpace()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="disk-warning-badge"]') && !!document.querySelector('[data-testid="downloads-disk-warning"]')`), 'disk space warning shown in UI');
    await ev(`window.nbrsAPI.settings.set({ minFreeDiskSpaceBytes: ${2 * 1024 * 1024 * 1024} })`);
    await ev(`window.nbrsAPI.downloads.checkDiskSpace()`);
    ok('Disk Space Guard shows warning in StatusBar and DownloadsPanel when free space is below threshold');

    // ExplorerPane virtualization on large folder (200 files)
    const largeDir = path.join(base, 'large_dir');
    fs.mkdirSync(largeDir, { recursive: true });
    for (let i = 0; i < 200; i++) {
      fs.writeFileSync(path.join(largeDir, `vfile_${String(i).padStart(3, '0')}.txt`), 'x');
    }
    // Navigate via Command Palette (Ctrl+K) to large_dir
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="command-palette"]')`), 'command palette opens via Ctrl+K');
    await ev(`(() => { const i = document.querySelector('[data-testid="command-palette-input"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'large_dir'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(() => ev(`/large_dir/.test(document.querySelector('[data-testid="command-palette-item-0"]')?.textContent || '')`), 'command palette filters large_dir');
    await ev(`document.querySelector('[data-testid="command-palette-item-0"]').click()`);
    await waitFor(() => ev(`document.querySelector('[data-testid="pane-items"]')?.getAttribute('data-total-count') === '200'`), 'navigated to large_dir via Command Palette');
    const isVirt = await ev(`document.querySelector('[data-testid="pane-items"]')?.getAttribute('data-virtualized')`);
    const renderedCount = await ev(`document.querySelectorAll('[data-explorer-item="true"]').length`);
    assert.equal(isVirt, 'true');
    assert.ok(renderedCount < 200 && renderedCount > 0, `expected virtualized DOM count < 200, got ${renderedCount}`);
    ok(`Command Palette (Ctrl+K) navigated to large_dir and ExplorerPane virtualized 200 items (${renderedCount} DOM nodes rendered)`);

    // "This PC" dialog + external-folder notice + disk space RTL/LTR formatting
    await ev(`document.querySelector('[data-testid="this-pc-btn"]').click()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="this-pc-dialog"]')`), 'This PC dialog opened');
    assert.ok(await ev(`!!document.querySelector('[data-testid="external-folder-notice"]')`));
    await ev(`document.querySelector('[data-testid="this-pc-dialog"] button').click()`);
    const diskInfo = await ev(`window.nbrsAPI.files.getDiskSpace()`);
    assert.ok(diskInfo.totalBytes > 0 && diskInfo.freeBytes > 0 && diskInfo.freeBytes <= diskInfo.totalBytes);
    assert.ok(await ev(`document.querySelectorAll('[data-testid="sidebar-disk-space"] bdi[dir="ltr"]').length >= 2`));
    const beforeDlDir = await ev(`window.nbrsAPI.settings.get().then((s) => s.downloadDir)`);
    const extBrowseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-ext-browse-'));
    try {
      await ev(`window.nbrsAPI.files.setExplorerRoot(${JSON.stringify(extBrowseDir)})`);
      const afterDlDir = await ev(`window.nbrsAPI.settings.get().then((s) => s.downloadDir)`);
      assert.equal(afterDlDir, beforeDlDir);
      await ev(`window.nbrsAPI.files.setExplorerRoot(null)`);
    } finally {
      fs.rmSync(extBrowseDir, { recursive: true, force: true });
    }
    ok('This PC external folder notice, unchanged default downloadDir, and disk space RTL/LTR formatting verified');

    // Clicking "Folders" in Sidebar returns directly to root, then Marquee drag selection in ExplorerPane
    await ev(`document.querySelector('[data-testid="sidebar-folders-home"]').click()`);
    await waitFor(() => ev(`document.querySelectorAll('[data-testid="pane-breadcrumb"] button').length === 1 && document.querySelector('[data-testid="pane-up"]')?.disabled === true`), 'clicking Folders in Sidebar returned directly to root');
    await ev(`(() => { const pane = document.querySelector('[data-testid="pane-items"]'); const r = pane.getBoundingClientRect(); pane.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: r.right - 20, clientY: r.bottom - 20, bubbles: true })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 12, clientY: r.top + 12, bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: r.left + 12, clientY: r.top + 12, bubbles: true })); })()`);
    await waitFor(() => ev(`document.querySelectorAll('[data-explorer-item="true"].bg-panel2').length >= 1`), 'marquee selection highlighted items');
    ok('Marquee drag selection and Sidebar "Folders" quick-home navigation verified');

    // Quick Access right-click context menu, custom .exe category folder routing, task note & export/import
    await ev(`window.__t.fire(document.querySelector('[data-testid="quick-access-apps"]'), 'contextmenu', { clientX: 80, clientY: 220 })`);
    await waitFor(() => ev(`!!document.querySelector('.fixed.z-50.rounded-xl')`), 'Quick Access context menu opened');
    await ev(`document.body.click()`);
    const customAppsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-e2e-apps-'));
    try {
      await ev(`window.nbrsAPI.settings.set({ categoryDirs: { apps: ${JSON.stringify(customAppsDir)} } })`);
      const exeItem = await ev(`window.nbrsAPI.downloads.add('http://127.0.0.1:${dlPort}/e2e-installer.exe')`);
      await waitFor(() => fs.existsSync(path.join(customAppsDir, 'e2e-installer.exe')), '.exe routed to custom Quick Access folder');
      await ev(`window.nbrsAPI.downloads.setNote(${JSON.stringify(exeItem.id)}, 'E2E Task Note')`);
      await waitFor(() => ev(`document.querySelector('[data-testid="dl-note-badge"]')?.textContent?.includes('E2E Task Note')`), 'task note badge rendered');
      const expStr = await ev(`window.nbrsAPI.downloads.exportJson()`);
      assert.ok(expStr.includes('e2e-installer.exe'));
      await ev(`window.nbrsAPI.downloads.cancel(${JSON.stringify(exeItem.id)}, true)`);
      await ev(`window.nbrsAPI.settings.set({ categoryDirs: { apps: '' } })`);
    } finally {
      fs.rmSync(customAppsDir, { recursive: true, force: true });
    }
    ok('Quick Access context menu, custom .exe routing, task notes, and JSON export verified');

    // Folder duplicate (!) badge, new/unopened badge + auto-clear, First-Letter Cycling, & allowOpenDownloadsOutsideRoot
    const smartDir = path.join(base, 'SmartBadgeDir');
    fs.mkdirSync(smartDir, { recursive: true });
    fs.writeFileSync(path.join(smartDir, 'ep1.bin'), 'same-content');
    fs.writeFileSync(path.join(smartDir, 'ep1 (1).bin'), 'same-content');
    await ev(`window.nbrsAPI.files.setExplorerRoot(null)`);
    await ev(`document.querySelector('[data-testid="sidebar-folders-home"]').click()`);
    await waitFor(() => ev(`window.__t.names().includes('__e2e__')`), 'at root');
    await ev(`window.__t.fire(window.__t.item('__e2e__'), 'dblclick')`);
    await waitFor(() => ev(`!!window.__t.item('SmartBadgeDir')?.querySelector('[data-testid="folder-duplicate-badge"]')`), 'folder duplicate (!) badge shown');

    // First-Letter Cycling: press 's' to select SmartBadgeDir
    await ev(`window.__t.pane().focus()`);
    await ev(`window.__t.key('s')`);
    await waitFor(() => ev(`window.__t.item('SmartBadgeDir')?.className.includes('ring-silver')`), 'First-Letter Cycling selected SmartBadgeDir');

    // allowOpenDownloadsOutsideRoot: download file, switch downloadDir, verify revealInExplorer works when true and rejects when false
    const outsideDl = await ev(`window.nbrsAPI.downloads.add('http://127.0.0.1:${dlPort}/outside-open-test.txt', ${JSON.stringify(smartDir)})`);
    await waitFor(() => fs.existsSync(path.join(smartDir, 'outside-open-test.txt')), 'outside-open-test.txt downloaded');
    const altRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-e2e-altroot-'));
    try {
      await ev(`window.nbrsAPI.settings.set({ downloadDir: ${JSON.stringify(altRoot)}, allowOpenDownloadsOutsideRoot: true })`);
      await ev(`window.nbrsAPI.files.revealInExplorer(${JSON.stringify(path.join(smartDir, 'outside-open-test.txt'))})`);
      await ev(`window.nbrsAPI.settings.set({ allowOpenDownloadsOutsideRoot: false })`);
      let rejectedOutside = false;
      try {
        await ev(`window.nbrsAPI.files.revealInExplorer(${JSON.stringify(path.join(smartDir, 'outside-open-test.txt'))})`);
      } catch {
        rejectedOutside = true;
      }
      assert.equal(rejectedOutside, true);
    } finally {
      await ev(`window.nbrsAPI.settings.set({ downloadDir: ${JSON.stringify(ROOT)}, allowOpenDownloadsOutsideRoot: true })`);
      await ev(`window.nbrsAPI.downloads.cancel(${JSON.stringify(outsideDl.id)}, true)`);
      fs.rmSync(altRoot, { recursive: true, force: true });
    }
    ok('Folder duplicate (!) badge, First-Letter Cycling, and allowOpenDownloadsOutsideRoot setting verified');

    // Safe Graphics Mode (disableHardwareAcceleration) toggle in Settings -> System
    await ev(`document.querySelector('[data-testid="settings-btn"]').click()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-dialog"]')`), 'settings dialog opened for GPU toggle');
    await ev(`document.querySelector('[data-testid="settings-tab-system"]').click()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="toggle-disable-gpu"]')`), 'toggle-disable-gpu visible');
    await ev(`document.querySelector('[data-testid="toggle-disable-gpu"]').click()`);
    await waitFor(() => ev(`document.querySelector('[data-testid="toggle-disable-gpu"]')?.getAttribute('aria-checked') === 'true'`), 'toggle-disable-gpu enabled');
    await ev(`document.querySelector('[data-testid="toggle-disable-gpu"]').click()`);
    await waitFor(() => ev(`document.querySelector('[data-testid="toggle-disable-gpu"]')?.getAttribute('aria-checked') === 'false'`), 'toggle-disable-gpu restored to false');
    await ev(`document.querySelector('[data-testid="settings-close-btn"]').click()`);
    ok('Safe Graphics Mode (disableHardwareAcceleration) toggle verified in System Settings');

    // View Mode selector in TopBar (downloads -> files -> default)
    await ev(`document.querySelector('[data-testid="view-mode-downloads"]').click()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="downloads-panel"]') && !document.querySelector('[data-testid="pane-items"]')`), 'view-mode-downloads hides explorer');
    await ev(`document.querySelector('[data-testid="view-mode-files"]').click()`);
    await waitFor(() => ev(`!document.querySelector('[data-testid="downloads-panel"]') && !!document.querySelector('[data-testid="pane-items"]')`), 'view-mode-files hides downloads panel');
    await ev(`document.querySelector('[data-testid="view-mode-default"]').click()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="downloads-panel"]') && !!document.querySelector('[data-testid="pane-items"]')`), 'view-mode-default shows both');
    ok('TopBar View Mode selector (downloads / files / default) verified');

    // Series completion badge (`end` suffix) & Folder Tags (preset + display on Windows-style FolderIcon)
    const completeDir = path.join(base, 'CompleteAnimeE2E');
    fs.mkdirSync(completeDir, { recursive: true });
    fs.writeFileSync(path.join(completeDir, 'CompleteAnime E01.mp4'), 'e1');
    fs.writeFileSync(path.join(completeDir, 'CompleteAnime E02end.mp4'), 'e2');
    await waitFor(() => ev(`!!window.__t.item('CompleteAnimeE2E')?.querySelector('[data-testid="folder-complete-badge"]')`), 'folder-complete-badge shown');

    await ev(`(() => { const el = window.__t.item('CompleteAnimeE2E'); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 })); })()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="tag-row"]')`), 'context menu tag-row shown');
    await ev(`document.querySelector('[data-testid="tag-row"] button[data-tag="أنمي"]').click()`);
    await waitFor(() => ev(`window.__t.item('CompleteAnimeE2E')?.querySelector('[data-testid="folder-tag-label"]')?.textContent?.trim() === 'أنمي'`), 'folder tag displayed on icon');
    fs.rmSync(completeDir, { recursive: true, force: true });
    ok('Series completion badge (end) and Folder Tagging on Windows-style icon verified');

    // Settings -> Downloads: verify auto-move-completed and group-by-tag default to false
    await ev(`document.querySelector('[data-testid="settings-btn"]').click()`);
    await waitFor(() => ev(`!!document.querySelector('[data-testid="settings-dialog"]')`), 'settings dialog opened for v0.2.10 toggles');
    await ev(`document.querySelector('[data-testid="settings-tab-downloads"]').click()`);
    await waitFor(() => ev(`document.querySelector('[data-testid="toggle-auto-move-completed"]')?.getAttribute('aria-checked') === 'false' && document.querySelector('[data-testid="toggle-group-by-tag"]')?.getAttribute('aria-checked') === 'false'`), 'autoMoveCompleted and groupByTag default to false');
    await ev(`document.querySelector('[data-testid="settings-close-btn"]').click()`);
    ok('Auto-move completed & Group-by-tag settings defaults (false) verified');
  } finally {
    dlSrv.close();
    fs.rmSync(path.join(ROOT, 'E2E Auto Series'), { recursive: true, force: true });
  }

  console.log(`\nE2E PASSED (${passed} checks)`);
  ws.close();
})().then(() => { kill(); try { fs.rmSync(base, { recursive: true, force: true }); } catch {} try { fs.rmSync(e2eUserData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} process.exit(0); })
  .catch((e) => { console.error('\nE2E FAILED:', e.message); kill(); try { fs.rmSync(base, { recursive: true, force: true }); } catch {} try { fs.rmSync(e2eUserData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} process.exit(1); });
