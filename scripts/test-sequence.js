// Automated test suite for electron/sequenceOrganizer.ts (EN/AR normalization, sequence detection,
// automatic & retroactive grouping, metadata preservation, and settings/manual-folder respect).
// Usage: npm run test:seq
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  cleanupEmptyAutoCreatedDirs,
  groupFoldersByTagInRoot,
  inspectSeriesCompletion,
  moveCompletedSeriesFolders,
  normalizeTitle,
  generateTitleAliases,
  matchTitleOrAlias,
  resolveAutoOrganizedDownloadDir,
  organizeDirectorySequences
} = require('../dist-electron/electron/sequenceOrganizer.js');
const { MetadataStore } = require('../dist-electron/electron/storage/metadataStore.js');

const ROOT = 'D:\\Ai\\antigravity\\nbrsflow_downloads_test';
const scratch = path.join(ROOT, '__seq_selftest__');
const tmpMeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nbrs-seq-meta-'));
let passed = 0;
const ok = (n) => { passed++; console.log('  ok -', n); };

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });

  try {
    // 1. English & Arabic title normalization & sequence detection
    const c1 = normalizeTitle('[ReleaseGroup] The_Great_Journey.S01E05.1080p.WEB-DL.x265.HEVC.AAC.mkv');
    assert.equal(c1.normalizedTitle, 'The Great Journey');
    assert.equal(c1.hasSequenceMarker, true);
    assert.equal(c1.isExplicitSequence, true);
    assert.equal(c1.sequenceIndex, 5);
    ok('normalizeTitle extracts English S01E05 series title and strips 1080p/WEB-DL/x265/HEVC/brackets');

    const c2 = normalizeTitle('Documentary.Series.Ep.02.720p.BluRay.x264.mp4');
    assert.equal(c2.normalizedTitle, 'Documentary Series');
    assert.equal(c2.hasSequenceMarker, true);
    assert.equal(c2.sequenceIndex, 2);
    ok('normalizeTitle handles Ep.02 and BluRay/x264 tags');

    const c3 = normalizeTitle('Coding_Bootcamp_Part_3_2160p_4K_HDR.mp4');
    assert.equal(c3.normalizedTitle, 'Coding Bootcamp');
    assert.equal(c3.hasSequenceMarker, true);
    assert.equal(c3.isExplicitSequence, true);
    assert.equal(c3.sequenceIndex, 3);
    ok('normalizeTitle handles Part 3 and 2160p/4K/HDR tags');

    const c4 = normalizeTitle('مسلسل_الصحراء_الحلقة_4_1080p_WEB-DL.mp4');
    assert.equal(c4.normalizedTitle, 'مسلسل الصحراء');
    assert.equal(c4.hasSequenceMarker, true);
    assert.equal(c4.isExplicitSequence, true);
    assert.equal(c4.sequenceIndex, 4);
    ok('normalizeTitle extracts Arabic title with الحلقة 4');

    const c5 = normalizeTitle('[جودة عالية] رحلة_العلم - الحلقة الأولى (720p).mkv');
    assert.equal(c5.normalizedTitle, 'رحلة العلم');
    assert.equal(c5.hasSequenceMarker, true);
    assert.equal(c5.isExplicitSequence, true);
    assert.equal(c5.sequenceIndex, 1);
    ok('normalizeTitle parses Arabic ordinal الحلقة الأولى -> index 1');

    const c6 = normalizeTitle('دورة_البرمجة_الجزء_الثاني_1080p.mp4');
    assert.equal(c6.normalizedTitle, 'دورة البرمجة');
    assert.equal(c6.hasSequenceMarker, true);
    assert.equal(c6.isExplicitSequence, true);
    assert.equal(c6.sequenceIndex, 2);
    ok('normalizeTitle parses Arabic الجزء الثاني -> index 2');

    const c7 = normalizeTitle('Ocean_Life - 07 (1080p) [AAC].mkv');
    assert.equal(c7.normalizedTitle, 'Ocean Life');
    assert.equal(c7.hasSequenceMarker, true);
    assert.equal(c7.sequenceIndex, 7);
    ok('normalizeTitle detects numeric "- 07" sequence marker');

    const c8 = normalizeTitle('Studio_Lecture (03) [720p].mp4');
    assert.equal(c8.normalizedTitle, 'Studio Lecture');
    assert.equal(c8.hasSequenceMarker, true);
    assert.equal(c8.sequenceIndex, 3);
    ok('normalizeTitle detects parenthesized "(03)" sequence marker');

    const c9 = normalizeTitle('Project_Dataset_Backup.part2.rar');
    assert.equal(c9.normalizedTitle, 'Project Dataset Backup');
    assert.equal(c9.hasSequenceMarker, true);
    assert.equal(c9.isExplicitSequence, true);
    assert.equal(c9.sequenceIndex, 2);
    ok('normalizeTitle detects split archive .part2.rar');

    const c10 = normalizeTitle('Standalone_Reference_Manual_1080p.pdf');
    assert.equal(c10.normalizedTitle, 'Standalone Reference Manual');
    assert.equal(c10.hasSequenceMarker, false);
    assert.equal(c10.isExplicitSequence, false);
    ok('normalizeTitle keeps non-sequential file flagged as hasSequenceMarker=false');

    // 2. Retroactive grouping + metadata preservation
    const store = new MetadataStore(tmpMeta, {
      language: 'ar',
      downloadDir: scratch,
      autoColor: false,
      autoOrganizeEnabled: true
    });

    const ep1Loose = path.join(scratch, 'Planet_Story - 01 [1080p].mp4');
    fs.writeFileSync(ep1Loose, 'ep1-data');
    store.setSummary(ep1Loose, 'ملخص الحلقة الأولى من السلسلة');

    // Incoming ep2 triggers retroactive creation of "Planet Story" folder & moves ep1Loose with its metadata
    const dec1 = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/Planet_Story%20-%2002%20[1080p].mp4',
      fileName: 'Planet_Story - 02 [1080p].mp4',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => [],
      onRetroactiveMove: (oldP, newP) => store.moveKey(oldP, newP)
    });

    const expectedFolder = path.join(scratch, 'Planet Story');
    const ep1Moved = path.join(expectedFolder, 'Planet_Story - 01 [1080p].mp4');
    assert.equal(dec1.targetDir, expectedFolder);
    assert.equal(dec1.autoGroupedFolder, 'Planet Story');
    assert.ok(fs.existsSync(ep1Moved) && !fs.existsSync(ep1Loose), 'ep1 moved into Planet Story folder');
    assert.equal(store.get(ep1Moved)?.summary, 'ملخص الحلقة الأولى من السلسلة');
    ok('retroactive grouping moves previous file into new sequence folder and preserves its metadata summary');

    // 3. Subsequent episode routes straight into existing folder
    const dec2 = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/Planet_Story_03.mp4',
      fileName: 'Planet_Story - 03 [720p].mp4',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => []
    });
    assert.equal(dec2.targetDir, expectedFolder);
    ok('subsequent download routes directly into existing normalized folder');

    // 4. Explicit sequence marker creates folder immediately even on first episode
    const dec3 = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/Desert_Tales_S01E01_1080p.mkv',
      fileName: 'Desert_Tales_S01E01_1080p.mkv',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => []
    });
    assert.equal(dec3.targetDir, path.join(scratch, 'Desert Tales'));
    assert.ok(fs.existsSync(dec3.targetDir));
    ok('first file with explicit S01E01 marker creates its series folder immediately');

    // 5. Non-sequence standalone video stays in root
    const dec4 = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/standalone_movie.mkv',
      fileName: 'standalone_movie.mkv',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => []
    });
    assert.equal(dec4.targetDir, scratch);
    assert.equal(dec4.autoGroupedFolder, undefined);
    ok('normal non-sequence video stays in the main downloads folder');

    // 6. Respect autoOrganizeEnabled = false
    const dec5 = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/Another_Show_S01E01.mkv',
      fileName: 'Another_Show_S01E01.mkv',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => false,
      getTrackedDownloads: () => []
    });
    assert.equal(dec5.targetDir, scratch);
    ok('disabling autoOrganizeEnabled keeps downloads in root without creating folders');

    // 7. Respect manual custom subfolder choice
    const customDir = path.join(scratch, 'MyCustomFolder');
    fs.mkdirSync(customDir, { recursive: true });
    const dec6 = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/Another_Show_S01E01.mkv',
      fileName: 'Another_Show_S01E01.mkv',
      requestedDir: customDir,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => []
    });
    assert.equal(dec6.targetDir, customDir);
    assert.equal(dec6.autoGroupedFolder, undefined);
    ok('explicitly choosing a custom subfolder bypasses auto-organize routing');

    // 8. On-demand organizeDirectorySequences
    const ar1 = path.join(scratch, 'برمجة_الشبكات_الحلقة_1_1080p.mp4');
    const ar2 = path.join(scratch, 'برمجة_الشبكات_الحلقة_2_1080p.mp4');
    fs.writeFileSync(ar1, '1');
    fs.writeFileSync(ar2, '2');
    store.setSummary(ar1, 'ملاحظة الدرس الأول');

    const orgRes = await organizeDirectorySequences(scratch, scratch, (oldP, newP) => store.moveKey(oldP, newP));
    assert.equal(orgRes.movedCount, 2);
    const arFolder = path.join(scratch, 'برمجة الشبكات');
    assert.ok(fs.existsSync(path.join(arFolder, 'برمجة_الشبكات_الحلقة_1_1080p.mp4')));
    assert.ok(fs.existsSync(path.join(arFolder, 'برمجة_الشبكات_الحلقة_2_1080p.mp4')));
    assert.equal(store.get(path.join(arFolder, 'برمجة_الشبكات_الحلقة_1_1080p.mp4'))?.summary, 'ملاحظة الدرس الأول');
    ok('organizeDirectorySequences groups loose Arabic episodes and preserves metadata');

    // 9. Acronym / alias generation & matching (English "Golden Time" <-> "GT", Arabic "جولد تايم" <-> "جي تي" / "ج ت" / "جت")
    const enAliases = generateTitleAliases('Golden Time');
    assert.ok(enAliases.includes('GT'), 'Golden Time generates GT');
    const arAliases = generateTitleAliases('جولد تايم');
    assert.ok(arAliases.includes('جي تي') && arAliases.includes('ج ت') && arAliases.includes('جت'), 'جولد تايم generates جي تي, ج ت, جت');
    assert.equal(matchTitleOrAlias('GT', 'Golden Time').matched, true);
    assert.equal(matchTitleOrAlias('جي تي', 'جولد تايم').matched, true);
    assert.equal(matchTitleOrAlias('جت', 'جولد تايم').matched, true);
    ok('generateTitleAliases & matchTitleOrAlias match "GT" -> "Golden Time" and "جي تي"/"جت" -> "جولد تايم"');

    // 10. Incoming abbreviated download "GT.Ep03.mp4" matches existing "Golden Time" folder
    const gtDir = path.join(scratch, 'Golden Time');
    fs.mkdirSync(gtDir, { recursive: true });
    const decGt = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/GT.Ep03.1080p.mp4',
      fileName: 'GT.Ep03.1080p.mp4',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => [],
      getFolderAliases: (p) => store.getAliases(p),
      onRegisterDefaultAliases: (p, defs) => { if (store.getAliases(p).length === 0) store.setAliases(p, defs); }
    });
    assert.equal(decGt.targetDir, gtDir);
    assert.equal(decGt.autoGroupedFolder, 'Golden Time');
    assert.equal(decGt.matchedAlias, 'GT');
    assert.ok(store.getAliases(gtDir).includes('GT'));
    ok('abbreviated English download "GT.Ep03.1080p.mp4" routes into "Golden Time" via alias "GT"');

    // 11. Retroactive Arabic grouping: loose "جولد تايم - الحلقة 1.mp4" + incoming "جي تي - 02.mp4"
    const jtLoose = path.join(scratch, 'جولد تايم - الحلقة 1.mp4');
    fs.writeFileSync(jtLoose, 'ep1');
    store.setSummary(jtLoose, 'ملخص جولد تايم ١');
    const decJt = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/jt2.mp4',
      fileName: 'جي تي - 02.mp4',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => [],
      getFolderAliases: (p) => store.getAliases(p),
      onRegisterDefaultAliases: (p, defs) => { if (store.getAliases(p).length === 0) store.setAliases(p, defs); },
      onRetroactiveMove: (oldP, newP) => store.moveKey(oldP, newP)
    });
    const jtFolder = path.join(scratch, 'جولد تايم');
    assert.equal(decJt.targetDir, jtFolder);
    assert.equal(decJt.autoGroupedFolder, 'جولد تايم');
    assert.equal(decJt.matchedAlias, 'جي تي');
    assert.ok(fs.existsSync(path.join(jtFolder, 'جولد تايم - الحلقة 1.mp4')));
    assert.equal(store.get(path.join(jtFolder, 'جولد تايم - الحلقة 1.mp4'))?.summary, 'ملخص جولد تايم ١');
    assert.ok(store.getAliases(jtFolder).includes('جي تي'));
    ok('abbreviated Arabic download "جي تي - 02.mp4" retroactively groups with "جولد تايم - الحلقة 1.mp4" into "جولد تايم"');

    // 12. Explicit user-added custom alias on a folder
    store.addAlias(jtFolder, 'الوقت الذهبي');
    const decCustomAlias = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/ep3.mp4',
      fileName: 'الوقت الذهبي - الحلقة 3.mp4',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => [],
      getFolderAliases: (p) => store.getAliases(p)
    });
    assert.equal(decCustomAlias.targetDir, jtFolder);
    assert.equal(decCustomAlias.matchedAlias, 'الوقت الذهبي');
    ok('custom user-added alias ("الوقت الذهبي") routes matching episodes into "جولد تايم"');

    // 13. Same base name differing only by resolution or single-digit episode number groups into one folder
    const resA = normalizeTitle('My.Movie.1080p.WEB-DL.x265.mp4');
    const resB = normalizeTitle('My Movie (720p).mp4');
    assert.equal(resA.normalizedKey, resB.normalizedKey);
    const lecA = normalizeTitle('Course Lesson 1 1080p.mp4');
    const lecB = normalizeTitle('Course Lesson 2 720p.mp4');
    assert.equal(lecA.normalizedKey, lecB.normalizedKey);
    assert.equal(lecA.normalizedTitle, 'Course Lesson');

    const movieLoose = path.join(scratch, 'My.Movie.1080p.WEB-DL.mp4');
    fs.writeFileSync(movieLoose, 'm1');
    let autoMarked = '';
    const decMovie = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/movie720.mp4',
      fileName: 'My Movie (720p).mp4',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => [],
      onFolderAutoCreated: (p) => { autoMarked = p; store.setAutoCreated(p, true); },
      onRetroactiveMove: (o, n) => store.moveKey(o, n)
    });
    assert.equal(path.basename(decMovie.targetDir), 'My Movie');
    assert.equal(autoMarked, decMovie.targetDir);
    assert.equal(store.isAutoCreated(decMovie.targetDir), true);
    assert.ok(fs.existsSync(path.join(decMovie.targetDir, 'My.Movie.1080p.WEB-DL.mp4')));
    ok('files differing only by resolution or single-digit number share normalizedKey and auto-group into one autoCreated folder');

    // 14. Auto-created folder is deleted when emptied, while manual folders are preserved
    const manualDir = path.join(scratch, 'ManualFolder');
    fs.mkdirSync(manualDir, { recursive: true });
    fs.unlinkSync(path.join(decMovie.targetDir, 'My.Movie.1080p.WEB-DL.mp4'));
    const removedAuto = await cleanupEmptyAutoCreatedDirs(
      decMovie.targetDir,
      scratch,
      (p) => store.isAutoCreated(p),
      (p) => store.removeKey(p)
    );
    assert.equal(removedAuto.length, 1);
    assert.equal(fs.existsSync(decMovie.targetDir), false);
    assert.equal(store.isAutoCreated(decMovie.targetDir), false);

    const removedManual = await cleanupEmptyAutoCreatedDirs(
      manualDir,
      scratch,
      (p) => store.isAutoCreated(p),
      (p) => store.removeKey(p)
    );
    assert.equal(removedManual.length, 0);
    assert.equal(fs.existsSync(manualDir), true);
    ok('cleanupEmptyAutoCreatedDirs removes emptied autoCreated folder and leaves manual folders intact');

    // 15. Synonym / Acronym group bidirectional unification ("تايم جولد" <-> "تي جي")
    const tgDir = path.join(scratch, 'تايم جولد');
    fs.mkdirSync(tgDir, { recursive: true });
    const decTg = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/tg05.mp4',
      fileName: 'تي جي - الحلقة 5.mp4',
      requestedDir: scratch,
      rootDir: scratch,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => [],
      getFolderAliases: (p) => store.getAliases(p),
      onRegisterDefaultAliases: (p, defs) => { if (store.getAliases(p).length === 0) store.setAliases(p, defs); }
    });
    assert.equal(decTg.targetDir, tgDir);
    assert.equal(decTg.autoGroupedFolder, 'تايم جولد');

    const revRoot = path.join(scratch, 'rev_root');
    fs.mkdirSync(path.join(revRoot, 'تي جي'), { recursive: true });
    const decRevExact = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/tg_rev2.mp4',
      fileName: 'تايم جولد - الحلقة 1.mp4',
      requestedDir: revRoot,
      rootDir: revRoot,
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => [],
      getFolderAliases: (p) => store.getAliases(p),
      onRegisterDefaultAliases: (p, defs) => { if (store.getAliases(p).length === 0) store.setAliases(p, defs); }
    });
    assert.equal(decRevExact.targetDir, path.join(revRoot, 'تي جي'));
    assert.equal(decRevExact.autoGroupedFolder, 'تي جي');
    ok('bidirectional synonym unification ("تايم جولد" <-> "تي جي") routes to existing folder in both directions');

    // 16. End-episode (`end`) detection, series completeness verification, auto-move completed, and group by tag
    const end1 = normalizeTitle('Solo Leveling E12end 1080p.mp4');
    assert.equal(end1.normalizedTitle, 'Solo Leveling');
    assert.equal(end1.sequenceIndex, 12);
    assert.equal(end1.isEndEpisode, true);

    const end2 = normalizeTitle('المحقق كونان الحلقة 10 end.mkv');
    assert.equal(end2.normalizedTitle, 'المحقق كونان');
    assert.equal(end2.sequenceIndex, 10);
    assert.equal(end2.isEndEpisode, true);

    const end3 = normalizeTitle('Frieren 28 end.mp4');
    assert.equal(end3.normalizedTitle, 'Frieren');
    assert.equal(end3.sequenceIndex, 28);
    assert.equal(end3.isEndEpisode, true);

    const compRoot = path.join(scratch, 'comp_root');
    const completeSeries = path.join(compRoot, 'CompleteShow');
    const ongoingSeries = path.join(compRoot, 'OngoingShow');
    fs.mkdirSync(completeSeries, { recursive: true });
    fs.mkdirSync(ongoingSeries, { recursive: true });
    fs.writeFileSync(path.join(completeSeries, 'CompleteShow E01.mp4'), '1');
    fs.writeFileSync(path.join(completeSeries, 'CompleteShow E02.mp4'), '2');
    fs.writeFileSync(path.join(completeSeries, 'CompleteShow E03end.mp4'), '3');
    fs.writeFileSync(path.join(ongoingSeries, 'OngoingShow E01.mp4'), '1');
    fs.writeFileSync(path.join(ongoingSeries, 'OngoingShow E03end.mp4'), '3');

    const compInfo = await inspectSeriesCompletion(completeSeries);
    assert.equal(compInfo.isComplete, true);
    assert.equal(compInfo.totalEpisodes, 3);
    const ongoingInfo = await inspectSeriesCompletion(ongoingSeries);
    assert.equal(ongoingInfo.isComplete, false);

    const movedCompleted = await moveCompletedSeriesFolders(compRoot, 'Completed');
    assert.equal(movedCompleted.length, 1);
    assert.equal(fs.existsSync(path.join(compRoot, 'Completed', 'CompleteShow', 'CompleteShow E03end.mp4')), true);
    assert.equal(fs.existsSync(ongoingSeries), true);

    const tagRoot = path.join(scratch, 'tag_root');
    const animeDir = path.join(tagRoot, 'Naruto');
    fs.mkdirSync(animeDir, { recursive: true });
    const tagMap = new Map([[animeDir.toLowerCase(), 'أنمي']]);
    const groupedByTag = await groupFoldersByTagInRoot(tagRoot, (p) => tagMap.get(p.toLowerCase()));
    assert.equal(groupedByTag.length, 1);
    assert.equal(fs.existsSync(path.join(tagRoot, 'أنمي', 'Naruto')), true);
    ok('end-episode detection, 1..N completion check, moveCompletedSeriesFolders, and groupFoldersByTagInRoot verified');

    // 17. Unified type folders for Documents, Executables, Audio (no per-file folders) + archives preserved
    const typeRoot = path.join(scratch, 'type_root');
    fs.mkdirSync(typeRoot, { recursive: true });
    fs.writeFileSync(path.join(typeRoot, 'Report 1.pdf'), 'pdf1');
    fs.writeFileSync(path.join(typeRoot, 'Track 01.mp3'), 'mp3');
    fs.writeFileSync(path.join(typeRoot, 'Installer_v2.exe'), 'exe');
    fs.writeFileSync(path.join(typeRoot, 'backup.zip'), 'zip');

    const decDoc = await resolveAutoOrganizedDownloadDir({
      url: 'http://127.0.0.1/Report_2.pdf',
      fileName: 'Report 2.pdf',
      requestedDir: typeRoot,
      rootDir: typeRoot,
      language: 'en',
      isAutoOrganizeEnabled: () => true,
      getTrackedDownloads: () => []
    });
    assert.equal(decDoc.targetDir, path.join(typeRoot, 'Documents'));
    assert.equal(fs.existsSync(path.join(typeRoot, 'Documents', 'Report 1.pdf')), true);
    assert.equal(fs.existsSync(path.join(typeRoot, 'Report')), false);

    const orgTypeRes = await organizeDirectorySequences(typeRoot, typeRoot, { language: 'en' });
    assert.ok(orgTypeRes.movedCount >= 2);
    assert.equal(fs.existsSync(path.join(typeRoot, 'Executables', 'Installer_v2.exe')), true);
    assert.equal(fs.existsSync(path.join(typeRoot, 'Audio', 'Track 01.mp3')), true);
    assert.equal(fs.existsSync(path.join(typeRoot, 'Track')), false);
    assert.equal(fs.existsSync(path.join(typeRoot, 'backup.zip')), true);
    ok('unified type folders collect Documents, Executables, and Audio without per-file folders while preserving archives');

    console.log(`\nALL PASSED (${passed} checks)`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(tmpMeta, { recursive: true, force: true });
    console.log('cleanup done:', !fs.existsSync(scratch));
  }
})().catch((e) => {
  console.error('\nFAILED:', e);
  process.exit(1);
});
