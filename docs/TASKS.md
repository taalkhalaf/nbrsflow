# nbrsflow — Implementation Roadmap & Tasks | خارطة طريق المشروع والمهام

خارطة طريق تنفيذ مشروع `nbrsflow` مقسمة إلى 12 مرحلة أساسية، بدءاً من مرحلة التأسيس وحتى الإصدار النهائي على GitHub.

---

## Phases Checklist | قائمة المراحل

- [x] **Phase 1: Project Blueprint, Licensing, & Initial Repository Setup**
  - [x] Create project blueprint in Arabic and English (`PROJECT_BLUEPRINT.md`).
  - [x] Create standardized 12-phase execution roadmap (`TASKS.md`).
  - [x] Setup continuous tracking and handoff log (`AGENT_HANDOFF.md`).
  - [x] Add standard MIT license for developer identity `nbrs` (2026) (`LICENSE`).
  - [x] Setup professional project introduction and documentation (`README.md`).
  - [x] Configure comprehensive `.gitignore` for Electron, Node.js, and Windows environment.
  - [x] Verify default test downloads directory (`D:\Ai\antigravity\nbrsflow_downloads_test`).

- [x] **Phase 2: Project Scaffolding & Toolchain Setup** (core done)
  - [x] Initialize Node.js / TypeScript project with Electron + Vite + React.
  - [x] Configure Tailwind CSS (v4 via `@tailwindcss/vite`).
  - [x] Configure TypeScript (`tsconfig.json` renderer, `electron/tsconfig.json` main/preload as CommonJS).
  - [x] Setup scripts: `dev`, `build`, `typecheck`, `dist` + `electron-builder` NSIS config.
  - [x] RTL/LTR + Arabic/English base (`src/i18n`, diagnostic `App.tsx`).
  - [ ] ESLint + Prettier (deferred).
- [x] **Phase 3: Core IPC Architecture & Native Window Shell** (frameless custom titlebar integrated in TopBar)
  - [x] Secure `preload.ts` with typed `window.nbrsAPI` (settings, files, metadata, downloads, windowCtrl).
  - [x] Frameless window (`frame: false`, `Menu.setApplicationMenu(null)`, `autoHideMenuBar: true`) with draggable custom titlebar and integrated minimize/maximize/restore/close controls in `TopBar.tsx` matching NBRS dark/light identity.
  - [x] Black-screen prevention & recovery (`electron/windowRecovery.ts`, `electron/main.ts`, `src/components/ErrorBoundary.tsx`): automatic stale Chromium `GPUCache`/`DawnCache`/`Code Cache` cleanup on version upgrade, `render-process-gone` / `child-process-gone` (GPU) / `did-fail-load` auto-recovery & inline fallback page, `ready-to-show` visibility safety timer, React `ErrorBoundary`, and optional Safe Graphics Mode (`disableHardwareAcceleration`) in Settings -> System.
  - [x] Typed IPC for `listDirectory`, `getFolderTree`, `getDiskSpace`, `createFolder` (restricted to the allowed root).
  - [x] App shell: top bar (breadcrumb, filter, Add URL, New Folder, grid/list, View Mode selector: `default` / `downloads` / `files`, Quick Access sidebar toggle, dual-pane, theme, language, real `package.json` version badge, clipboard monitor toggle, Settings dialog), sidebar (collapsible/toggleable quick access, type filters, real folder tree, disk space), downloads panel (tabs, collapse/resize), explorer (grid/list, dual pane, selection), status bar (with version & engine status).
  - [x] System Tray (`electron/trayManager.ts`) & Windows Startup (`electron/startupHelper.ts` + `app.setLoginItemSettings` / `SettingsDialog.tsx` + NSIS `runAfterFinish` / uninstall cleanup): Minimize/Close to Tray with localized context menu (Show, Open Downloads, Quit), safe dev/packaged Launch at Windows Startup args, and automatic cleanup of stale bare `electron.exe` Run entries.
  - [x] Clipboard Monitor (`electron/clipboardWatcher.ts`): toggleable direct-download URL detection with deduplication and quick download suggestion banner.
  - [x] Browser Extension & Secure Local Receiver (`electron/extensionBridge.ts` + `extension/` Manifest V3): `127.0.0.1:47832` HTTP bridge with origin/header validation, `/api/status` port/enabled/language discovery, automatic extension port & language sync, `chrome.alarms` keepalive (`syncBridgeConnection`) + popup auto-refresh polling, MV3 `chrome.storage.local` cooldown/state persistence, 5s URL deduplication cooldown, `Referer`/`User-Agent`/`Cookie` forwarding to `aria2`, Chrome/Edge/Brave MV3 download interception (`chrome.downloads.onDeterminingFilename`) with tracking/noise filtering, `confirmBeforeSend` prompt option, bilingual popup UI with direct URL sending & clear acceptance/fallback notices, graceful offline browser fallback, and Settings UI controls (`SettingsDialog.tsx`).
  - [x] Dark (default, NBRS charcoal/silver `#0B0E13`/`#171C23`/`#222831`/`#3B434D`) / light (`#F2F3F5`/`#0B0E13`) themes, bundled `Tajawal` (AR) & `Inter` (EN) fonts, and instant AR (RTL) / EN (LTR) switching.
