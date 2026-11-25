import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { buildLoginItemOptions, sanitizeWindowsRunRegistry } from './startupHelper';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MetadataStore } from './storage/metadataStore';
import * as ops from './fsOps';
import { suggestFolderColor } from './autoColor';
import { Aria2Manager, classifyFileCategory, isWithinScheduleWindow, setDownloadTargetDirResolver } from './aria2Manager';
import { ClipboardMonitor } from './clipboardWatcher';
import { DEFAULT_EXTENSION_PORT, ExtensionBridgeServer, normalizeExtensionPort } from './extensionBridge';
import { TrayManager } from './trayManager';
import { AppUpdater } from './appUpdater';
import {
  buildRecoveryDataUrl,
  clearGpuCrashFlag,
  clearStaleCachesOnVersionChange,
  markGpuCrash,
  shouldDisableHardwareAcceleration
} from './windowRecovery';
import {
  cleanupEmptyAutoCreatedDirs,
  generateTitleAliases,
  groupFoldersByTagInRoot,
  moveCompletedSeriesFolders,
  normalizeTitle,
  organizeDirectorySequences,
  resolveAutoOrganizedDownloadDir
} from './sequenceOrganizer';
import type { DiskSpace, FileEntry, FolderNode } from '../src/types/files';
import type { AppSettings, CategoryDirKey } from '../src/types/metadata';

const DEV_DOWNLOAD_DIR = 'D:\\Ai\\antigravity\\nbrsflow_downloads_test';
function getDefaultDownloadDir(): string {
  return app.isPackaged
    ? path.join(app.getPath('downloads'), 'nbrsflow')
    : DEV_DOWNLOAD_DIR;
}
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const isDev = !app.isPackaged;

function resolveAppVersion(): string {
  for (const candidate of [
    path.join(app.getAppPath(), 'package.json'),
    path.resolve(__dirname, '..', '..', 'package.json')
  ]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: string };
      if (pkg?.version) return pkg.version;
    } catch { /* try next */ }
  }
  return app.getVersion();
}

const APP_VERSION = resolveAppVersion();

let store: MetadataStore;
let aria2: Aria2Manager;
let clipMonitor: ClipboardMonitor | null = null;
let extensionBridge: ExtensionBridgeServer | null = null;
let trayManager: TrayManager | null = null;
let updater: AppUpdater | null = null;

function resolveExtensionPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'extension')
    : path.resolve(__dirname, '..', '..', 'extension');
}
function resolveBrandAsset(fileName: string): string | undefined {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'brand', fileName)
    : path.resolve(__dirname, '..', '..', 'resources', 'brand', fileName);
  return fs.existsSync(candidate) ? candidate : undefined;
}
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

process.on('unhandledRejection', (reason) => {
  console.error('[nbrsflow] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[nbrsflow] Uncaught exception:', err);
});

type UndoAction =
  | { kind: 'move' | 'organize'; moves: { from: string; to: string }[] }
  | { kind: 'rename'; renames: { from: string; to: string }[] };
const undoStack: UndoAction[] = [];
function pushUndo(action: UndoAction): void {
  undoStack.push(action);
  if (undoStack.length > 20) undoStack.shift();
}

function effectiveDownloadOptions(s: AppSettings): { maxConcurrentDownloads: number; maxDownloadSpeedKbps: number } {
  const baseConc = s.maxConcurrentDownloads ?? 0;
  let baseSpeed = s.maxDownloadSpeedKbps ?? 0;
  if (s.scheduleEnabled && isWithinScheduleWindow(new Date(), s.scheduleStartTime, s.scheduleEndTime)) {
    const schedSpeed = s.scheduleSpeedKbps ?? 0;
    if (schedSpeed > 0) {
      baseSpeed = baseSpeed > 0 ? Math.min(baseSpeed, schedSpeed) : schedSpeed;
    }
  }
  if (!s.batteryLiteMode) {
    return { maxConcurrentDownloads: baseConc, maxDownloadSpeedKbps: baseSpeed };
  }
  return {
    maxConcurrentDownloads: baseConc > 0 ? Math.min(2, baseConc) : 2,
    maxDownloadSpeedKbps: baseSpeed > 0 ? Math.min(512, baseSpeed) : 512
  };
}

let explorerRootDir: string | null = null;

/** Default downloads root configured in Settings. */
const downloadRoot = (): string => path.resolve(store.getSettings().downloadDir);

/** Roots the renderer is allowed to read through the file API. */
function allowedRoots(): string[] {
  const roots = [downloadRoot()];
  if (explorerRootDir) roots.unshift(explorerRootDir);
  const catDirs = store?.getSettings().categoryDirs ?? {};
  for (const d of Object.values(catDirs)) {
    if (typeof d === 'string' && d.trim()) {
      const abs = path.resolve(d.trim());
      if (!roots.some((r) => r.toLowerCase() === abs.toLowerCase())) roots.push(abs);
    }
  }
  return roots;
}

const rootDir = (): string => explorerRootDir || downloadRoot();

/** Validates a path against the active explorer root (incl. junction/symlink escape). */
function assertAllowed(target: string): string {
  return ops.resolveInside(rootDir(), target);
}

/** Validates a path against any active root (explorerRootDir or default downloadRoot). */
function assertAllowedInAnyRoot(target: string): string {
  for (const r of allowedRoots()) {
    try {
      return ops.resolveInside(r, target);
    } catch { /* try next root */ }
  }
  throw new Error('Access denied: path is outside the allowed folder');
}

/** Resolves a download file path, falling back to searching by filename or verified download records outside root. */
function resolveExistingDownloadPath(requestedPath: string): string {
  const absReq = path.resolve(requestedPath);
  let safe: string | null = null;
  try {
    safe = assertAllowedInAnyRoot(absReq);
  } catch {
    if (store.getSettings().allowOpenDownloadsOutsideRoot !== false) {
      const tracked = aria2?.listDownloads() ?? [];
      const absLower = absReq.toLowerCase();
      const verified = tracked.find((d) => {
        const fp = path.resolve(d.filePath ? d.filePath : path.join(d.destination, d.fileName));
        return fp.toLowerCase() === absLower;
      });
      if (verified) {
        if (fs.existsSync(absReq)) return absReq;
        const baseName = path.basename(absReq);
        const destCandidate = path.join(verified.destination, baseName);
        if (fs.existsSync(destCandidate)) {
          aria2?.relocateCompletedItem(absReq, destCandidate);
          return destCandidate;
        }
      }
    }
    throw new Error('Access denied: path is outside the allowed folder');
  }
  if (fs.existsSync(safe)) return safe;

  const baseName = path.basename(safe);
  const searchRoots = allowedRoots();
  for (const sr of searchRoots) {
    const direct = path.join(sr, baseName);
    if (fs.existsSync(direct)) {
      aria2?.relocateCompletedItem(safe, direct);
      return direct;
    }
    try {
      const entries = fs.readdirSync(sr, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const subCandidate = path.join(sr, ent.name, baseName);
        if (fs.existsSync(subCandidate)) {
          aria2?.relocateCompletedItem(safe, subCandidate);
          return subCandidate;
        }
      }
    } catch { /* ignore unreadable */ }
  }
  return safe;
}

