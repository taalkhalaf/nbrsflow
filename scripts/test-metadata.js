// Automated checks for the metadata store (relative keys, rename/move sync) and auto-color rule.
// Usage: npm run test:meta   (compiles electron/ first)
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { MetadataStore } = require('../dist-electron/electron/storage/metadataStore.js');
const { suggestFolderColor } = require('../dist-electron/electron/autoColor.js');
const {
  clearStaleCachesOnVersionChange,
  shouldDisableHardwareAcceleration,
  markGpuCrash,
  clearGpuCrashFlag,
  buildRecoveryDataUrl
} = require('../dist-electron/electron/windowRecovery.js');
const { AppUpdater, compareSemver, parseGithubRelease } = require('../dist-electron/electron/appUpdater.js');

const ROOT = 'D:\\Ai\\antigravity\\nbrsflow_downloads_test';
const defaults = { language: 'ar', downloadDir: ROOT, autoColor: false };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-meta-'));
const scratch = path.join(ROOT, '__meta_selftest__');
let passed = 0;
const ok = (n) => { passed++; console.log('  ok -', n); };

(async () => {
  try {
    let s = new MetadataStore(tmp, defaults);
    const A = path.join(ROOT, 'Series');
    const F = path.join(A, 'ep1.mkv');

    // save + read back
    s.setColor(A, 'blue');
    s.setSummary(A, '  ملخص عربي\nسطر ثانٍ — English line 2  ');
    let m = s.get(A);
    assert.equal(m.color, 'blue');
    assert.equal(m.summary, 'ملخص عربي\nسطر ثانٍ — English line 2');
    assert.ok(m.createdAt && m.updatedAt); ok('color + multi-line AR/EN summary saved, trimmed, dated');

    // persisted with RELATIVE keys only
    const raw = fs.readFileSync(path.join(tmp, 'metadata.json'), 'utf8');
    assert.ok(!raw.includes('D:\\\\') && !raw.toLowerCase().includes('nbrsflow_downloads_test'), 'no absolute path in file');
    assert.ok(Object.keys(JSON.parse(raw).items).includes('series')); ok('stored under the relative path ("series")');

    // reload
    s = new MetadataStore(tmp, defaults);
    assert.equal(s.get(A).color, 'blue'); assert.ok(s.get(A).summary.includes('English')); ok('data survives restart');

    // still works if the root moves (relative keys)
    const s2 = new MetadataStore(tmp, { ...defaults, downloadDir: 'E:\\Other\\Root' });
    assert.equal(s2.get('E:\\Other\\Root\\Series').color, 'blue'); ok('metadata is relative to the root, not absolute');

    // validation
    assert.throws(() => s.setColor(A, 'hotpink'), /Unknown color/); ok('unknown color rejected');
    assert.throws(() => s.setColor('D:\\Elsewhere\\x', 'red'), /outside/); ok('path outside root rejected');

    // rename keeps metadata (also children)
    s.setSummary(F, 'episode note'); s.setColor(path.join(A, 'S1'), 'red');
    const B = path.join(ROOT, 'Renamed Series');
    s.moveKey(A, B);
    assert.equal(s.get(B).color, 'blue'); assert.equal(s.get(path.join(B, 'ep1.mkv')).summary, 'episode note');
    assert.equal(s.get(path.join(B, 'S1')).color, 'red'); assert.equal(s.get(A), undefined); ok('rename carries color + summary (and children)');

    // move into another folder
    const D = path.join(ROOT, 'Archive');
    s.moveKey(B, path.join(D, 'Renamed Series'));
    assert.equal(s.get(path.join(D, 'Renamed Series')).color, 'blue');
    assert.equal(s.get(path.join(D, 'Renamed Series', 'ep1.mkv')).summary, 'episode note'); ok('move carries metadata to the new location');

    // case-only rename / similar prefix not affected
    s.setColor(path.join(ROOT, 'Archive 2'), 'green');
    s.moveKey(D, path.join(ROOT, 'Moved'));
    assert.equal(s.get(path.join(ROOT, 'Archive 2')).color, 'green'); ok('folders with a similar prefix are untouched');

    // getAll keyed by absolute lowercase path
    assert.equal(s.getAll()[path.join(ROOT, 'Archive 2').toLowerCase()].color, 'green'); ok('getAll keyed by absolute lowercase path');

    // clearing both fields removes the entry
    s.setColor(path.join(ROOT, 'Archive 2'), null);
    assert.equal(s.get(path.join(ROOT, 'Archive 2')), undefined); ok('clearing color/summary deletes the entry');

    // remove (trash) with children
    s.removeKey(path.join(ROOT, 'Moved'));
    assert.equal(Object.keys(s.getAll()).length, 0); ok('removeKey drops item and children');

    // folder aliases: add, deduplicate (AR hamza/taa marbuta & case normalization), rename/move sync, remove
    const G = path.join(ROOT, 'جولد تايم');
    s.addAlias(G, 'جي تي');
    s.addAlias(G, 'GT');
    s.addAlias(G, '  gt  '); // duplicate ignoring case/spaces
    s.addAlias(G, 'أسطورة');
    s.addAlias(G, 'اسطوره'); // duplicate after Arabic hamza & taa marbuta normalization
    assert.deepEqual(s.getAliases(G), ['جي تي', 'GT', 'أسطورة']);
    ok('addAlias & getAliases preserve original text and deduplicate by normalized comparison key');

    const G2 = path.join(ROOT, 'Archived', 'جولد تايم الجديد');
    s.moveKey(G, G2);
    assert.deepEqual(s.getAliases(G2), ['جي تي', 'GT', 'أسطورة']);
    assert.deepEqual(s.getAliases(G), []);
    ok('moveKey preserves folder aliases across rename and move');

    s.removeAlias(G2, 'اكسترا');
    s.removeAlias(G2, 'اسطوره'); // matches 'أسطورة' via normalized comparison
    assert.deepEqual(s.getAliases(G2), ['جي تي', 'GT']);
    s.setAliases(G2, []);
    assert.equal(s.get(G2), undefined);
    ok('removeAlias matches normalized Arabic forms and clearing aliases cleans up empty record');

    // new / resume marker: markOpened, same-folder rename, cross-folder move, resetAsNew, removeKey
    const showDir = path.join(ROOT, 'ShowX');
    const ep1 = path.join(showDir, 'ep1.mkv');
    const ep1Renamed = path.join(showDir, 'ep1_fixed.mkv');
    s.markOpened(ep1, 123456789);
    assert.equal(s.get(ep1).openedAt, 123456789);
    assert.equal(s.get(showDir).lastOpenedChildRelPath, path.join('showx', 'ep1.mkv'));
    ok('markOpened records openedAt on file and lastOpenedChildRelPath on parent folder');

    s.moveKey(ep1, ep1Renamed);
    assert.equal(s.get(ep1Renamed).openedAt, 123456789);
    assert.equal(s.get(showDir).lastOpenedChildRelPath, path.join('showx', 'ep1_fixed.mkv'));
    ok('same-folder rename preserves openedAt and updates parent lastOpenedChildRelPath');

    const showDirRenamed = path.join(ROOT, 'ShowY');
    s.moveKey(showDir, showDirRenamed);
    assert.equal(s.get(showDirRenamed).lastOpenedChildRelPath, path.join('showy', 'ep1_fixed.mkv'));
    assert.equal(s.get(path.join(showDirRenamed, 'ep1_fixed.mkv')).openedAt, 123456789);
    ok('moving/renaming parent folder updates lastOpenedChildRelPath inside it');

    const ep1MovedOut = path.join(ROOT, 'Other', 'ep1_fixed.mkv');
    s.moveKey(path.join(showDirRenamed, 'ep1_fixed.mkv'), ep1MovedOut);
    assert.equal(s.get(ep1MovedOut).openedAt, 123456789);
    assert.equal(s.get(showDirRenamed), undefined);
    ok('moving file out clears old parent lastOpenedChildRelPath while keeping file openedAt');

    s.markOpened(ep1MovedOut, 999);
    s.resetAsNew(ep1MovedOut);
    assert.equal(s.get(ep1MovedOut), undefined);
    assert.equal(s.get(path.join(ROOT, 'Other')), undefined);
    ok('resetAsNew clears openedAt and parent lastOpenedChildRelPath');

    s.markOpened(ep1MovedOut, 555);
    s.removeKey(ep1MovedOut);
    assert.equal(s.get(path.join(ROOT, 'Other')), undefined);
    ok('removeKey clears parent lastOpenedChildRelPath');

    // migration from v1 absolute keys
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-meta-v1-'));
    fs.writeFileSync(path.join(tmp2, 'metadata.json'), JSON.stringify({ version: 1, folders: { [path.join(ROOT, 'Old').toLowerCase()]: { color: 'red' } }, files: { 'c:\\outside\\x': { summary: 'x' } }, shortcuts: { a: 'b' } }));
    const s3 = new MetadataStore(tmp2, defaults);
    assert.equal(s3.get(path.join(ROOT, 'Old')).color, 'red'); assert.equal(s3.getShortcuts().a, 'b'); ok('v1 absolute-key data migrated');
    fs.rmSync(tmp2, { recursive: true, force: true });

    // auto-color rule
    fs.rmSync(scratch, { recursive: true, force: true });
    const mk = (dir, files) => { fs.mkdirSync(path.join(scratch, dir), { recursive: true }); files.forEach((f) => fs.writeFileSync(path.join(scratch, dir, f), 'x')); };
    mk('movies', ['a.mkv', 'b.mp4', 'c.avi', 'notes.txt']);
    mk('music', ['a.mp3', 'b.flac']);
    mk('docs', ['a.pdf', 'b.docx']);
    mk('zips', ['a.zip', 'b.rar']);
    mk('apps', ['setup.exe', 'x.msi']);
    mk('mixed', ['a.mkv', 'b.mp3', 'c.pdf', 'd.zip']);
    mk('empty', []);
    mk('nested/season1', ['e1.mkv', 'e2.mkv', 'e3.mkv']);
    const sug = async (d) => suggestFolderColor(path.join(scratch, d));
    assert.equal(await sug('movies'), 'purple'); assert.equal(await sug('music'), 'teal'); assert.equal(await sug('docs'), 'orange');
    assert.equal(await sug('zips'), 'gray'); assert.equal(await sug('apps'), 'green'); ok('auto-color maps video/audio/docs/archives/programs');
    assert.equal(await sug('mixed'), null); assert.equal(await sug('empty'), null); ok('no dominant type (or empty) -> no color');
    assert.equal(await sug('nested'), 'purple'); ok('auto-color looks into sub-folders');

    // startupHelper checks (dev vs packaged login item args + stale electron.exe Run detection)
    const { buildLoginItemOptions, isStaleElectronRunCommand } = require('../dist-electron/electron/startupHelper.js');
    const devOpts = buildLoginItemOptions({
      isPackaged: false,
      execPath: 'D:\\Ai\\antigravity\\p1\\nbrsflow\\node_modules\\electron\\dist\\electron.exe',
      appPath: 'D:\\Ai\\antigravity\\p1\\nbrsflow',
      openAtLogin: true,
      startHidden: true
    });
    assert.deepEqual(devOpts.args, ['D:\\Ai\\antigravity\\p1\\nbrsflow', '--startup']);
    const pkgOpts = buildLoginItemOptions({
      isPackaged: true,
      execPath: 'C:\\Program Files\\nbrsflow\\nbrsflow.exe',
      appPath: 'C:\\Program Files\\nbrsflow\\resources\\app.asar',
      openAtLogin: true,
      startHidden: true
    });
    assert.deepEqual(pkgOpts.args, ['--startup']);
    assert.equal(isStaleElectronRunCommand('"D:\\proj\\node_modules\\electron\\dist\\electron.exe" --startup'), true);
    assert.equal(isStaleElectronRunCommand('"D:\\proj\\node_modules\\electron\\dist\\electron.exe" "D:\\proj" --startup'), false);
    assert.equal(isStaleElectronRunCommand('"C:\\Program Files\\nbrsflow\\nbrsflow.exe" --startup'), false);
    ok('buildLoginItemOptions and isStaleElectronRunCommand prevent bare electron.exe startup');

    // batchUpdate & batchUpdateAsync
    const bDir1 = path.join(ROOT, 'BatchFolder1');
    const bDir2 = path.join(ROOT, 'BatchFolder2');
    s.batchUpdate(() => {
      s.setColor(bDir1, 'blue');
      s.setSummary(bDir1, 'Batch summary');
      s.setColor(bDir2, 'green');
      s.setAutoCreated(bDir2, true);
    });
    assert.equal(s.get(bDir1).color, 'blue');
    assert.equal(s.get(bDir1).summary, 'Batch summary');
    assert.equal(s.get(bDir2).color, 'green');
    assert.equal(s.isAutoCreated(bDir2), true);
    await s.batchUpdateAsync(async () => {
      await Promise.resolve();
      s.setAutoCreated(bDir2, false);
    });
    assert.equal(s.isAutoCreated(bDir2), false);
    ok('batchUpdate and batchUpdateAsync coalesce metadata mutations cleanly');

    // markFolderHasNewFile & automatic removal on markOpened
    const newParent = path.join(ROOT, 'NewSeriesFolder');
    const newEp1 = path.join(newParent, 'ep1.mkv');
    s.markFolderHasNewFile(newEp1);
    assert.deepEqual(s.get(newParent).unopenedFiles, ['ep1.mkv']);
    s.markOpened(newEp1);
    assert.equal(s.get(newParent)?.unopenedFiles, undefined);
    ok('markFolderHasNewFile marks folder with unopened file and markOpened clears it automatically');

    // windowRecovery: stale GPU cache cleanup on version change, GPU crash fallback, and recovery HTML
    const recDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-winrec-'));
    try {
      const gpuCacheDir = path.join(recDir, 'GPUCache');
      fs.mkdirSync(gpuCacheDir, { recursive: true });
      fs.writeFileSync(path.join(gpuCacheDir, 'index'), 'stale');
      assert.equal(clearStaleCachesOnVersionChange(recDir, '0.2.8'), false);
      assert.equal(fs.existsSync(gpuCacheDir), true);
      assert.equal(clearStaleCachesOnVersionChange(recDir, '0.2.9'), true);
      assert.equal(fs.existsSync(gpuCacheDir), false);

      assert.equal(shouldDisableHardwareAcceleration(recDir, []), false);
      const firstCrash = markGpuCrash(recDir, 'crashed');
      assert.equal(firstCrash.disabledForNextLaunch, false);
      const secondCrash = markGpuCrash(recDir, 'crashed');
      assert.equal(secondCrash.disabledForNextLaunch, true);
      assert.equal(shouldDisableHardwareAcceleration(recDir, []), true);
      clearGpuCrashFlag(recDir);
      assert.equal(shouldDisableHardwareAcceleration(recDir, []), false);

      fs.writeFileSync(path.join(recDir, 'settings.json'), JSON.stringify({ disableHardwareAcceleration: true }));
      assert.equal(shouldDisableHardwareAcceleration(recDir, []), true);
      assert.equal(shouldDisableHardwareAcceleration(recDir, ['--disable-gpu']), true);

      const recoveryUrl = buildRecoveryDataUrl('ar', 'render-process-gone');
      assert.equal(recoveryUrl.startsWith('data:text/html;charset=utf-8,'), true);
      assert.equal(decodeURIComponent(recoveryUrl).includes('render-process-gone'), true);
    } finally {
      fs.rmSync(recDir, { recursive: true, force: true });
    }
    ok('windowRecovery clears stale GPUCache on upgrade, handles GPU crash fallback, and builds recovery page');

    // Folder tags (preset + custom + moveKey preservation + clear) & GitHub repo readiness
    const tagFolder = path.join(ROOT, 'TaggedAnime');
    s.setTag(tagFolder, 'أنمي');
    assert.equal(s.get(tagFolder).tag, 'أنمي');
    const tagRenamed = path.join(ROOT, 'TaggedAnimeRenamed');
    s.moveKey(tagFolder, tagRenamed);
    assert.equal(s.get(tagRenamed).tag, 'أنمي');
    s.setTag(tagRenamed, 'تاغ مخصص');
    assert.equal(s.get(tagRenamed).tag, 'تاغ مخصص');
    s.setTag(tagRenamed, null);
    assert.equal(s.get(tagRenamed)?.tag, undefined);

    const repoRoot = path.resolve(__dirname, '..');
    assert.equal(fs.existsSync(path.join(repoRoot, '.gitignore')), true);
    assert.equal(fs.existsSync(path.join(repoRoot, 'README.md')), true);
    assert.equal(fs.existsSync(path.join(repoRoot, 'CHANGELOG.md')), true);
    assert.equal(fs.existsSync(path.join(repoRoot, 'LICENSE')), true);
    ok('MetadataStore folder tags (preset, custom, moveKey, clear) and GitHub repo files verified');

    // appUpdater: semver comparison, GitHub release parsing, checkForUpdates, and downloadAndInstall
    assert.equal(compareSemver('v0.2.11', '0.2.10') > 0, true);
    assert.equal(compareSemver('0.2.11', 'v0.2.11'), 0);
    assert.equal(compareSemver('0.2.9', '0.2.11') < 0, true);

    const updTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-upd-'));
    let launchedInstallerPath = '';
    const mockSrv = http.createServer((req, res) => {
      if (req.url === '/repos/taalkhalaf/nbrsflow/releases/latest') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          tag_name: 'v0.9.0',
          html_url: 'https://github.com/taalkhalaf/nbrsflow/releases/tag/v0.9.0',
          body: 'New features & fixes',
          assets: [{
            name: 'nbrsflow-setup-0.9.0.exe',
            browser_download_url: `http://127.0.0.1:${mockSrv.address().port}/download/nbrsflow-setup-0.9.0.exe`
          }]
        }));
        return;
      }
      if (req.url === '/download/nbrsflow-setup-0.9.0.exe') {
        const buf = Buffer.from('MZ-mock-installer');
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise((r) => mockSrv.listen(0, '127.0.0.1', r));
    try {
      const updater = new AppUpdater({
        currentVersion: '0.2.11',
        apiBaseUrl: `http://127.0.0.1:${mockSrv.address().port}`,
        downloadDir: updTmp,
        launchInstaller: (p) => { launchedInstallerPath = p; }
      });
      const stCheck = await updater.checkForUpdates();
      assert.equal(stCheck.status, 'available');
      assert.equal(stCheck.latestVersion, '0.9.0');
      assert.equal(stCheck.assetName, 'nbrsflow-setup-0.9.0.exe');
      const stDl = await updater.downloadAndInstall();
      assert.equal(stDl.status, 'ready');
      assert.equal(fs.existsSync(launchedInstallerPath), true);
      assert.equal(parseGithubRelease({ tag_name: 'v0.2.11', assets: [] }, '0.2.11').available, false);
    } finally {
      mockSrv.close();
      fs.rmSync(updTmp, { recursive: true, force: true });
    }
    ok('AppUpdater detects newer GitHub release, downloads installer, and invokes launchInstaller');

    console.log(`\nALL PASSED (${passed} checks)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
    console.log('cleanup done:', !fs.existsSync(scratch));
  }
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