- [x] **Phase 4: aria2 Engine Integration & Lifecycle Daemon**
  - [x] Bundle standalone Windows `aria2c.exe` binary (v1.37.0 x64) in `resources/bin/win32/aria2c.exe` with documented source (`resources/bin/win32/README.md`) and `.gitignore` coverage, plus full `IAria2Engine` Node HTTP/HTTPS Range fallback engine.
  - [x] Implement daemon process manager (`electron/aria2Manager.ts`: dynamic free localhost port, per-session random RPC secret token, `--stop-with-process`, clean shutdown on app exit).
  - [x] Build JSON-RPC 2.0 client over HTTP for `aria2c` communication (`addUri`, `tellStatus`, `forcePause`, `unpause`, `forceRemove`, `forceShutdown`).
  - [x] Implement automatic crash recovery / respawn (up to 3 retries with backoff) and `resolveDownloadTargetDir` / `setDownloadTargetDirResolver` hook for future sequence grouping.

- [x] **Phase 5: Download Manager Core & State Engine** (core done; global speed throttling deferred)
  - [x] Build download addition dialog (`AddDownloadDialog.tsx`: URL input, subfolder destination picker inside `D:\Ai\antigravity\nbrsflow_downloads_test`, optional custom file name).
  - [x] Implement real-time task monitoring (progress percentage, completed/total size, instant speed, ETA, clear error messages, suspicious small/HTML-error-page completion warnings, and live status bar `aria2: Connected (v1.37.0)`).
  - [x] Implement task controls (Pause, Resume, Refresh URL, Duplicate Check, After-Download Actions, Battery/Lite Mode, Batch/Filter Links, Cancel/Remove, Open completed file, Show in folder) and atomic persistence in `downloads.json`.
  - [x] Implement global speed throttling (`max-overall-download-limit`) and concurrent task limits (`max-concurrent-downloads`) via `aria2.changeGlobalOption` and `SettingsDialog.tsx`.
  - [x] Set default download directory to `D:\Ai\antigravity\nbrsflow_downloads_test` with subfolder selection support, customizable Default Download Folder in Settings (`showOpenDialog`), `allowOpenDownloadsOutsideRoot` toggle for opening/revealing verified downloads outside the current root, and External/Legacy folder open & organize support.