function safeStore(fn: () => void): void {
  try { fn(); } catch { /* external folder outside downloadRoot */ }
}
function ensureDownloadDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function registerIpc(): void {
  ipcMain.handle('app:ping', () => 'pong');
  ipcMain.handle('app:version', () => APP_VERSION);
  ipcMain.on('app:version-sync', (e) => { e.returnValue = APP_VERSION; });
  ipcMain.handle('window:minimize', () => { mainWindow?.minimize(); });
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => { mainWindow?.close(); });
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle('settings:get', () => {
    const s = store.getSettings();
    try {
      const loginOpts = buildLoginItemOptions({
        isPackaged: app.isPackaged,
        execPath: process.execPath,
        appPath: app.getAppPath(),
        openAtLogin: !!s.launchAtStartup,
        startHidden: true
      });
      const login = app.getLoginItemSettings({ path: loginOpts.path, args: loginOpts.args });
      if (typeof login?.openAtLogin === 'boolean' && app.isPackaged) {
        s.launchAtStartup = login.openAtLogin;
      }
    } catch { /* ignore */ }
    return s;
  });
  ipcMain.handle('settings:set', async (_e, patch: Partial<AppSettings>) => {
    const safe: Partial<AppSettings> = {};
    if (patch?.language === 'ar' || patch?.language === 'en') safe.language = patch.language;
    if (typeof patch?.downloadDir === 'string' && patch.downloadDir.trim()) {
      const resolvedDir = path.resolve(patch.downloadDir.trim());
      if (path.parse(resolvedDir).root.toLowerCase() !== resolvedDir.toLowerCase()) {
        fs.mkdirSync(resolvedDir, { recursive: true });
        if (fs.statSync(resolvedDir).isDirectory()) {
          safe.downloadDir = resolvedDir;
        }
      }
    }
    if (typeof patch?.autoColor === 'boolean') safe.autoColor = patch.autoColor;
    if (typeof patch?.autoOrganizeEnabled === 'boolean') safe.autoOrganizeEnabled = patch.autoOrganizeEnabled;
    if (typeof patch?.clipboardMonitor === 'boolean') safe.clipboardMonitor = patch.clipboardMonitor;
    if (typeof patch?.minimizeToTray === 'boolean') safe.minimizeToTray = patch.minimizeToTray;
    if (typeof patch?.showSidebar === 'boolean') safe.showSidebar = patch.showSidebar;
    if (typeof patch?.extensionEnabled === 'boolean') safe.extensionEnabled = patch.extensionEnabled;
    if (patch?.extensionPort !== undefined) safe.extensionPort = normalizeExtensionPort(patch.extensionPort);
    if (typeof patch?.maxConcurrentDownloads === 'number' && Number.isFinite(patch.maxConcurrentDownloads)) {
      safe.maxConcurrentDownloads = Math.max(0, Math.min(100, Math.round(patch.maxConcurrentDownloads)));
    }
    if (typeof patch?.maxDownloadSpeedKbps === 'number' && Number.isFinite(patch.maxDownloadSpeedKbps)) {
      safe.maxDownloadSpeedKbps = Math.max(0, Math.round(patch.maxDownloadSpeedKbps));
    }
    if (patch?.afterDownloadAction === 'notify' || patch?.afterDownloadAction === 'open_folder' || patch?.afterDownloadAction === 'sleep') {
      safe.afterDownloadAction = patch.afterDownloadAction;
    }
    if (typeof patch?.batteryLiteMode === 'boolean') safe.batteryLiteMode = patch.batteryLiteMode;
    if (typeof patch?.dragDropEnabled === 'boolean') safe.dragDropEnabled = patch.dragDropEnabled;
    if (typeof patch?.allowOpenDownloadsOutsideRoot === 'boolean') safe.allowOpenDownloadsOutsideRoot = patch.allowOpenDownloadsOutsideRoot;
    if (patch?.viewMode === 'default' || patch?.viewMode === 'downloads' || patch?.viewMode === 'files') {
      safe.viewMode = patch.viewMode;
    }
    if (typeof patch?.autoMoveCompletedSeries === 'boolean') safe.autoMoveCompletedSeries = patch.autoMoveCompletedSeries;
    if (typeof patch?.groupFoldersByTag === 'boolean') safe.groupFoldersByTag = patch.groupFoldersByTag;
    if (typeof patch?.setupCompleted === 'boolean') safe.setupCompleted = patch.setupCompleted;
    if (typeof patch?.autoCheckUpdates === 'boolean') safe.autoCheckUpdates = patch.autoCheckUpdates;
    if (patch?.afterExtractAction === 'keep' || patch?.afterExtractAction === 'trash' || patch?.afterExtractAction === 'move_to_archive') {
      safe.afterExtractAction = patch.afterExtractAction;
    }
    if (typeof patch?.dragMergeToCreateFolder === 'boolean') safe.dragMergeToCreateFolder = patch.dragMergeToCreateFolder;
    if (typeof patch?.disableHardwareAcceleration === 'boolean') {
      safe.disableHardwareAcceleration = patch.disableHardwareAcceleration;
      if (!patch.disableHardwareAcceleration) {
        clearGpuCrashFlag(app.getPath('userData'));
      }
    }
    if (patch?.categoryDirs && typeof patch.categoryDirs === 'object') {
      const validKeys = new Set<CategoryDirKey>(['downloads', 'all', 'video', 'audio', 'docs', 'archives', 'apps']);
      const nextDirs: Partial<Record<CategoryDirKey, string>> = { ...(store.getSettings().categoryDirs ?? {}) };
      for (const [k, v] of Object.entries(patch.categoryDirs)) {
        if (!validKeys.has(k as CategoryDirKey)) continue;
        const key = k as CategoryDirKey;
        if (typeof v === 'string' && v.trim()) {
          const resolved = path.resolve(v.trim());
          fs.mkdirSync(resolved, { recursive: true });
          if (fs.statSync(resolved).isDirectory()) nextDirs[key] = resolved;
        } else {
          delete nextDirs[key];
        }
      }
      safe.categoryDirs = nextDirs;
    }
    if (typeof patch?.scheduleEnabled === 'boolean') safe.scheduleEnabled = patch.scheduleEnabled;
    if (typeof patch?.scheduleStartTime === 'string') safe.scheduleStartTime = patch.scheduleStartTime.trim().slice(0, 5);
    if (typeof patch?.scheduleEndTime === 'string') safe.scheduleEndTime = patch.scheduleEndTime.trim().slice(0, 5);
    if (typeof patch?.scheduleSpeedKbps === 'number' && Number.isFinite(patch.scheduleSpeedKbps)) {
      safe.scheduleSpeedKbps = Math.max(0, Math.round(patch.scheduleSpeedKbps));
    }
    if (typeof patch?.launchAtStartup === 'boolean') {
      safe.launchAtStartup = patch.launchAtStartup;
      try {
        await sanitizeWindowsRunRegistry();
        app.setLoginItemSettings(buildLoginItemOptions({
          isPackaged: app.isPackaged,
          execPath: process.execPath,
          appPath: app.getAppPath(),
          openAtLogin: patch.launchAtStartup,
          startHidden: true
        }));
      } catch { /* ignore in restricted env */ }
    }
    if (typeof patch?.minFreeDiskSpaceBytes === 'number' && Number.isFinite(patch.minFreeDiskSpaceBytes) && patch.minFreeDiskSpaceBytes >= 0) {
      safe.minFreeDiskSpaceBytes = patch.minFreeDiskSpaceBytes;
    }
    const prevDir = rootDir();
    const updated = store.setSettings(safe);
    if (safe.downloadDir && safe.downloadDir.toLowerCase() !== prevDir.toLowerCase()) {
      explorerRootDir = null;
      startWatcher();
    }
    if (safe.language) trayManager?.refreshMenu();
    if (safe.extensionEnabled !== undefined || safe.extensionPort !== undefined) {
      await extensionBridge?.reconfigure(updated.extensionEnabled !== false, updated.extensionPort);
    }
    if (
      safe.maxConcurrentDownloads !== undefined ||
      safe.maxDownloadSpeedKbps !== undefined ||
      safe.batteryLiteMode !== undefined ||
      safe.scheduleEnabled !== undefined ||
      safe.scheduleStartTime !== undefined ||
      safe.scheduleEndTime !== undefined ||
      safe.scheduleSpeedKbps !== undefined
    ) {
      await aria2?.setGlobalOptions(effectiveDownloadOptions(updated));
    }
    const syncMoved = (oldP: string, newP: string) => {
      safeStore(() => store.moveKey(oldP, newP));
      aria2?.relocateCompletedItem(oldP, newP);
    };
    if (safe.autoMoveCompletedSeries === true) {
      await moveCompletedSeriesFolders(rootDir(), updated.language === 'ar' ? 'مكتمل' : 'Completed', syncMoved);
    }
    if (safe.groupFoldersByTag === true) {
      await groupFoldersByTagInRoot(rootDir(), (abs) => { try { return store.get(abs)?.tag; } catch { return undefined; } }, syncMoved);
    }
    return updated;
  });

  ipcMain.handle('extension:getStatus', () => (
    extensionBridge?.getStatus() ?? {
      enabled: false,
      listening: false,
      host: '127.0.0.1',
      port: DEFAULT_EXTENSION_PORT,
      extensionPath: resolveExtensionPath()
    }
  ));
  ipcMain.handle('extension:openFolder', () => {
    const p = resolveExtensionPath();
    if (fs.existsSync(p)) void shell.openPath(p);
  });

  ipcMain.handle('files:downloadDirInfo', () => {
    const p = store.getSettings().downloadDir;
    const exists = fs.existsSync(p);
    let writable = false;
    if (exists) {
      try { fs.accessSync(p, fs.constants.W_OK); writable = true; } catch { /* not writable */ }
    }
    return { path: p, exists, writable };
  });

  ipcMain.handle('files:listDirectory', async (_e, dir?: string): Promise<FileEntry[]> => {
    const target = assertAllowedInAnyRoot(dir ?? rootDir());
    const dirents = await fs.promises.readdir(target, { withFileTypes: true });
    const entries = await Promise.all(
      dirents.map(async (d): Promise<FileEntry | null> => {
        const full = path.join(target, d.name);
        try {
          const st = await fs.promises.stat(full);
          return {
            name: d.name,
            path: full,
            isDirectory: d.isDirectory(),
            size: st.size,
            modifiedMs: st.mtimeMs,
            extension: d.isDirectory() ? '' : path.extname(d.name).toLowerCase()
          };
        } catch { return null; }
      })
    );
    return entries.filter((e): e is FileEntry => e !== null);
  });

  ipcMain.handle('files:getFolderTree', async (_e, dir?: string, depth = 1): Promise<FolderNode[]> => {
    const build = async (d: string, level: number): Promise<FolderNode[]> => {
      let dirents: fs.Dirent[];
      try { dirents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return []; }
      const folders = dirents.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
      return Promise.all(folders.map(async (f) => {
        const full = path.join(d, f.name);
        let hasChildren = false;
        try { hasChildren = (await fs.promises.readdir(full, { withFileTypes: true })).some((x) => x.isDirectory()); } catch { /* unreadable */ }
        const node: FolderNode = { name: f.name, path: full, hasChildren };
        if (hasChildren && level > 1) node.children = await build(full, level - 1);
        return node;
      }));
    };
    return build(assertAllowedInAnyRoot(dir ?? rootDir()), Math.min(Math.max(Number(depth) || 1, 1), 4));
  });

  ipcMain.handle('files:getDiskSpace', async (_e, targetPath?: string): Promise<DiskSpace> => {
    const target = targetPath ? assertAllowed(targetPath) : rootDir();
    const s = await fs.promises.statfs(target);
    const bsize = Number(s.bsize) || 0;
    return { path: target, totalBytes: Number(s.blocks) * bsize, freeBytes: Number(s.bavail) * bsize };
  });

  ipcMain.handle('files:setExplorerRoot', async (_e, folderPath: string | null) => {
    if (!folderPath) {
      explorerRootDir = null;
      startWatcher();
      return downloadRoot();
    }
    const resolved = path.resolve(String(folderPath).trim());
    const st = await fs.promises.stat(resolved);
    if (!st.isDirectory()) throw new Error('Target is not a directory');
    explorerRootDir = resolved;
    startWatcher();
    return resolved;
  });

  ipcMain.handle('files:createFolder', async (_e, parent: string, name: string) => {
    const clean = String(name).trim();
    if (!clean || /[\\/:*?"<>|]/.test(clean) || clean === '.' || clean === '..') throw new Error('Invalid folder name');
    const safeParent = assertAllowed(parent);
    const target = assertAllowed(path.join(safeParent, clean));
    await fs.promises.mkdir(target);
    safeStore(() => { if (store.isAutoCreated(safeParent)) store.setAutoCreated(safeParent, false); });
    return target;
  });

  const cleanupParents = async (dirs: Iterable<string>) => {
    const seen = new Set<string>();
    for (const d of dirs) {
      const norm = path.resolve(d).toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      try {
        await cleanupEmptyAutoCreatedDirs(d, rootDir(), (p) => store.isAutoCreated(p), (p) => store.removeKey(p));
      } catch { /* external folder */ }
    }
  };

  ipcMain.handle('files:moveItems', async (_e, sources: string[], targetDir: string) => {
    const srcs = Array.isArray(sources) ? sources.map(assertAllowed) : [];
    const safeTarget = assertAllowed(targetDir);
    const oldParents = srcs.map((s) => path.dirname(s));
    const result = await ops.moveItems(rootDir(), sources, targetDir);
    const moves: { from: string; to: string }[] = [];
    safeStore(() => {
      store.batchUpdate(() => {
        result.forEach((dest, i) => {
          store.moveKey(srcs[i], dest);
          if (srcs[i] && dest && srcs[i].toLowerCase() !== dest.toLowerCase()) {
            moves.push({ from: srcs[i], to: dest });
          }
        });
        if (moves.length > 0 && store.isAutoCreated(safeTarget)) {
          store.setAutoCreated(safeTarget, false);
        }
      });
    });
    if (moves.length === 0) {
      result.forEach((dest, i) => {
        if (srcs[i] && dest && srcs[i].toLowerCase() !== dest.toLowerCase()) moves.push({ from: srcs[i], to: dest });
      });
    }
    for (const m of moves) aria2?.relocateCompletedItem(m.from, m.to);
    if (moves.length > 0) pushUndo({ kind: 'move', moves });
    await cleanupParents(oldParents);
    return result;
  });
  ipcMain.handle('files:renameItem', async (_e, p: string, name: string) => {
    const src = assertAllowed(p);
    const dest = await ops.renameItem(rootDir(), p, name);
    safeStore(() => store.moveKey(src, dest));
    aria2?.relocateCompletedItem(src, dest);
    if (src.toLowerCase() !== dest.toLowerCase()) pushUndo({ kind: 'rename', renames: [{ from: src, to: dest }] });
    return dest;
  });
  ipcMain.handle('files:batchRename', async (_e, items: { path: string; newName: string }[]) => {
    const safeItems = Array.isArray(items)
      ? items.map((x) => ({ path: assertAllowed(x.path), newName: String(x.newName ?? '') }))
      : [];
    const renamed = await ops.batchRename(rootDir(), safeItems);
    safeStore(() => store.batchUpdate(() => {
      for (const r of renamed) store.moveKey(r.from, r.to);
    }));
    for (const r of renamed) aria2?.relocateCompletedItem(r.from, r.to);
    if (renamed.length > 0) pushUndo({ kind: 'rename', renames: renamed });
    return renamed;
  });
  ipcMain.handle('files:readPreview', (_e, p: string) => {
    const safe = assertAllowedInAnyRoot(p);
    const safeLower = safe.toLowerCase();
    const match = aria2?.listDownloads().find((d) => {
      const fp = d.filePath ? path.resolve(d.filePath) : path.join(d.destination, d.fileName);
      return fp.toLowerCase() === safeLower;
    });
    const provenance = match ? { url: match.url, downloadedAt: match.createdAt } : undefined;
    const ownerRoot = allowedRoots().find((r) => {
      try { ops.resolveInside(r, safe); return true; } catch { return false; }
    }) ?? rootDir();
    return ops.readFilePreview(ownerRoot, safe, provenance);
  });
  ipcMain.handle('files:canUndo', () => undoStack.length > 0);
  ipcMain.handle('files:undo', async () => {
    const action = undoStack.pop();
    if (!action) return { undone: false, count: 0 };
    let count = 0;
    if (action.kind === 'rename') {
      for (const r of [...action.renames].reverse()) {
        if (fs.existsSync(r.to) && !fs.existsSync(r.from)) {
          const dest = await ops.renameItem(rootDir(), r.to, path.basename(r.from));
          store.moveKey(r.to, dest);
          aria2?.relocateCompletedItem(r.to, dest);
          count++;
        }
      }
      return { undone: count > 0, kind: 'rename', count };
    }
    const createdDirs = new Set<string>();
    const extAutoDirs = new Set<string>();
    for (const m of [...action.moves].reverse()) {
      if (fs.existsSync(m.to) && !fs.existsSync(m.from)) {
        const parentDir = path.dirname(m.to);
        createdDirs.add(parentDir);
        if (!parentDir.toLowerCase().startsWith(rootDir().toLowerCase() + path.sep)) {
          extAutoDirs.add(parentDir);
        }
        await fs.promises.mkdir(path.dirname(m.from), { recursive: true });
        await fs.promises.rename(m.to, m.from);
        try { store.moveKey(m.to, m.from); } catch { /* external folder */ }
        aria2?.relocateCompletedItem(m.to, m.from);
        count++;
      }
    }
    await cleanupParents(createdDirs);
    for (const d of extAutoDirs) {
      try {
        if ((await fs.promises.readdir(d)).length === 0) await fs.promises.rmdir(d);
      } catch { /* ignore */ }
    }
    return { undone: count > 0, kind: action.kind, count };
  });
  ipcMain.handle('files:deleteItems', async (_e, paths: string[]) => {
    if (!Array.isArray(paths)) return 0;
    const safe = paths.map((p) => {
      const r = assertAllowed(p);
      if (r.toLowerCase() === rootDir().toLowerCase()) throw new Error('Operation not allowed on the root folder');
      return r;
    });
    const oldParents = safe.map((p) => path.dirname(p));
    for (const p of safe) await shell.trashItem(p);
    safeStore(() => store.batchUpdate(() => {
      for (const p of safe) store.removeKey(p);
    }));
    await cleanupParents(oldParents);
    return safe.length;
  });
  ipcMain.handle('files:openItem', async (_e, p: string) => {
    const safe = resolveExistingDownloadPath(p);
    const err = await shell.openPath(safe);
    if (err) throw new Error(err);
    try {
      if ((await fs.promises.stat(safe)).isFile()) safeStore(() => store.markOpened(safe));
    } catch { /* ignore */ }
  });
  ipcMain.handle('files:revealInExplorer', (_e, p: string) => { shell.showItemInFolder(resolveExistingDownloadPath(p)); });
  ipcMain.handle('files:calculateFolderSize', (_e, p: string) => {
    const safe = assertAllowedInAnyRoot(p);
    const ownerRoot = allowedRoots().find((r) => {
      try { ops.resolveInside(r, safe); return true; } catch { return false; }
    }) ?? rootDir();
    return ops.calculateFolderSize(ownerRoot, safe);
  });
  ipcMain.handle('files:inspectFolderIndicators', (_e, folderPaths: string[]) => {
    return ops.inspectFolderIndicators(rootDir(), folderPaths);
  });
  ipcMain.handle('files:smartExtractArchive', async (_e, p: string, mode?: 'smart' | 'folder' | 'here') => {
    const safeArchive = assertAllowed(p);
    const out = await ops.smartExtractArchive(rootDir(), safeArchive, mode ?? 'smart');
    const parent = path.dirname(safeArchive);
    safeStore(() => { if (store.isAutoCreated(parent)) store.setAutoCreated(parent, false); });
    const afterAction = store.getSettings().afterExtractAction ?? 'keep';
    if (afterAction === 'trash') {
      try {
        await shell.trashItem(safeArchive);
        safeStore(() => store.removeKey(safeArchive));
      } catch { /* ignore if locked */ }
    } else if (afterAction === 'move_to_archive') {
      try {
        const archiveDirName = store.getSettings().language === 'en' ? 'Archives' : 'الأرشيف';
        const archiveDir = path.join(rootDir(), archiveDirName);
        await fs.promises.mkdir(archiveDir, { recursive: true });
        if (path.dirname(safeArchive).toLowerCase() !== archiveDir.toLowerCase()) {
          const [movedArchive] = await ops.moveItems(rootDir(), [safeArchive], archiveDir);
          if (movedArchive) {
            safeStore(() => store.moveKey(safeArchive, movedArchive));
            aria2?.relocateCompletedItem(safeArchive, movedArchive);
          }
        }
      } catch { /* ignore */ }
    }
    return out;
  });
  ipcMain.handle('files:getThumbnail', (_e, p: string) => {
    const safe = assertAllowedInAnyRoot(p);
    const ownerRoot = allowedRoots().find((r) => {
      try { ops.resolveInside(r, safe); return true; } catch { return false; }
    }) ?? rootDir();
    return ops.getThumbnail(ownerRoot, safe);
  });
  ipcMain.handle('files:mergeToFolder', async (_e, sources: string[], targetFile: string) => {
    const r = rootDir();
    const safeTarget = assertAllowed(targetFile);
    const parent = path.dirname(safeTarget);
    const baseStem = normalizeTitle(path.basename(safeTarget)).normalizedTitle || path.basename(safeTarget, path.extname(safeTarget)) || 'Group';
    const newFolder = ops.uniquePath(parent, ops.validateName(baseStem));
    await fs.promises.mkdir(newFolder, { recursive: true });
    const toMove = Array.from(new Set([safeTarget, ...sources.map((s) => assertAllowed(s))]));
    const moved = await ops.moveItems(r, toMove, newFolder);
    const movePairs = moved.map((dest, i) => ({ from: toMove[i], to: dest }));
    safeStore(() => {
      for (const m of movePairs) store.moveKey(m.from, m.to);
    });
    for (const m of movePairs) aria2?.relocateCompletedItem(m.from, m.to);
    if (movePairs.length > 0) pushUndo({ kind: 'move', moves: movePairs });
    return newFolder;
  });
  ipcMain.handle('files:computeHashes', (_e, p: string) => ops.computeFileHashes(rootDir(), p));
  ipcMain.handle('files:organizeSequences', async (_e, dir?: string) => {
    const orgMoves: { from: string; to: string }[] = [];
    const res = await store.batchUpdateAsync(() =>
      organizeDirectorySequences(rootDir(), assertAllowed(dir ?? rootDir()), {
        language: store.getSettings().language,
        getFolderAliases: (p) => { try { return store.getAliases(p); } catch { return []; } },
        onRegisterDefaultAliases: (p, defaults) => {
          safeStore(() => { if (store.getAliases(p).length === 0) store.setAliases(p, defaults); });
        },
        onFolderAutoCreated: (p) => safeStore(() => store.setAutoCreated(p, true)),
        onMoved: (oldP, newP) => {
          safeStore(() => {
            store.moveKey(oldP, newP);
            if (!store.get(newP)?.openedAt) store.markFolderHasNewFile(newP);
          });
          aria2?.relocateCompletedItem(oldP, newP);
          orgMoves.push({ from: oldP, to: newP });
        }
      })
    );
    if (orgMoves.length > 0) pushUndo({ kind: 'organize', moves: orgMoves });
    return res;
  });
  ipcMain.handle('files:pickFolder', async () => {
    const res = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });
  ipcMain.handle('files:organizeExternalFolder', async (_e, folderPath: string) => {
    const resolved = path.resolve(String(folderPath ?? '').trim());
    if (!resolved || path.parse(resolved).root.toLowerCase() === resolved.toLowerCase()) {
      throw new Error('Cannot organize a drive root');
    }
    const st = await fs.promises.stat(resolved);
    if (!st.isDirectory()) throw new Error('Target is not a directory');

    const orgMoves: { from: string; to: string }[] = [];
    const res = await organizeDirectorySequences(resolved, resolved, {
      onMoved: (oldP, newP) => {
        try { store.moveKey(oldP, newP); } catch { /* external folder */ }
        aria2?.relocateCompletedItem(oldP, newP);
        orgMoves.push({ from: oldP, to: newP });
      }
    });
    if (orgMoves.length > 0) pushUndo({ kind: 'organize', moves: orgMoves });
    return { ...res, folderPath: resolved };
  });

  ipcMain.handle('meta:getAll', () => store.getAll());
  ipcMain.handle('meta:setFolderColor', (_e, p: string, color: string | null) => store.setColor(assertAllowed(p), color));
  ipcMain.handle('meta:setTag', async (_e, p: string, tag: string | null) => {
    const safePath = assertAllowed(p);
    const updatedMeta = store.setTag(safePath, tag);
    if (tag && store.getSettings().groupFoldersByTag === true) {
      await groupFoldersByTagInRoot(
        rootDir(),
        (abs) => { try { return store.get(abs)?.tag; } catch { return undefined; } },
        (oldP, newP) => { safeStore(() => store.moveKey(oldP, newP)); aria2?.relocateCompletedItem(oldP, newP); }
      );
    }
    return updatedMeta;
  });
  ipcMain.handle('meta:setSummary', (_e, p: string, s: string | null) => store.setSummary(assertAllowed(p), s));
  ipcMain.handle('meta:getAliases', (_e, p: string) => store.getAliases(assertAllowed(p)));
  ipcMain.handle('meta:setAliases', (_e, p: string, aliases: string[]) => store.setAliases(assertAllowed(p), aliases));
  ipcMain.handle('meta:addAlias', (_e, p: string, alias: string) => store.addAlias(assertAllowed(p), String(alias)));
  ipcMain.handle('meta:removeAlias', (_e, p: string, alias: string) => store.removeAlias(assertAllowed(p), String(alias)));
  ipcMain.handle('meta:suggestAliases', (_e, pathOrTitle: string) => {
    const title = path.basename(String(pathOrTitle ?? ''));
    return generateTitleAliases(title);
  });
  ipcMain.handle('meta:markOpened', (_e, p: string) => store.markOpened(assertAllowed(p)));
  ipcMain.handle('meta:resetAsNew', (_e, p: string) => store.resetAsNew(assertAllowed(p)));
  ipcMain.handle('meta:suggestColors', async (_e, paths: string[]) => {
    const out: Record<string, string> = {};
    for (const p of (Array.isArray(paths) ? paths : []).slice(0, 300)) {
      try {
        const abs = assertAllowed(p);
        if (!(await fs.promises.stat(abs)).isDirectory()) continue;
        const c = await suggestFolderColor(abs);
        if (c) out[abs.toLowerCase()] = c;
      } catch { /* skip */ }
    }
    return out;
  });
  ipcMain.handle('meta:setShortcut', (_e, a: string, t: string | null) => store.setShortcut(String(a), t));
  ipcMain.handle('meta:getShortcuts', () => store.getShortcuts());

  ipcMain.handle('downloads:list', () => aria2.listDownloads());
  ipcMain.handle('downloads:engineState', () => aria2.getState());
  ipcMain.handle('downloads:add', (_e, url: string, targetDir?: string, fileName?: string) => aria2.addDownload(url, targetDir, fileName));
  ipcMain.handle('downloads:pause', (_e, id: string) => aria2.pauseDownload(String(id)));
  ipcMain.handle('downloads:resume', (_e, id: string) => aria2.resumeDownload(String(id)));
  ipcMain.handle('downloads:refreshUrl', (_e, id: string, newUrl: string) => aria2.refreshDownloadUrl(String(id), String(newUrl)));
  ipcMain.handle('downloads:cancel', (_e, id: string, removeFile?: boolean) => aria2.cancelDownload(String(id), !!removeFile));
  ipcMain.handle('downloads:setNote', (_e, id: string, note: string) => aria2.setTaskNote(String(id), String(note ?? '')));
  ipcMain.handle('downloads:export', () => aria2.exportDownloads());
  ipcMain.handle('downloads:import', (_e, jsonText: string) => aria2.importDownloads(String(jsonText ?? '')));
  ipcMain.handle('downloads:checkDuplicate', (_e, url: string, targetDir?: string, fileName?: string) => aria2.checkDuplicate(url, targetDir, fileName));
  ipcMain.handle('downloads:checkDiskSpace', (_e, requiredBytes?: number) => aria2.checkDiskSpace(requiredBytes));
  ipcMain.handle('system:sleep', () => {
    if (process.platform === 'win32') {
      execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { windowsHide: true }, () => { /* ignore */ });
    }
  });
  ipcMain.handle('updater:getState', () => updater?.getState() ?? { status: 'idle', currentVersion: APP_VERSION });
  ipcMain.handle('updater:check', () => updater?.checkForUpdates() ?? { status: 'idle', currentVersion: APP_VERSION });
  ipcMain.handle('updater:downloadAndInstall', () => updater?.downloadAndInstall() ?? { status: 'error', currentVersion: APP_VERSION });
}

