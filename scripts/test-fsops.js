// Automated check of electron/fsOps against the real test downloads folder.
// Usage: npm run test:fs   (compiles electron/ first)
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const ops = require('../dist-electron/electron/fsOps.js');

const ROOT = 'D:\\Ai\\antigravity\\nbrsflow_downloads_test';
const base = path.join(ROOT, '__fs_selftest__');
let passed = 0;
const ok = (name) => { passed++; console.log('  ok -', name); };
const rejects = async (fn, label) => { let threw = false; try { await fn(); } catch { threw = true; } assert.ok(threw, label); ok(label); };

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.rmSync(base, { recursive: true, force: true });
  const a = path.join(base, 'folderA'), b = path.join(base, 'folderB');
  fs.mkdirSync(a, { recursive: true }); fs.mkdirSync(b, { recursive: true });
  const f1 = path.join(base, 'one.txt'), f2 = path.join(base, 'two.txt');
  fs.writeFileSync(f1, 'hello'); fs.writeFileSync(f2, 'world!!');

  try {
    // move
    let r = await ops.moveItems(ROOT, [f1, f2], a);
    assert.deepEqual(r.map((x) => path.basename(x)), ['one.txt', 'two.txt']); ok('moveItems moves several files');
    assert.ok(fs.existsSync(path.join(a, 'one.txt')) && !fs.existsSync(f1)); ok('moved files left the source');

    // collision -> (1)
    fs.writeFileSync(f1, 'again');
    r = await ops.moveItems(ROOT, [f1], a);
    assert.equal(path.basename(r[0]), 'one (1).txt');
    assert.equal(fs.readFileSync(path.join(a, 'one.txt'), 'utf8'), 'hello'); ok('name collision gets (1) suffix, no overwrite');

    // folder move + into itself
    await ops.moveItems(ROOT, [a], b);
    assert.ok(fs.existsSync(path.join(b, 'folderA', 'two.txt'))); ok('moveItems moves a folder');
    await rejects(() => ops.moveItems(ROOT, [b], path.join(b, 'folderA')), 'cannot move folder into itself');

    // rename
    const renamed = await ops.renameItem(ROOT, path.join(b, 'folderA'), 'renamedA');
    assert.ok(fs.existsSync(renamed)); ok('renameItem works');
    await rejects(() => ops.renameItem(ROOT, renamed, 'bad:name?'), 'rename rejects forbidden characters');
    await rejects(() => ops.renameItem(ROOT, renamed, 'CON'), 'rename rejects reserved names');
    await rejects(() => ops.renameItem(ROOT, renamed, '..'), 'rename rejects ..');
    fs.mkdirSync(path.join(b, 'exists'));
    await rejects(() => ops.renameItem(ROOT, renamed, 'exists'), 'rename refuses to replace existing item');

    // size: hello(5) + world!!(7) + again(5) = 17
    const size = await ops.calculateFolderSize(ROOT, b);
    assert.equal(size, 17); ok(`calculateFolderSize = ${size} bytes`);

    // outside-root rejections
    await rejects(() => ops.moveItems(ROOT, [path.join(renamed, 'two.txt')], 'D:\\Ai\\antigravity'), 'move outside root rejected');
    await rejects(() => ops.moveItems(ROOT, ['D:\\Ai\\antigravity\\p1\\nbrsflow\\package.json'], b), 'move from outside root rejected');
    await rejects(() => ops.renameItem(ROOT, 'D:\\Ai\\antigravity\\p1\\nbrsflow\\package.json', 'x.json'), 'rename outside root rejected');
    await rejects(() => ops.calculateFolderSize(ROOT, 'C:\\Windows'), 'size outside root rejected');
    await rejects(() => ops.renameItem(ROOT, ROOT, 'x'), 'root cannot be renamed');
    await rejects(() => ops.moveItems(ROOT, [path.join(ROOT, '..', 'x')], b), 'path traversal rejected');

    // zip: multiple items -> folder named after archive
    const multi = new AdmZip();
    multi.addFile('a.txt', Buffer.from('A')); multi.addFile('sub/b.txt', Buffer.from('B'));
    const zipMulti = path.join(base, 'multi.zip'); multi.writeZip(zipMulti);
    const outMulti = await ops.smartExtractArchive(ROOT, zipMulti);
    assert.equal(path.basename(outMulti), 'multi');
    assert.ok(fs.existsSync(path.join(outMulti, 'a.txt')) && fs.existsSync(path.join(outMulti, 'sub', 'b.txt'))); ok('zip with many items -> folder named after archive');

    // zip: single item -> extracted in place
    const single = new AdmZip(); single.addFile('only.txt', Buffer.from('X'));
    const zipSingle = path.join(base, 'single.zip'); single.writeZip(zipSingle);
    const outSingle = await ops.smartExtractArchive(ROOT, zipSingle);
    assert.equal(outSingle, path.join(base, 'only.txt')); assert.equal(fs.readFileSync(outSingle, 'utf8'), 'X'); ok('zip with one item -> extracted next to archive');
    const again = await ops.smartExtractArchive(ROOT, zipSingle);
    assert.equal(path.basename(again), 'only (1).txt'); ok('re-extract does not overwrite');

    // zip slip
    const evil = new AdmZip(); evil.addFile('x.txt', Buffer.from('1')); evil.addFile('y.txt', Buffer.from('2'));
    const zipEvil = path.join(base, 'evil.zip'); evil.writeZip(zipEvil);
    const raw = fs.readFileSync(zipEvil);
    // Patch both entry names to be traversal paths of equal length ("../e.txt" style).
    const patched = Buffer.from(raw.toString('latin1').split('x.txt').join('../x.').split('y.txt').join('ok/y.'), 'latin1');
    fs.writeFileSync(zipEvil, patched);
    await assert.rejects(() => ops.smartExtractArchive(ROOT, zipEvil), /Unsafe path/); ok('zip-slip archive rejected by path guard');
    assert.ok(!fs.existsSync(path.join(ROOT, 'x')) && !fs.existsSync(path.join(base, '..', 'x'))); ok('zip-slip wrote nothing outside');

    await rejects(() => ops.smartExtractArchive(ROOT, f2), 'non-zip rejected');

    // checksum verification (SHA-256 & MD5)
    const crypto = require('node:crypto');
    const hashFile = path.join(base, 'hash-check.txt');
    const hashData = 'nbrsflow-checksum-payload-123';
    fs.writeFileSync(hashFile, hashData);
    const hashes = await ops.computeFileHashes(ROOT, hashFile);
    assert.equal(hashes.sha256, crypto.createHash('sha256').update(hashData).digest('hex'));
    assert.equal(hashes.md5, crypto.createHash('md5').update(hashData).digest('hex'));
    assert.equal(hashes.size, Buffer.byteLength(hashData));
    await rejects(() => ops.computeFileHashes(ROOT, b), 'checksum rejects folder');
    await rejects(() => ops.computeFileHashes(ROOT, 'C:\\Windows\\System32\\drivers\\etc\\hosts'), 'checksum rejects outside root');
    ok('computeFileHashes computes exact SHA-256 and MD5 via stream and enforces root guard');

    // batchRename & readFilePreview
    const br1 = path.join(base, 'br_a.txt');
    const br2 = path.join(base, 'br_b.txt');
    fs.writeFileSync(br1, 'hello preview');
    fs.writeFileSync(br2, 'second');
    const renamedPairs = await ops.batchRename(ROOT, [
      { path: br1, newName: 'Item_01.txt' },
      { path: br2, newName: 'Item_02.txt' }
    ]);
    assert.equal(renamedPairs.length, 2);
    assert.ok(fs.existsSync(path.join(base, 'Item_01.txt')));
    assert.ok(fs.existsSync(path.join(base, 'Item_02.txt')));
    ok('batchRename renames multiple files safely');

    const prevText = await ops.readFilePreview(ROOT, path.join(base, 'Item_01.txt'));
    assert.equal(prevText.kind, 'text');
    assert.equal(prevText.text, 'hello preview');
    const prevFolder = await ops.readFilePreview(ROOT, b);
    assert.equal(prevFolder.kind, 'info');
    ok('readFilePreview returns text preview and info fallback');

    // .zip archive preview & download provenance
    const zipPrev = new AdmZip();
    zipPrev.addFile('docs/readme.txt', Buffer.from('hello zip', 'utf8'));
    zipPrev.addFile('data.json', Buffer.from('{"ok":true}', 'utf8'));
    const zipPrevPath = path.join(base, 'preview-test.zip');
    zipPrev.writeZip(zipPrevPath);
    const provenance = { url: 'https://example.com/files/preview-test.zip', downloadedAt: 1700000000000 };
    const prevArchive = await ops.readFilePreview(ROOT, zipPrevPath, provenance);
    assert.equal(prevArchive.kind, 'archive');
    assert.equal(prevArchive.archiveTotalCount, 2);
    assert.equal(prevArchive.archiveEntries.length, 2);
    assert.ok(prevArchive.archiveEntries.some((e) => e.name === 'docs/readme.txt'));
    assert.deepEqual(prevArchive.provenance, provenance);
    ok('readFilePreview lists .zip archive contents without extracting and preserves provenance');

    // inspectFolderIndicators (duplicate detection)
    const dupFolder = path.join(base, 'dup_folder');
    const cleanFolder = path.join(base, 'clean_folder');
    fs.mkdirSync(dupFolder, { recursive: true });
    fs.mkdirSync(cleanFolder, { recursive: true });
    fs.writeFileSync(path.join(dupFolder, 'movie.mp4'), '12345');
    fs.writeFileSync(path.join(dupFolder, 'movie (1).mp4'), '123456');
    fs.writeFileSync(path.join(cleanFolder, 'unique_a.txt'), 'a');
    fs.writeFileSync(path.join(cleanFolder, 'unique_b.txt'), 'bb');
    const indicators = await ops.inspectFolderIndicators(ROOT, [dupFolder, cleanFolder]);
    assert.equal(indicators[dupFolder.toLowerCase()].hasDuplicates, true);
    assert.equal(indicators[cleanFolder.toLowerCase()].hasDuplicates, false);
    ok('inspectFolderIndicators flags folders with duplicate/copy files and ignores clean folders');

    // smartExtractArchive mode 'here' & getThumbnail for image/folder
    const hereZip = new AdmZip();
    hereZip.addFile('here_a.txt', Buffer.from('here-a', 'utf8'));
    hereZip.addFile('here_b.txt', Buffer.from('here-b', 'utf8'));
    const hereZipDir = path.join(base, 'here_extract_dir');
    fs.mkdirSync(hereZipDir, { recursive: true });
    const hereZipPath = path.join(hereZipDir, 'here.zip');
    hereZip.writeZip(hereZipPath);
    await ops.smartExtractArchive(ROOT, hereZipPath, 'here');
    assert.ok(fs.existsSync(path.join(hereZipDir, 'here_a.txt')));
    assert.ok(fs.existsSync(path.join(hereZipDir, 'here_b.txt')));
    ok('smartExtractArchive mode="here" extracts files into current directory');

    const thumbDir = path.join(base, 'thumb_dir');
    fs.mkdirSync(thumbDir, { recursive: true });
    const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const imgPath = path.join(thumbDir, 'cover.png');
    fs.writeFileSync(imgPath, png1x1);
    const fileThumb = await ops.getThumbnail(ROOT, imgPath);
    const dirThumb = await ops.getThumbnail(ROOT, thumbDir);
    assert.ok(typeof fileThumb === 'string' && fileThumb.startsWith('data:image/png;base64,'));
    assert.ok(typeof dirThumb === 'string' && dirThumb.startsWith('data:image/png;base64,'));
    ok('getThumbnail generates thumbnail data URLs for image files and folders');

    console.log(`\nALL PASSED (${passed} checks)`);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    console.log('cleanup done:', !fs.existsSync(base));
  }
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