- [x] **Phase 6: Interactive File Explorer Engine** (done; Windows-native thumbnails/sorting options deferred)
  - [x] Node.js file system navigation driver, virtualization-free grid/list views, and per-pane navigation bar (Back / Forward / Up history, `Alt+Left`/`Alt+Right` & mouse side buttons, interactive breadcrumb, copy path) in single and Dual-Pane modes.
  - [x] File actions: Open, Reveal in Explorer, Rename (F2), Batch Rename, Quick Preview (Space), Quick Undo (Ctrl+Z), Compare/Highlight Duplicates, Delete to Recycle Bin (`shell.trashItem`), Move (dialog + drag & drop with toggle), Smart `.zip` extract.
  - [x] Real folder sizes shown next to folders (`calculateFolderSize`).
  - [x] Live file watcher (`fs.watch` recursive, debounced) refreshing the explorer and the folder tree.
  - [x] Drag & drop to tree folders, explorer folders, and between dual panes with drop highlight; context menu (AR/EN); keyboard shortcuts (F2, Delete, Enter, Backspace, Ctrl+A, First-Letter Cycling AR/EN).
  - [x] Security: every path validated against the root incl. symlink/junction escape and zip-slip; automated tests (`npm run test:fs`, `npm run test:e2e`).
  - [x] New / Resume Marker (`openedAt`, `lastOpenedChildRelPath`, `unopenedFiles` in `MetadataStore`) with `New` / `Last opened` badges, smart folder textual badges (`مكتمل` / `Complete`, `محدّث` / `Updated` clearing on open, `!` duplicate indicator) in `ExplorerPane`, and mark/reset Context Menu actions.
  - [x] Streaming Checksum Verification (`computeFileHashes` SHA-256 & MD5 + `ChecksumDialog.tsx` with quick copy & reference comparison).
  - [x] Disk Space Guard (`checkDiskSpace`, configurable `minFreeDiskSpaceBytes` defaulting to 2 GB, live warnings in `StatusBar` and `DownloadsPanel`).
  - [x] Virtualized lists & grid rendering for large folders (`ExplorerPane.tsx`).
- [x] **Phase 7: Smart File Grouping & Sequence Detection**
  - [x] Develop regex/heuristic normalizer (`electron/sequenceOrganizer.ts` — `normalizeTitle`) stripping resolutions, codecs, release tags, and brackets while detecting English & Arabic sequence markers (`S01E01`, `Ep.01`, `Part 1`, `الحلقة 1`, `الحلقة الأولى`, `الجزء 1`, `.part1.rar`, `- 01`, `(03)`).
  - [x] Hook automatic & retroactive sequence routing into `resolveDownloadTargetDir` (`resolveAutoOrganizedDownloadDir`), moving prior matching files into `<root>/<normalizedTitle>` while preserving their metadata via `store.moveKey`, grouping resolution/single-digit variants, re-checking on download completion, and auto-cleaning emptied `autoCreated` folders.
  - [x] Support on-demand directory sequence organization (`organizeDirectorySequences` / `files.organizeSequences`) and post-download completion organization.
  - [x] Add user toggle for `autoOrganizeEnabled` (default `true`) and on-demand organize button in `TopBar.tsx`, plus auto-grouped folder badge (`📁 <folder>`) in `DownloadsPanel.tsx`.
  - [x] Detect final-episode `end` suffix (`E12end`, `12 end`, `الحلقة 12 end`), verify `1..N` completeness (`inspectSeriesCompletion`), show `مكتمل` / `Complete` badge on completed folders, and add `autoMoveCompletedSeries` option (default `false`).

- [x] **Phase 8: Folder Coloring & Visual Tagging System**
  - [x] Design visual color palette picker and tagging interface for folders (7-color palette + default + content-based suggestion in Context Menu).
  - [x] Build local metadata store (`MetadataStore` v2) keyed by relative paths with automatic sync on rename, move, and trash.
  - [x] Render custom Windows-style layered folder icons (`FolderIcon.tsx`), color badges, free-form user-created folder tags (no hardcoded presets) rendered on folder icons with `groupFoldersByTag` option (default `false`), and summary note indicators in both sidebar tree and file explorer views.
  - [x] Support auto-color rule based on dominant folder content (`autoColor` toggle in TopBar) and search across item names and saved summaries.