let watcher: fs.FSWatcher | null = null;
let watchTimer: NodeJS.Timeout | null = null;
const pendingChangedPaths = new Set<string>();

/** Watch the download root (recursive) and tell the renderer to refresh, debounced & ignoring active temp writes. */
function startWatcher(): void {
  watcher?.close();
  pendingChangedPaths.clear();
  const dir = rootDir();
  try {
    watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      const rel = typeof filename === 'string' ? filename : '';
      if (rel && /\.(aria2|tmp)$/i.test(rel)) return;

      const activeItems = aria2?.listDownloads().filter((d) => d.status === 'active') ?? [];
      if (rel && eventType === 'change' && activeItems.length > 0) {
        const absLower = path.resolve(dir, rel).toLowerCase();
        if (activeItems.some((d) => d.filePath && path.resolve(d.filePath).toLowerCase() === absLower)) {
          return;
        }
      }

      if (rel) pendingChangedPaths.add(path.resolve(dir, rel));
      if (watchTimer) clearTimeout(watchTimer);
      const delay = eventType === 'change' && activeItems.length > 0 ? 1200 : 250;
      watchTimer = setTimeout(() => {
        const changed = [...pendingChangedPaths];
        pendingChangedPaths.clear();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('fs:changed', changed);
        }
      }, delay);
    });
    watcher.on('error', () => { /* root removed or unreadable: ignore */ });
  } catch (e) {
    console.error('File watcher failed to start:', e);
  }
}

