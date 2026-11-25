// Automated test suite for electron/aria2Manager.ts (both real aria2c.exe daemon + fallback engine + persistence + hooks).
// Usage: npm run test:aria2
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  Aria2Manager,
  classifyFileCategory,
  findAria2Binary,
  inspectCompletedFile,
  isWithinScheduleWindow,
  resolveDownloadTargetDir,
  setDownloadTargetDirResolver
} = require('../dist-electron/electron/aria2Manager.js');
const { extractDirectDownloadUrl, ClipboardMonitor } = require('../dist-electron/electron/clipboardWatcher.js');

const ROOT = 'D:\\Ai\\antigravity\\nbrsflow_downloads_test';
const scratch = path.join(ROOT, '__aria2_selftest__');
const tmpStore1 = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-aria2-1-'));
const tmpStore2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-aria2-2-'));
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

// Local HTTP test server supporting fast downloads and throttled Range-capable downloads
function startTestServer() {
  const payload = Buffer.alloc(120 * 1024, 'A'); // 120 KB
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const slow = u.searchParams.get('slow') === '1';
    const range = req.headers.range;
    let start = 0;
    if (range && /^bytes=(\d+)-/.test(range)) {
      start = Number(RegExp.$1);
    }
    const slice = payload.subarray(start);
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(slice.length)
    };
    if (start > 0) {
      headers['Content-Range'] = `bytes ${start}-${payload.length - 1}/${payload.length}`;
      res.writeHead(206, headers);
    } else {
      res.writeHead(200, headers);
    }

    if (!slow) {
      res.end(slice);
      return;
    }

    // Stream in chunks every 60ms so pause/resume can be exercised
    let offset = 0;
    const step = 8 * 1024;
    const timer = setInterval(() => {
      if (res.destroyed) { clearInterval(timer); return; }
      const next = slice.subarray(offset, offset + step);
      offset += next.length;
      if (next.length > 0) res.write(next);
      if (offset >= slice.length) {
        clearInterval(timer);
        res.end();
      }
    }, 60);
    req.on('close', () => clearInterval(timer));
  });

  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      resolve({
        server: srv,
        port: srv.address().port,
        payloadSize: payload.length
      });
    });
  });
}

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });

  const { server, port, payloadSize } = await startTestServer();
  let mgr1 = null;
  let mgr2 = null;

  try {
    // 1. Binary discovery
    const bin = findAria2Binary();
    assert.ok(bin && fs.existsSync(bin), 'aria2c.exe binary exists in resources/bin/win32');
    ok(`findAria2Binary located: ${path.basename(bin)}`);

    // 2. resolveDownloadTargetDir hook & path safety
    const subDir = await resolveDownloadTargetDir({
      url: 'http://127.0.0.1/ep01.mkv',
      fileName: 'ep01.mkv',
      requestedDir: path.join(scratch, 'sub1'),
      rootDir: ROOT
    });
    assert.ok(fs.existsSync(subDir));
    ok('resolveDownloadTargetDir creates and validates subfolder inside rootDir');

    await assert.rejects(
      () => resolveDownloadTargetDir({
        url: 'http://127.0.0.1/x.bin',
        fileName: 'x.bin',
        requestedDir: 'C:\\Windows',
        rootDir: ROOT
      }),
      /outside/
    );
    ok('resolveDownloadTargetDir rejects paths outside rootDir');

    setDownloadTargetDirResolver(({ requestedDir }) => path.join(requestedDir, 'auto_grouped'));
    const hookedDir = await resolveDownloadTargetDir({
      url: 'http://127.0.0.1/S01E01.mkv',
      fileName: 'S01E01.mkv',
      requestedDir: scratch,
      rootDir: ROOT
    });
    assert.equal(path.basename(hookedDir), 'auto_grouped');
    setDownloadTargetDirResolver(null);
    ok('setDownloadTargetDirResolver hook routes downloads into sequence subfolder');

    // 3. Real aria2c.exe engine test
    mgr1 = new Aria2Manager({
      storageDir: tmpStore1,
      getRootDir: () => ROOT
    });
    const st1 = await mgr1.start();
    assert.equal(st1.mode, 'aria2');
    assert.equal(st1.connected, true);
    assert.ok(st1.version && st1.port > 0);
    ok(`Aria2Manager connected to real aria2c.exe (v${st1.version} on port ${st1.port})`);

    // Fast download via aria2c.exe
    const dl1 = await mgr1.addDownload(`http://127.0.0.1:${port}/fast-aria2.bin`, scratch);
    await waitFor(() => {
      const it = mgr1.listDownloads().find((x) => x.id === dl1.id);
      return it && it.status === 'completed';
    }, 'aria2 fast download completes');
    const done1 = mgr1.listDownloads().find((x) => x.id === dl1.id);
    assert.equal(done1.totalBytes, payloadSize);
    assert.equal(fs.statSync(done1.filePath).size, payloadSize);
    ok('real aria2c.exe downloaded file to target folder and verified size on disk');

    // Slow download: test pause -> resume -> complete
    const dlSlow = await mgr1.addDownload(`http://127.0.0.1:${port}/slow-aria2.bin?slow=1`, scratch);
    await waitFor(() => {
      const it = mgr1.listDownloads().find((x) => x.id === dlSlow.id);
      return it && it.completedBytes > 0;
    }, 'aria2 slow download receives initial bytes');
    const paused = await mgr1.pauseDownload(dlSlow.id);
    assert.equal(paused.status, 'paused');
    ok('pauseDownload pauses active aria2 task');

    const resumed = await mgr1.resumeDownload(dlSlow.id);
    assert.equal(resumed.status, 'active');
    await waitFor(() => {
      const it = mgr1.listDownloads().find((x) => x.id === dlSlow.id);
      return it && it.status === 'completed';
    }, 'aria2 resumed download completes');
    ok('resumeDownload resumes and completes aria2 task');

    // Global options (unrestricted defaults + custom concurrent downloads & speed limit) via aria2.changeGlobalOption
    const initOpts = await mgr1.getAria2GlobalOptions();
    assert.equal(initOpts['max-concurrent-downloads'], '99');
    assert.equal(initOpts['max-overall-download-limit'], '0');
    await mgr1.setGlobalOptions({ maxConcurrentDownloads: 3, maxDownloadSpeedKbps: 512 });
    const gOpts = await mgr1.getAria2GlobalOptions();
    assert.equal(gOpts['max-concurrent-downloads'], '3');
    assert.equal(gOpts['max-overall-download-limit'], '524288');
    await mgr1.setGlobalOptions({ maxConcurrentDownloads: 0, maxDownloadSpeedKbps: 0 });
    ok('setGlobalOptions uses unrestricted defaults (0/99) and applies custom limits in aria2');

    await mgr1.stop();

    // Verify history persistence across restart
    const mgrReloaded = new Aria2Manager({
      storageDir: tmpStore1,
      getRootDir: () => ROOT,
      forceFallback: true
    });
    assert.equal(mgrReloaded.listDownloads().length, 2);
    ok('download history persisted in downloads.json and reloaded across restart');

    // Cancel/remove
    await mgrReloaded.cancelDownload(dl1.id, true);
    assert.equal(mgrReloaded.listDownloads().length, 1);
    ok('cancelDownload removes task from list and storage');

    // 4. Fallback engine test (forceFallback: true)
    mgr2 = new Aria2Manager({
      storageDir: tmpStore2,
      getRootDir: () => ROOT,
      forceFallback: true
    });
    const st2 = await mgr2.start();
    assert.equal(st2.mode, 'fallback');
    assert.equal(st2.connected, true);
    ok('Fallback IAria2Engine starts cleanly when aria2c.exe is bypassed');

    const fbDl = await mgr2.addDownload(`http://127.0.0.1:${port}/fb-file.bin?slow=1`, scratch);
    await waitFor(() => {
      const it = mgr2.listDownloads().find((x) => x.id === fbDl.id);
      return it && it.completedBytes >= 8192;
    }, 'fallback receives partial bytes');
    await mgr2.pauseDownload(fbDl.id);
    assert.equal(mgr2.listDownloads()[0].status, 'paused');
    await mgr2.resumeDownload(fbDl.id);
    await waitFor(() => {
      const it = mgr2.listDownloads().find((x) => x.id === fbDl.id);
      return it && it.status === 'completed';
    }, 'fallback resumed download completes');
    assert.equal(fs.statSync(mgr2.listDownloads()[0].filePath).size, payloadSize);
    ok('Fallback engine supports pause, HTTP Range resume, and full download completion');

    await mgr2.stop();

    // 5. Disk Space Guard test
    const warnings = [];
    const mgrDisk = new Aria2Manager({
      storageDir: tmpStore2,
      getRootDir: () => ROOT,
      forceFallback: true,
      getMinFreeDiskBytes: () => Number.MAX_SAFE_INTEGER,
      onDiskWarning: (w) => warnings.push(w)
    });
    const wLow = await mgrDisk.checkDiskSpace(undefined, 'big.iso');
    assert.equal(wLow.lowSpace, true);
    assert.equal(wLow.insufficientForFile, false);
    const wInsuf = await mgrDisk.checkDiskSpace(Number.MAX_SAFE_INTEGER, 'huge.iso');
    assert.equal(wInsuf.insufficientForFile, true);
    assert.equal(warnings.length, 2);
    ok('Disk Space Guard detects low free space and insufficient space for expected file size');

    // 6. Clipboard watcher unit checks
    assert.equal(extractDirectDownloadUrl('not a url'), null);
    assert.equal(extractDirectDownloadUrl('https://example.com/page.html'), null);
    const hit = extractDirectDownloadUrl('  https://cdn.example.com/files/archive_01.zip  ');
    assert.deepEqual(hit, { url: 'https://cdn.example.com/files/archive_01.zip', fileName: 'archive_01.zip' });

    let clipText = 'https://cdn.example.com/initial.mp4'; // pre-existing before start
    let enabled = true;
    const detected = [];
    const mon = new ClipboardMonitor(() => clipText, () => enabled, (h) => detected.push(h), 10000);
    await mon.start();
    assert.equal(await mon.pollOnce(), null); // ignores pre-existing clipboard text
    clipText = 'https://cdn.example.com/new_ep01.mkv';
    await mon.pollOnce();
    assert.equal(detected.length, 1);
    await mon.pollOnce(); // duplicate ignored
    assert.equal(detected.length, 1);
    enabled = false;
    clipText = 'https://cdn.example.com/disabled.zip';
    assert.equal(await mon.pollOnce(), null); // respects toggle off
    mon.stop();
    ok('ClipboardMonitor detects new direct URLs, ignores pre-existing/duplicates, and respects toggle');

    // 7. Suspiciously small / HTML error page detection on completion
    const tinyZip = path.join(scratch, 'tiny.zip');
    fs.writeFileSync(tinyZip, Buffer.alloc(1024, 'x'));
    const warnSmall = await inspectCompletedFile(tinyZip, 'tiny.zip');
    assert.equal(warnSmall.warningCode, 'small_file');

    const fakeMp4 = path.join(scratch, 'fake.mp4');
    fs.writeFileSync(fakeMp4, '<!DOCTYPE html><html><body>403 Forbidden</body></html>', 'utf8');
    const warnHtml = await inspectCompletedFile(fakeMp4, 'fake.mp4');
    assert.equal(warnHtml.warningCode, 'html_error_page');

    const realHtml = path.join(scratch, 'page.html');
    fs.writeFileSync(realHtml, '<!DOCTYPE html><html><body>OK</body></html>', 'utf8');
    const warnRealHtml = await inspectCompletedFile(realHtml, 'page.html');
    assert.equal(warnRealHtml.warningCode, undefined);
    ok('inspectCompletedFile flags small binary/archive files and HTML error pages without false-positiving on .html');

    // End-to-end suspicious HTML download via fallback engine
    const htmlSrv = http.createServer((_req, res) => {
      const body = '<!DOCTYPE html><html><body>Link expired</body></html>';
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': String(Buffer.byteLength(body)) });
      res.end(body);
    });
    await new Promise((r) => htmlSrv.listen(0, '127.0.0.1', r));
    const htmlPort = htmlSrv.address().port;
    const mgrWarn = new Aria2Manager({ storageDir: tmpStore2, getRootDir: () => ROOT, forceFallback: true });
    await mgrWarn.start();
    const warnDl = await mgrWarn.addDownload(`http://127.0.0.1:${htmlPort}/episode.mkv`, scratch);
    await waitFor(() => {
      const it = mgrWarn.listDownloads().find((x) => x.id === warnDl.id);
      return it && it.status === 'completed' && it.warningCode;
    }, 'suspicious HTML download flagged');
    const flagged = mgrWarn.listDownloads().find((x) => x.id === warnDl.id);
    assert.equal(flagged.warningCode, 'html_error_page');
    await mgrWarn.stop();
    htmlSrv.close();
    ok('Aria2Manager flags completed non-HTML download containing HTML error page');

    // 8. Duplicate check & Refresh URL
    const mgrDup = new Aria2Manager({ storageDir: tmpStore2, getRootDir: () => ROOT, forceFallback: true });
    await mgrDup.start();
    fs.writeFileSync(path.join(scratch, 'existing-dup.bin'), 'dup');
    const dupCheck1 = mgrDup.checkDuplicate(`http://127.0.0.1:${port}/existing-dup.bin`, scratch);
    assert.equal(dupCheck1.existsOnDisk, true);
    const dlPaused = await mgrDup.addDownload(`http://127.0.0.1:${port}/slow-aria2.bin?slow=1`, scratch, 'refresh-test.bin');
    await mgrDup.pauseDownload(dlPaused.id);
    const refreshed = await mgrDup.refreshDownloadUrl(dlPaused.id, `http://127.0.0.1:${port}/fast-aria2.bin`);
    assert.equal(refreshed.url, `http://127.0.0.1:${port}/fast-aria2.bin`);
    await waitFor(() => {
      const it = mgrDup.listDownloads().find((x) => x.id === dlPaused.id);
      return it && it.status === 'completed';
    }, 'refreshed URL download completes');
    await mgrDup.stop();
    ok('checkDuplicate detects existing files and refreshDownloadUrl resumes from new URL');

    // 9. checkDuplicate in auto-organized subfolder & completed history
    const orgSub = path.join(ROOT, '__aria2_org_sub__');
    fs.mkdirSync(orgSub, { recursive: true });
    try {
      const orgFile = path.join(orgSub, 'OrganizedEp01.bin');
      fs.writeFileSync(orgFile, 'organized');
      const dupSub = mgrDup.checkDuplicate(`http://127.0.0.1:${port}/OrganizedEp01.bin`);
      assert.equal(dupSub.existsOnDisk, true);
      assert.equal(path.resolve(dupSub.existingPath), path.resolve(orgFile));
      const dupCompleted = mgrDup.checkDuplicate(`http://mirror.example.com/refresh-test.bin`, scratch, 'refresh-test.bin');
      assert.equal(dupCompleted.existsInHistory, true);
      assert.equal(dupCompleted.existsOnDisk, true);
      ok('checkDuplicate detects files in auto-organized subfolders and completed history');
    } finally {
      fs.rmSync(orgSub, { recursive: true, force: true });
    }

    // 10. Real aria2c.exe crash -> auto-restart -> task re-attachment & completion
    const tmpCrash = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-aria2-crash-'));
    const mgrCrash = new Aria2Manager({ storageDir: tmpCrash, getRootDir: () => ROOT });
    try {
      const stCrash = await mgrCrash.start();
      assert.equal(stCrash.mode, 'aria2');
      const crashDl = await mgrCrash.addDownload(`http://127.0.0.1:${port}/crash-recover.bin?slow=1`, scratch);
      await waitFor(() => {
        const it = mgrCrash.listDownloads().find((x) => x.id === crashDl.id);
        return it && it.status === 'active' && it.gid;
      }, 'crash test download becomes active');
      const oldGid = mgrCrash.listDownloads().find((x) => x.id === crashDl.id).gid;
      const oldPort = mgrCrash.getState().port;

      // Simulate unexpected aria2c crash
      mgrCrash.proc.kill('SIGKILL');
      await waitFor(() => {
        const stNow = mgrCrash.getState();
        const it = mgrCrash.listDownloads().find((x) => x.id === crashDl.id);
        return stNow.connected && stNow.port !== oldPort && it && it.gid && it.gid !== oldGid;
      }, 'aria2c auto-restarts and re-attaches active task with new gid', 15000);
      await waitFor(() => {
        const it = mgrCrash.listDownloads().find((x) => x.id === crashDl.id);
        return it && it.status === 'completed';
      }, 'recovered download completes after aria2c restart', 15000);
      assert.equal(fs.statSync(path.join(scratch, 'crash-recover.bin')).size, payloadSize);
      ok('Aria2Manager auto-restarts after aria2c crash and recovers active task to completion');
    } finally {
      await mgrCrash.stop();
      fs.rmSync(tmpCrash, { recursive: true, force: true });
    }

    // 11. Completed download history cap (maxCompletedHistory)
    const tmpCap = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-aria2-cap-'));
    const mgrCap = new Aria2Manager({
      storageDir: tmpCap,
      getRootDir: () => ROOT,
      forceFallback: true,
      maxCompletedHistory: 3
    });
    try {
      await mgrCap.start();
      for (let i = 1; i <= 5; i++) {
        const d = await mgrCap.addDownload(`http://127.0.0.1:${port}/cap-${i}.bin`, scratch);
        await waitFor(() => {
          const it = mgrCap.listDownloads().find((x) => x.id === d.id);
          return it && it.status === 'completed';
        }, `cap download ${i} completes`);
      }
      const remainingCompleted = mgrCap.listDownloads().filter((x) => x.status === 'completed');
      assert.equal(remainingCompleted.length, 3);
      ok('Aria2Manager caps completed download history to prevent unbounded bloat');

      // 12. relocateCompletedItem for both single file and parent folder move/rename
      const firstItem = remainingCompleted[0];
      const origFolder = path.dirname(firstItem.filePath);
      const renamedFolder = path.join(ROOT, '__aria2_relocated_dir__');
      mgrCap.relocateCompletedItem(origFolder, renamedFolder);
      const afterFolderMove = mgrCap.listDownloads().find((x) => x.id === firstItem.id);
      assert.equal(path.resolve(afterFolderMove.filePath), path.resolve(path.join(renamedFolder, firstItem.fileName)));
      assert.equal(path.resolve(afterFolderMove.destination), path.resolve(renamedFolder));
      assert.equal(afterFolderMove.autoGroupedFolder, '__aria2_relocated_dir__');
      ok('relocateCompletedItem updates download paths when a parent folder is moved or renamed');

      // 13. Category routing (.exe -> custom apps folder), task notes, export/import JSON, and schedule window helper
      assert.equal(classifyFileCategory('installer.exe'), 'apps');
      assert.equal(classifyFileCategory('movie.mkv'), 'video');
      assert.equal(isWithinScheduleWindow(new Date(2026, 0, 1, 2, 30), '01:00', '07:00'), true);
      assert.equal(isWithinScheduleWindow(new Date(2026, 0, 1, 10, 0), '01:00', '07:00'), false);
      assert.equal(isWithinScheduleWindow(new Date(2026, 0, 1, 23, 30), '23:00', '06:00'), true);

      const customExeDir = path.join(ROOT, '__aria2_custom_exe__');
      const mgrCat = new Aria2Manager({
        storageDir: tmpCap,
        getRootDir: () => ROOT,
        forceFallback: true,
        getCategoryDir: (name) => (classifyFileCategory(name) === 'apps' ? customExeDir : undefined)
      });
      await mgrCat.start();
      const exeDl = await mgrCat.addDownload(`http://127.0.0.1:${port}/app-setup.exe`);
      await waitFor(() => {
        const it = mgrCat.listDownloads().find((x) => x.id === exeDl.id);
        return it && it.status === 'completed';
      }, 'custom category .exe download completes');
      assert.equal(path.resolve(path.dirname(exeDl.filePath)), path.resolve(customExeDir));
      assert.ok(fs.existsSync(path.join(customExeDir, 'app-setup.exe')));
      const noted = mgrCat.setTaskNote(exeDl.id, 'Important installer');
      assert.equal(noted.note, 'Important installer');
      const exportedJson = mgrCat.exportDownloads();
      const mgrImp = new Aria2Manager({ storageDir: fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-imp-')), getRootDir: () => ROOT, forceFallback: true });
      const impCount = mgrImp.importDownloads(exportedJson);
      assert.ok(impCount >= 1);
      await mgrCat.stop();
      fs.rmSync(customExeDir, { recursive: true, force: true });
      ok('Category routing (.exe), task notes, export/import JSON, and schedule window helper work');

      // 14. Multi-type downloads + pause/app-restart resume via .aria2 & continue=true
      const tmpRestart = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-aria2-restart-'));
      const mgrA = new Aria2Manager({ storageDir: tmpRestart, getRootDir: () => ROOT });
      await mgrA.start();
      for (const extName of ['video.mp4', 'audio.mp3', 'doc.pdf', 'pack.zip', 'tool.exe']) {
        const d = await mgrA.addDownload(`http://127.0.0.1:${port}/${extName}`, scratch);
        await waitFor(() => {
          const it = mgrA.listDownloads().find((x) => x.id === d.id);
          return it && it.status === 'completed';
        }, `multi-type download ${extName} completes`);
        assert.equal(fs.statSync(path.join(scratch, extName)).size, payloadSize);
      }
      const partDl = await mgrA.addDownload(`http://127.0.0.1:${port}/resume-across-restart.mkv?slow=1`, scratch);
      await waitFor(() => {
        const it = mgrA.listDownloads().find((x) => x.id === partDl.id);
        return it && it.completedBytes > 0;
      }, 'slow task receives partial bytes before app restart');
      await mgrA.pauseDownload(partDl.id);
      await mgrA.stop();

      const mgrB = new Aria2Manager({ storageDir: tmpRestart, getRootDir: () => ROOT });
      await mgrB.start();
      const loadedPart = mgrB.listDownloads().find((x) => x.id === partDl.id);
      assert.equal(loadedPart.status, 'paused');
      await mgrB.resumeDownload(partDl.id);
      await waitFor(() => {
        const it = mgrB.listDownloads().find((x) => x.id === partDl.id);
        return it && it.status === 'completed';
      }, 'task resumed across app restart completes');
      assert.equal(fs.statSync(path.join(scratch, 'resume-across-restart.mkv')).size, payloadSize);
      await mgrB.stop();
      fs.rmSync(tmpRestart, { recursive: true, force: true });
      ok('Multi-type downloads and resume across app restart (via .aria2 & continue=true) verified');
    } finally {
      await mgrCap.stop();
      fs.rmSync(tmpCap, { recursive: true, force: true });
    }

    console.log(`\nALL PASSED (${passed} checks)`);
  } finally {
    try { await mgr1?.stop(); } catch { /* ignore */ }
    try { await mgr2?.stop(); } catch { /* ignore */ }
    server.close();
    await sleep(250);
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(tmpStore1, { recursive: true, force: true });
    fs.rmSync(tmpStore2, { recursive: true, force: true });
    console.log('cleanup done:', !fs.existsSync(scratch));
  }
})().catch((e) => {
  console.error('\nFAILED:', e);
  process.exit(1);
});