- [ ] **Phase 9: Quick Hover Summaries & Media Preview Engine** (hover summaries + `.zip` archive listing + download provenance done; media metadata & `.rar`/`.7z` pending)
  - [x] Implement non-intrusive floating hover card (`HoverCard`) with 350ms delay showing item name, full multi-line summary, size, and modified date.
  - [ ] Extract and display media metadata (video resolution/duration, audio bitrate/cover art, image dimensions).
  - [x] Inspect compressed archives (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.xz`, `.tgz`) in Quick Preview (`readFilePreview` + `QuickPreviewModal`) and extract directly (`folder` / `here`) with configurable post-extract actions (`keep` / `trash` / `move_to_archive`).
  - [x] Show download provenance (original URL and download date in `QuickPreviewModal`) if downloaded via nbrsflow.

- [x] **Phase 10: Smart Shortcut & Acronym Matching Search Bar** (alias & acronym engine + folder alias dialog + search + global command palette done)
  - [x] Build global command palette (`Ctrl+K` / `Ctrl+P` in `CommandPalette.tsx` for quick actions, folders, and aliases).
  - [x] Implement acronym & alias generation and matching algorithm (`generateTitleAliases` & `matchTitleOrAlias` in `electron/sequenceOrganizer.ts`, matching EN acronyms like `GT` → `Golden Time` and AR acronyms/phonetics like `جي تي` / `ج ت` / `جت` → `جولد تايم`).
  - [x] Persist folder aliases (`aliases: string[]`) in `MetadataStore` (`getAliases`, `setAliases`, `addAlias`, `removeAlias`) with Arabic hamza/taa-marbuta/case comparison normalization and automatic sync on rename/move.
  - [x] Add "Manage aliases / shortcuts" dialog (`AliasesDialog.tsx`) in folder Context Menu, display matched alias in download badge (`📁 Folder (Alias)`), and match folder aliases in the TopBar search filter.

- [x] **Phase 11: Local Storage & Persistence Layer** (atomic JSON store done; export/import backup deferred)
  - [x] Structured atomic JSON store (`MetadataStore` v2 + `downloads.json` + `settings.json`).
  - [x] Persist completed download history, active/paused sessions, and interrupted tasks.
  - [x] Persist folder coloring, summaries, aliases, New/Resume markers, and user preferences.
  - [ ] Implement database export/import and automated backup mechanism (deferred).

- [x] **Phase 12: Production Packaging, Windows Installer & GitHub Release** (Windows x64 NSIS, unpacked `.exe` & official brand `.ico` built & verified; GitHub Actions deferred)
  - [x] Configure `electron-builder` for Windows x64 (`nsis`) with `extraResources` bundling `resources/bin/win32/aria2c.exe`, `extension/`, and `resources/brand/`.
  - [x] Build unpacked executable (`release\win-unpacked\nbrsflow.exe`) and NSIS installer (`release\nbrsflow-setup-0.2.12.exe`), verified in packaged mode (`app.isPackaged === true`).
  - [x] Update comprehensive bilingual `README.md`, `CHANGELOG.md`, `LICENSE` + third-party `aria2` notice, and verify `.gitignore` excludes `dist/`, `dist-electron/`, `release/`, `out/`, and `*.exe` (pushed `Release v0.2.12` to `https://github.com/taalkhalaf/nbrsflow.git` on `origin/main` and published GitHub Release `https://github.com/taalkhalaf/nbrsflow/releases/tag/v0.2.12` with `nbrsflow-setup-0.2.12.exe`).
  - [x] In-app GitHub Releases update checker & one-click auto-updater (`electron/appUpdater.ts`, `TopBar.tsx`, `SettingsDialog.tsx`, `App.tsx`).
  - [x] Integrate official `nbrsflow_brand_package` `.ico`/`.png` application, tray, extension, and NSIS installer icons (GitHub Actions automated release workflow deferred).