function loadAppContent(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (isDev) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
}

function createWindow(): void {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    autoHideMenuBar: true,
    icon: resolveBrandAsset('nbrsflow.ico') ?? resolveBrandAsset('nbrsflow_256.png'),
    backgroundColor: '#0B0E13',
    title: `nbrsflow v${APP_VERSION}`,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);

  const startedHidden = process.argv.includes('--startup') && !!store.getSettings().minimizeToTray;
  let loadRetries = 0;
  let rendererCrashTimestamps: number[] = [];

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('window:maximized', false);
  });

  mainWindow.once('ready-to-show', () => {
    if (!startedHidden && mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  // Safety net: never leave the window stuck invisible if ready-to-show is delayed
  const showFallbackTimer = setTimeout(() => {
    if (!startedHidden && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 4500);

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    console.error(`[nbrsflow] did-fail-load (${errorCode}): ${errorDescription}`);
    if (loadRetries < 1 && mainWindow && !mainWindow.isDestroyed()) {
      loadRetries++;
      setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) loadAppContent(mainWindow); }, 400);
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      const lang = store?.getSettings().language === 'en' ? 'en' : 'ar';
      void mainWindow.loadURL(buildRecoveryDataUrl(lang, `did-fail-load (${errorCode}): ${errorDescription}`));
      if (!startedHidden) mainWindow.show();
    }
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    console.error(`[nbrsflow] render-process-gone: ${details.reason} (exitCode=${details.exitCode})`);
    const now = Date.now();
    rendererCrashTimestamps = rendererCrashTimestamps.filter((ts) => now - ts < 30000);
    rendererCrashTimestamps.push(now);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (rendererCrashTimestamps.length <= 2) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          loadAppContent(mainWindow);
          if (!startedHidden) mainWindow.show();
        }
      }, 250);
    } else {
      const lang = store?.getSettings().language === 'en' ? 'en' : 'ar';
      void mainWindow.loadURL(buildRecoveryDataUrl(lang, `render-process-gone: ${details.reason}`));
      if (!startedHidden) mainWindow.show();
    }
  });

  mainWindow.on('unresponsive', () => {
    console.warn('[nbrsflow] mainWindow became unresponsive');
  });

  mainWindow.on('minimize', () => {
    if (store.getSettings().minimizeToTray) {
      mainWindow?.hide();
    }
  });
  mainWindow.on('close', (e) => {
    if (!isQuitting && store.getSettings().minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isDev ? !url.startsWith(DEV_URL) : !url.startsWith('file://') && !url.startsWith('data:text/html')) {
      e.preventDefault();
    }
  });

  loadAppContent(mainWindow);

  mainWindow.on('closed', () => {
    clearTimeout(showFallbackTimer);
    mainWindow = null;
  });
}

if (process.env.NBRS_USER_DATA_DIR) {
  app.setPath('userData', process.env.NBRS_USER_DATA_DIR);
}
clearStaleCachesOnVersionChange(app.getPath('userData'), APP_VERSION);
if (shouldDisableHardwareAcceleration(app.getPath('userData'), process.argv)) {
  app.disableHardwareAcceleration();
}

let gpuRecoveryReloadCount = 0;
app.on('child-process-gone', (_e, details) => {
  if (details.type !== 'GPU' || details.reason === 'clean-exit') return;
  console.error(`[nbrsflow] GPU process gone: ${details.reason} (exitCode=${details.exitCode})`);
  markGpuCrash(app.getPath('userData'), details.reason);
  if (gpuRecoveryReloadCount < 2 && mainWindow && !mainWindow.isDestroyed()) {
    gpuRecoveryReloadCount++;
    mainWindow.webContents.reloadIgnoringCache();
  }
});
const gotLock = process.env.NBRS_E2E === '1' ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    store = new MetadataStore(app.getPath('userData'), {
      language: 'ar',
      downloadDir: getDefaultDownloadDir(),
      autoColor: false,
      autoOrganizeEnabled: true,
      clipboardMonitor: true,
      launchAtStartup: false,
      minimizeToTray: false,
      extensionEnabled: true,
      extensionPort: DEFAULT_EXTENSION_PORT,
      showSidebar: true,
      maxConcurrentDownloads: 0,
      maxDownloadSpeedKbps: 0,
      afterDownloadAction: 'notify',
      batteryLiteMode: false,
      dragDropEnabled: true,
      allowOpenDownloadsOutsideRoot: true,
      disableHardwareAcceleration: false,
      viewMode: 'default',
      autoMoveCompletedSeries: false,
      groupFoldersByTag: false,
      minFreeDiskSpaceBytes: 2 * 1024 * 1024 * 1024
    });
    ensureDownloadDir(store.getSettings().downloadDir);
    void sanitizeWindowsRunRegistry().then(() => {
      if (store.getSettings().launchAtStartup) {
        try {
          app.setLoginItemSettings(buildLoginItemOptions({
            isPackaged: app.isPackaged,
            execPath: process.execPath,
            appPath: app.getAppPath(),
            openAtLogin: true,
            startHidden: true
          }));
        } catch { /* ignore */ }
      }
    });
    const syncRelocated = (oldP: string, newP: string) => {
      store.moveKey(oldP, newP);
      aria2?.relocateCompletedItem(oldP, newP);
    };
    const registerDefaultsIfEmpty = (folderPath: string, defaults: string[]) => {
      if (store.getAliases(folderPath).length === 0) {
        store.setAliases(folderPath, defaults);
      }
    };
    const markFolderAutoCreated = (folderPath: string) => {
      store.setAutoCreated(folderPath, true);
    };
    setDownloadTargetDirResolver(async (req) => {
      const decision = await resolveAutoOrganizedDownloadDir({
        ...req,
        language: store.getSettings().language,
        isAutoOrganizeEnabled: () => store.getSettings().autoOrganizeEnabled !== false,
        getTrackedDownloads: () => aria2?.listDownloads() ?? [],
        getFolderAliases: (p) => store.getAliases(p),
        onRegisterDefaultAliases: registerDefaultsIfEmpty,
        onFolderAutoCreated: markFolderAutoCreated,
        onRetroactiveMove: syncRelocated
      });
      return { targetDir: decision.targetDir, matchedAlias: decision.matchedAlias };
    });
    const initDlOpts = effectiveDownloadOptions(store.getSettings());
    aria2 = new Aria2Manager({
      storageDir: app.getPath('userData'),
      getRootDir: downloadRoot,
      appVersion: APP_VERSION,
      maxConcurrentDownloads: initDlOpts.maxConcurrentDownloads,
      maxDownloadSpeedKbps: initDlOpts.maxDownloadSpeedKbps,
      getMinFreeDiskBytes: () => store.getSettings().minFreeDiskSpaceBytes ?? 2 * 1024 * 1024 * 1024,
      getCategoryDir: (fileName) => {
        const dirs = store.getSettings().categoryDirs ?? {};
        const cat = classifyFileCategory(fileName);
        return (cat && dirs[cat]) || dirs.all || dirs.downloads || undefined;
      },
      onDiskWarning: (warning) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('downloads:diskWarning', warning);
        }
      },
      onFileRemoved: async (filePath) => {
        await cleanupEmptyAutoCreatedDirs(
          path.dirname(filePath),
          rootDir(),
          (p) => store.isAutoCreated(p),
          (p) => store.removeKey(p)
        );
      },
      onDownloadCompleted: async (item) => {
        if (store.getSettings().autoOrganizeEnabled === false) return;
        const destAbs = path.resolve(item.destination);
        const rootAbs = path.resolve(downloadRoot());
        if (destAbs.toLowerCase() !== rootAbs.toLowerCase() && item.filePath) {
          safeStore(() => store.markFolderHasNewFile(item.filePath!));
        }
        if (destAbs.toLowerCase() === rootAbs.toLowerCase()) {
          await organizeDirectorySequences(rootDir(), rootDir(), {
            language: store.getSettings().language,
            getFolderAliases: (p) => store.getAliases(p),
            onRegisterDefaultAliases: registerDefaultsIfEmpty,
            onFolderAutoCreated: markFolderAutoCreated,
            onMoved: syncRelocated
          });
        } else if (item.filePath && fs.existsSync(item.filePath) && store.isAutoCreated(destAbs)) {
          // Re-check grouping if aria2 renamed the final file on completion
          const fileInfo = normalizeTitle(item.fileName);
          const dirInfo = normalizeTitle(path.basename(destAbs));
          if (fileInfo.normalizedKey && fileInfo.normalizedKey !== dirInfo.normalizedKey) {
            const decision = await resolveAutoOrganizedDownloadDir({
              url: item.url,
              fileName: item.fileName,
              rootDir: rootDir(),
              isAutoOrganizeEnabled: () => true,
              getTrackedDownloads: () => aria2?.listDownloads() ?? [],
              getFolderAliases: (p) => store.getAliases(p),
              onRegisterDefaultAliases: registerDefaultsIfEmpty,
              onFolderAutoCreated: markFolderAutoCreated,
              onRetroactiveMove: syncRelocated
            });
            if (path.resolve(decision.targetDir).toLowerCase() !== destAbs.toLowerCase()) {
              const [movedTo] = await ops.moveItems(rootDir(), [item.filePath], decision.targetDir);
              if (movedTo) syncRelocated(item.filePath, movedTo);
              await cleanupEmptyAutoCreatedDirs(destAbs, rootDir(), (p) => store.isAutoCreated(p), (p) => store.removeKey(p));
            }
          }
        }
        if (store.getSettings().autoMoveCompletedSeries === true) {
          const completedName = store.getSettings().language === 'ar' ? 'مكتمل' : 'Completed';
          await moveCompletedSeriesFolders(rootDir(), completedName, syncRelocated);
        }
        const remainingActive = aria2.listDownloads().some((d) => d.id !== item.id && (d.status === 'active' || d.status === 'queued'));
        if (!remainingActive) {
          const action = store.getSettings().afterDownloadAction ?? 'notify';
          if (action === 'open_folder') {
            void shell.openPath(item.destination);
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('downloads:allCompleted', {
              action,
              destination: item.destination,
              fileName: item.fileName
            });
          }
        }
      }
    });
    aria2.onUpdate((items, engine) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('downloads:updated', { items, engine });
      }
    });
    registerIpc();
    startWatcher();
    createWindow();
    trayManager = new TrayManager({
      iconPath: resolveBrandAsset('nbrsflow_32.png') ?? resolveBrandAsset('nbrsflow_16.png'),
      getLang: () => store.getSettings().language,
      onShow: () => {
        if (!mainWindow) createWindow();
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
      onOpenDownloads: () => { void shell.openPath(rootDir()); },
      onQuit: () => {
        isQuitting = true;
        trayManager?.destroy();
        app.quit();
      }
    });
    trayManager.start();
    void aria2.start();
    extensionBridge = new ExtensionBridgeServer({
      port: store.getSettings().extensionPort ?? DEFAULT_EXTENSION_PORT,
      enabled: store.getSettings().extensionEnabled !== false,
      appVersion: APP_VERSION,
      extensionPath: resolveExtensionPath(),
      isEngineReady: () => aria2.getState().connected,
      getLanguage: () => store.getSettings().language,
      onAddDownload: ({ url, fileName, referrer, userAgent, cookie }) =>
        aria2.addDownload(url, undefined, fileName, { referrer, userAgent, cookie }),
      onDownloadReceived: (item) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('extension:downloadReceived', {
            id: item.id,
            fileName: item.fileName,
            url: item.url,
            destination: item.destination,
            autoGroupedFolder: item.autoGroupedFolder
          });
        }
      }
    });
    void extensionBridge.start();
    clipMonitor = new ClipboardMonitor(
      () => clipboard.readText(),
      () => store.getSettings().clipboardMonitor !== false,
      (hit) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('clipboard:urlDetected', hit);
        }
      }
    );
    void clipMonitor.start();
    updater = new AppUpdater({
      currentVersion: APP_VERSION,
      repo: 'taalkhalaf/nbrsflow',
      apiBaseUrl: process.env.NBRS_UPDATE_API_URL || undefined,
      downloadDir: path.join(app.getPath('temp'), 'nbrsflow-updates'),
      onStateChange: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:state', state);
        }
      },
      launchInstaller: (installerPath) => {
        if (process.env.NBRS_E2E === '1') return;
        isQuitting = true;
        spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => { app.quit(); }, 300);
      }
    });
    if (process.env.NBRS_E2E !== '1' && process.env.NBRS_DISABLE_AUTO_UPDATE !== '1' && store.getSettings().autoCheckUpdates !== false) {
      updater.startPeriodicCheck();
    }
    const diskTimer = setInterval(() => {
      void aria2.checkDiskSpace().catch(() => undefined);
      const s = store.getSettings();
      if (s.scheduleEnabled) {
        const inWin = isWithinScheduleWindow(new Date(), s.scheduleStartTime, s.scheduleEndTime);
        void aria2.setGlobalOptions(effectiveDownloadOptions(s)).catch(() => undefined);
        if (inWin) void aria2.resumeScheduledTasks();
        else void aria2.pauseAllForSchedule();
      }
    }, 30000);
    app.on('before-quit', () => { clearInterval(diskTimer); clipMonitor?.stop(); updater?.stop(); });
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    trayManager?.destroy();
    watcher?.close();
    void extensionBridge?.stop();
    void aria2?.stop();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
