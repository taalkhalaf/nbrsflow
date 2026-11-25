import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dict, type Lang } from './i18n';
import type { Aria2EngineState, CategoryDirKey, ClipboardUrlSuggestion, ColorId, DiskSpaceWarning, DownloadItem, DuplicateCheckResult, FileEntry, ItemMeta, UpdateState, ViewMode } from './types';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import DownloadsPanel, { type DlTab } from './components/DownloadsPanel';
import ExplorerPane, { type ActionKind } from './components/ExplorerPane';
import MoveDialog from './components/MoveDialog';
import StatusBar from './components/StatusBar';
import PromptDialog from './components/PromptDialog';
import SummaryDialog from './components/SummaryDialog';
import AliasesDialog from './components/AliasesDialog';
import ChecksumDialog from './components/ChecksumDialog';
import SettingsDialog from './components/SettingsDialog';
import AddDownloadDialog from './components/AddDownloadDialog';
import BatchRenameDialog from './components/BatchRenameDialog';
import QuickPreviewModal from './components/QuickPreviewModal';
import CommandPalette, { type CommandPaletteAction } from './components/CommandPalette';
import { MetaContext, keyOf } from './lib/meta';
import { parentOf, samePath, type TypeFilter } from './lib/utils';

type Theme = 'dark' | 'light';
interface PaneHistory { stack: string[]; index: number; }
const initHist = (p = ''): PaneHistory => ({ stack: p ? [p] : [], index: p ? 0 : -1 });

export default function App() {
  const api = window.nbrsAPI;
  const [lang, setLang] = useState<Lang>('ar');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('nbrs-theme') as Theme) || 'dark');
  const [root, setRoot] = useState('');
  const [histories, setHistories] = useState<[PaneHistory, PaneHistory]>([initHist(), initHist()]);
  const [activePane, setActivePane] = useState<0 | 1>(0);
  const [dual, setDual] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [searchDownloads, setSearchDownloads] = useState(true);
  const [searchFiles, setSearchFiles] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('default');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({ visible: 0, selected: 0 });
  const [dialog, setDialog] = useState<null | 'url' | 'folder'>(null);
  const [moveSources, setMoveSources] = useState<string[] | null>(null);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [summaryPath, setSummaryPath] = useState<string | null>(null);
  const [aliasesPath, setAliasesPath] = useState<string | null>(null);
  const [checksumPath, setChecksumPath] = useState<string | null>(null);
  const [autoColor, setAutoColor] = useState(false);
  const [autoOrganize, setAutoOrganize] = useState(true);
  const [clipboardMonitor, setClipboardMonitor] = useState(true);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(0);
  const [maxDownloadSpeedKbps, setMaxDownloadSpeedKbps] = useState(0);
  const [afterDownloadAction, setAfterDownloadAction] = useState<'notify' | 'open_folder' | 'sleep'>('notify');
  const [batteryLiteMode, setBatteryLiteMode] = useState(false);
  const [dragDropEnabled, setDragDropEnabled] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [highlightDuplicates, setHighlightDuplicates] = useState(false);
  const [paneEntries, setPaneEntries] = useState<[FileEntry[], FileEntry[]]>([[], []]);
  const [refreshUrlItem, setRefreshUrlItem] = useState<DownloadItem | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ url: string; targetDir: string; fileName?: string; info: DuplicateCheckResult } | null>(null);
  const [batchRenameTargets, setBatchRenameTargets] = useState<FileEntry[] | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [extensionEnabled, setExtensionEnabled] = useState(true);
  const [extensionPort, setExtensionPort] = useState(47832);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [thisPcOpen, setThisPcOpen] = useState(false);
  const [defaultDownloadDir, setDefaultDownloadDir] = useState('');
  const [categoryDirs, setCategoryDirs] = useState<Partial<Record<CategoryDirKey, string>>>({});
  const [version, setVersion] = useState(() => api?.version || '0.1.0');
  const [clipboardSuggestion, setClipboardSuggestion] = useState<ClipboardUrlSuggestion | null>(null);
  const [metaMap, setMetaMap] = useState<Record<string, ItemMeta>>({});
  const [autoColors, setAutoColors] = useState<Record<string, ColorId>>({});
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [engineState, setEngineState] = useState<Aria2EngineState>({ mode: 'pending', connected: false });
  const [diskWarning, setDiskWarning] = useState<DiskSpaceWarning | null>(null);
  const [dlTab, setDlTab] = useState<DlTab>('all');
  const [dlCollapsed, setDlCollapsed] = useState(false);
  const [dlHeight, setDlHeight] = useState(180);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const prevDlStatusRef = useRef<Record<string, { status: string; warning?: string }>>({});
  const t = dict[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('nbrs-theme', theme);
  }, [theme]);

  const loadMeta = useCallback(() => {
    if (!api) return;
    api.metadata.getAll().then(setMetaMap).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (!api) return;
    api.getVersion().then(setVersion).catch(() => undefined);
    api.settings.get().then((s) => {
      setLang(s.language);
      setAutoColor(!!s.autoColor);
      setAutoOrganize(s.autoOrganizeEnabled !== false);
      setClipboardMonitor(s.clipboardMonitor !== false);
      setLaunchAtStartup(!!s.launchAtStartup);
      setMinimizeToTray(!!s.minimizeToTray);
      setShowSidebar(s.showSidebar !== false);
      setMaxConcurrentDownloads(s.maxConcurrentDownloads ?? 5);
      setMaxDownloadSpeedKbps(s.maxDownloadSpeedKbps ?? 0);
      setAfterDownloadAction(s.afterDownloadAction ?? 'notify');
      setBatteryLiteMode(!!s.batteryLiteMode);
      setDragDropEnabled(s.dragDropEnabled !== false);
      setExtensionEnabled(s.extensionEnabled !== false);
      setExtensionPort(s.extensionPort ?? 47832);
      setCategoryDirs(s.categoryDirs ?? {});
      if (s.viewMode === 'downloads' || s.viewMode === 'files' || s.viewMode === 'default') {
        setViewMode(s.viewMode);
      }
    }).catch(() => undefined);
    api.files.getDownloadDirInfo().then((i) => {
      setDefaultDownloadDir(i.path);
      setRoot(i.path);
      setHistories([initHist(i.path), initHist(i.path)]);
    }).catch(() => undefined);
    api.downloads.list().then(setDownloads).catch(() => undefined);
    api.downloads.getEngineState().then(setEngineState).catch(() => undefined);
    api.downloads.checkDiskSpace().then((w) => setDiskWarning(w.lowSpace || w.insufficientForFile ? w : null)).catch(() => undefined);
    const unsubDl = api.downloads.onUpdated(({ items, engine }) => {
      setDownloads(items);
      setEngineState(engine);
      const prev = prevDlStatusRef.current;
      const next: Record<string, { status: string; warning?: string }> = {};
      for (const it of items) {
        next[it.id] = { status: it.status, warning: it.warningCode };
        const p = prev[it.id];
        if (p && p.status !== 'error' && it.status === 'error') {
          notify(`${it.fileName}: ${it.errorMessage || t.status.error}`, true);
        } else if (it.status === 'completed' && it.warningCode && (!p || !p.warning)) {
          const warnMsg = it.warningCode === 'html_error_page' ? t.suspiciousHtmlFile : t.suspiciousSmallFile;
          notify(`⚠️ ${it.fileName}: ${warnMsg}`, true);
        }
      }
      prevDlStatusRef.current = next;
    });
    const unsubDisk = api.downloads.onDiskWarning((w) => {
      setDiskWarning(w.lowSpace || w.insufficientForFile ? w : null);
      if (w.lowSpace || w.insufficientForFile) {
        notify(w.insufficientForFile ? t.insufficientDiskWarning : t.lowDiskWarning, true);
      }
    });
    const unsubClip = api.downloads.onClipboardUrl((hit) => {
      setClipboardSuggestion(hit);
    });
    const unsubExt = api.extension?.onDownloadReceived?.((notice) => {
      setDlCollapsed(false);
      notify(`📥 ${t.extensionDownloadReceived}: ${notice.fileName}`);
    });
    const unsubAllDone = api.downloads.onAllCompleted?.((info) => {
      notify(`✅ ${info.fileName}`);
      if (info.action === 'sleep') {
        void api.system?.sleep();
      }
    });
    api.windowCtrl?.isMaximized().then(setMaximized).catch(() => undefined);
    const unsubMax = api.windowCtrl?.onMaximizedChange(setMaximized);
    api.updater?.getState().then(setUpdateState).catch(() => undefined);
    const unsubUpd = api.updater?.onStateChange((st) => {
      setUpdateState(st);
      if (st.status === 'available') setUpdateBannerDismissed(false);
    });
    return () => { unsubDl(); unsubDisk(); unsubClip(); unsubExt?.(); unsubAllDone?.(); unsubMax?.(); unsubUpd?.(); };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMeta(); }, [loadMeta, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    api?.files.canUndo().then(setCanUndo).catch(() => undefined);
  }, [api]);

  // Live updates when files change on disk (also from outside the app).
  useEffect(() => api?.files.onChanged(refresh), [api, refresh]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const notify = (text: string, error = false) => setToast({ text, error });
  const run = async (fn: () => Promise<string | void>) => {
    try { const msg = await fn(); if (msg) notify(msg); refresh(); } catch (e) { notify((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
  };
  const panePath = (i: 0 | 1) => {
    const h = histories[i];
    return (h.index >= 0 ? h.stack[h.index] : '') || root;
  };
  const current = panePath(activePane);

  const pushHistory = (h: PaneHistory, target: string): PaneHistory => {
    if (!target) return h;
    const cur = h.index >= 0 ? h.stack[h.index] : '';
    if (cur && samePath(cur, target)) return h;
    const nextStack = [...h.stack.slice(0, h.index + 1), target];
    return { stack: nextStack, index: nextStack.length - 1 };
  };

  const navigatePane = (i: 0 | 1) => (p: string) => {
    setHistories((prev) => (i === 0 ? [pushHistory(prev[0], p), prev[1]] : [prev[0], pushHistory(prev[1], p)]));
  };
  const navigate = (p: string) => navigatePane(activePane)(p);

  const goBackPane = (i: 0 | 1) => {
    setHistories((prev) => {
      const h = prev[i];
      if (h.index <= 0) return prev;
      const upd = { ...h, index: h.index - 1 };
      return i === 0 ? [upd, prev[1]] : [prev[0], upd];
    });
  };

  const goForwardPane = (i: 0 | 1) => {
    setHistories((prev) => {
      const h = prev[i];
      if (h.index < 0 || h.index >= h.stack.length - 1) return prev;
      const upd = { ...h, index: h.index + 1 };
      return i === 0 ? [upd, prev[1]] : [prev[0], upd];
    });
  };

  const goUpPane = (i: 0 | 1) => {
    const cur = panePath(i);
    if (root && cur && !samePath(cur, root)) navigatePane(i)(parentOf(cur));
  };

  const copyPath = (p: string) => {
    if (!p) return;
    void navigator.clipboard?.writeText(p);
    notify(t.pathCopied);
  };

  const changeLang = (next: Lang) => {
    setLang(next);
    void api?.settings.set({ language: next });
  };

  const changeDownloadSettings = async (patch: { maxConcurrentDownloads: number; maxDownloadSpeedKbps: number }) => {
    setMaxConcurrentDownloads(patch.maxConcurrentDownloads);
    setMaxDownloadSpeedKbps(patch.maxDownloadSpeedKbps);
    const updated = await api?.settings.set(patch);
    if (updated) {
      if (typeof updated.maxConcurrentDownloads === 'number') setMaxConcurrentDownloads(updated.maxConcurrentDownloads);
      if (typeof updated.maxDownloadSpeedKbps === 'number') setMaxDownloadSpeedKbps(updated.maxDownloadSpeedKbps);
    }
  };

  const batchAddUrls = async (urls: string[]) => {
    if (!api) return 0;
    setDlCollapsed(false);
    let added = 0;
    for (const u of urls) {
      try {
        await api.downloads.add(u, current || root);
        added++;
      } catch {
        // skip invalid URL
      }
    }
    loadMeta();
    return added;
  };

  const toggleAutoColor = () => {
    const next = !autoColor;
    setAutoColor(next);
    if (!next) setAutoColors({});
    void api?.settings.set({ autoColor: next });
  };

  const toggleAutoOrganize = () => {
    const next = !autoOrganize;
    setAutoOrganize(next);
    void api?.settings.set({ autoOrganizeEnabled: next });
  };

  const toggleClipboardMonitor = () => {
    const next = !clipboardMonitor;
    setClipboardMonitor(next);
    if (!next) setClipboardSuggestion(null);
    void api?.settings.set({ clipboardMonitor: next });
  };

  const toggleStartup = () => {
    const next = !launchAtStartup;
    setLaunchAtStartup(next);
    void api?.settings.set({ launchAtStartup: next });
  };

  const toggleTray = () => {
    const next = !minimizeToTray;
    setMinimizeToTray(next);
    void api?.settings.set({ minimizeToTray: next });
  };

  const toggleSidebar = () => {
    const next = !showSidebar;
    setShowSidebar(next);
    void api?.settings.set({ showSidebar: next });
  };

  const toggleDragDrop = () => {
    const next = !dragDropEnabled;
    setDragDropEnabled(next);
    void api?.settings.set({ dragDropEnabled: next });
  };

  const changeDownloadDir = async (dir: string) => {
    const updated = await api?.settings.set({ downloadDir: dir });
    if (updated?.downloadDir) {
      setDefaultDownloadDir(updated.downloadDir);
      setRoot(updated.downloadDir);
      setHistories([initHist(updated.downloadDir), initHist(updated.downloadDir)]);
      refresh();
      loadMeta();
    }
  };

  const openExternalFolder = async (folderPath: string) => {
    if (!api) return;
    const opened = await api.files.setExplorerRoot(folderPath);
    setRoot(opened);
    setHistories([initHist(opened), initHist(opened)]);
    refresh();
  };

  const returnToDefaultDownloads = async () => {
    if (!api) return;
    const dlRoot = await api.files.setExplorerRoot(null);
    setDefaultDownloadDir(dlRoot);
    setRoot(dlRoot);
    setHistories([initHist(dlRoot), initHist(dlRoot)]);
    refresh();
    loadMeta();
  };

  const organizeExternalFolder = async (folderPath: string) => {
    if (!api) return 0;
    const res = await api.files.organizeExternalFolder(folderPath);
    refresh();
    loadMeta();
    return res.movedCount;
  };

  const restoreDefaults = async () => {
    setTheme('dark');
    setLang('ar');
    setShowSidebar(true);
    setDragDropEnabled(true);
    setLaunchAtStartup(false);
    setMinimizeToTray(false);
    setBatteryLiteMode(false);
    setAfterDownloadAction('notify');
    setMaxConcurrentDownloads(0);
    setMaxDownloadSpeedKbps(0);
    setExtensionEnabled(true);
    setExtensionPort(47832);
    await api?.settings.set({
      language: 'ar',
      autoColor: false,
      autoOrganizeEnabled: true,
      clipboardMonitor: true,
      showSidebar: true,
      dragDropEnabled: true,
      launchAtStartup: false,
      minimizeToTray: false,
      batteryLiteMode: false,
      afterDownloadAction: 'notify',
      maxConcurrentDownloads: 0,
      maxDownloadSpeedKbps: 0,
      extensionEnabled: true,
      extensionPort: 47832
    });
  };

  const toggleBatteryLite = () => {
    const next = !batteryLiteMode;
    setBatteryLiteMode(next);
    void api?.settings.set({ batteryLiteMode: next });
  };

  const changeAfterDownloadAction = (action: 'notify' | 'open_folder' | 'sleep') => {
    setAfterDownloadAction(action);
    void api?.settings.set({ afterDownloadAction: action });
  };

  const handleUndo = useCallback(() => {
    if (!api) return;
    void run(async () => {
      const res = await api.files.undo();
      loadMeta();
      return res.undone ? `${t.undoneN} (${res.count})` : t.nothingToUndo;
    });
  }, [api, loadMeta, t.undoneN, t.nothingToUndo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo]);

  const toggleExtension = async () => {
    const next = !extensionEnabled;
    setExtensionEnabled(next);
    await api?.settings.set({ extensionEnabled: next });
  };

  const changeExtensionPort = async (port: number) => {
    setExtensionPort(port);
    const updated = await api?.settings.set({ extensionPort: port });
    if (updated?.extensionPort) setExtensionPort(updated.extensionPort);
  };

  const organizeNow = () => {
    if (!api) return;
    void run(async () => {
      const res = await api.files.organizeSequences(current || root);
      loadMeta();
      return res.movedCount > 0 ? `${t.organizedN}: ${res.movedCount}` : t.noSequencesToGroup;
    });
  };

  const requestAuto = useCallback((folderPaths: string[]) => {
    if (!api || !autoColor || folderPaths.length === 0) return;
    api.metadata.suggestColors(folderPaths).then((res) => {
      if (Object.keys(res).length === 0) return;
      setAutoColors((prev) => ({ ...prev, ...(res as Record<string, ColorId>) }));
    }).catch(() => undefined);
  }, [api, autoColor]);

  const setFolderColor = useCallback((targetPaths: string[], color: ColorId | null | 'auto') => {
    if (!api || targetPaths.length === 0) return;
    void run(async () => {
      if (color === 'auto') {
        const sug = await api.metadata.suggestColors(targetPaths);
        for (const p of targetPaths) await api.metadata.setFolderColor(p, sug[keyOf(p)] ?? null);
      } else {
        for (const p of targetPaths) await api.metadata.setFolderColor(p, color);
      }
      loadMeta();
    });
  }, [api, loadMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  const markOpened = useCallback((p: string) => {
    if (!api) return;
    void run(async () => { await api.metadata.markOpened(p); loadMeta(); });
  }, [api, loadMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetAsNew = useCallback((p: string) => {
    if (!api) return;
    void run(async () => { await api.metadata.resetAsNew(p); loadMeta(); });
  }, [api, loadMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFolderTag = useCallback((paths: string[], tag: string | null) => {
    if (!api) return;
    void run(async () => {
      for (const p of paths) await api.metadata.setTag(p, tag);
      loadMeta();
    });
  }, [api, loadMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  const metaCtx = useMemo(() => ({
    metaOf: (p: string) => metaMap[keyOf(p)],
    colorOf: (p: string) => metaMap[keyOf(p)]?.color ?? (autoColor ? autoColors[keyOf(p)] : undefined),
    setColor: setFolderColor,
    setTag: setFolderTag,
    editSummary: (p: string) => setSummaryPath(p),
    editAliases: (p: string) => setAliasesPath(p),
    markOpened,
    resetAsNew,
    verifyChecksum: (p: string) => setChecksumPath(p),
    requestAuto
  }), [metaMap, autoColor, autoColors, setFolderColor, setFolderTag, markOpened, resetAsNew, requestAuto]);

  const startDownloadNow = (url: string, targetDir: string, fileName?: string) => {
    setDlCollapsed(false);
    void run(async () => {
      const item = await api?.downloads.add(url, targetDir || current, fileName);
      loadMeta();
      if (item?.autoGroupedFolder) {
        const via = item.matchedAlias ? ` (${t.matchedViaAlias}: ${item.matchedAlias})` : '';
        return `${t.autoGroupedTo}: ${item.autoGroupedFolder}${via}`;
      }
      return t.dlStarted;
    });
  };

  const addUrl = (url: string, targetDir: string, fileName?: string) => {
    setDialog(null);
    const dest = targetDir || current;
    if (api?.downloads.checkDuplicate) {
      void api.downloads.checkDuplicate(url, dest, fileName).then((info) => {
        if (info.existsInHistory || info.existsOnDisk) {
          setDuplicatePrompt({ url, targetDir: dest, fileName, info });
        } else {
          startDownloadNow(url, dest, fileName);
        }
      }).catch(() => startDownloadNow(url, dest, fileName));
      return;
    }
    startDownloadNow(url, dest, fileName);
  };

  const pauseDl = (id: string) => { void run(async () => { await api?.downloads.pause(id); }); };
  const resumeDl = (id: string) => { void run(async () => { await api?.downloads.resume(id); }); };
  const cancelDl = (id: string) => { void run(async () => { await api?.downloads.cancel(id, false); }); };
  const setDlNote = (id: string, note: string) => { void run(async () => { await api?.downloads.setNote(id, note); }); };
  const exportDlList = () => {
    void run(async () => {
      const json = await api?.downloads.exportJson();
      if (!json) return;
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nbrsflow-downloads-${version}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };
  const importDlList = (jsonText: string) => {
    void run(async () => {
      const count = await api?.downloads.importJson(jsonText);
      return `${t.dlImportedN}: ${count ?? 0}`;
    });
  };
  const setCategoryDir = (key: CategoryDirKey) => {
    void run(async () => {
      const picked = await api?.files.pickFolder();
      if (!picked) return;
      const updated = await api?.settings.set({ categoryDirs: { [key]: picked } });
      if (updated?.categoryDirs) setCategoryDirs(updated.categoryDirs);
    });
  };
  const resetCategoryDir = (key: CategoryDirKey) => {
    void run(async () => {
      const updated = await api?.settings.set({ categoryDirs: { [key]: '' } });
      if (updated?.categoryDirs) setCategoryDirs(updated.categoryDirs);
    });
  };
  const openCategoryDir = (key: CategoryDirKey) => {
    const custom = categoryDirs[key];
    if (custom) {
      if (defaultDownloadDir && custom.toLowerCase().startsWith(defaultDownloadDir.toLowerCase())) {
        navigate(custom);
      } else {
        void openExternalFolder(custom);
      }
      return;
    }
    if (defaultDownloadDir) void returnToDefaultDownloads();
  };
  const openDl = (p: string) => { void run(async () => { await api?.files.openItem(p); }); };
  const revealDl = (p: string) => { void run(async () => { await api?.files.revealInExplorer(p); }); };

  const createFolder = (name: string) => { setDialog(null); void run(async () => { await api?.files.createFolder(current, name); }); };

  const dropItems = (paths: string[], target: string) => {
    void run(async () => { const r = await api?.files.moveItems(paths, target); return `${t.movedN}: ${r?.length ?? 0}`; });
  };

  const onAction = (kind: ActionKind, paths: string[]) => {
    if (!api || paths.length === 0) return;
    switch (kind) {
      case 'open': void run(() => api.files.openItem(paths[0])); break;
      case 'reveal': void run(() => api.files.revealInExplorer(paths[0])); break;
      case 'rename': setRenamePath(paths[0]); break;
      case 'move': setMoveSources(paths); break;
      case 'delete': void run(async () => { const n = await api.files.deleteItems(paths); return `${t.deletedN}: ${n}`; }); break;
      case 'extract': void run(async () => { await api.files.smartExtractArchive(paths[0]); return t.extracted; }); break;
    }
  };

  const onResizeStart = (e: React.MouseEvent) => {
    dragRef.current = { y: e.clientY, h: dlHeight };
    const move = (ev: MouseEvent) => {
      if (dragRef.current) setDlHeight(Math.min(500, Math.max(90, dragRef.current.h + ev.clientY - dragRef.current.y)));
    };
    const up = () => { dragRef.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onStats = useCallback((visible: number, selected: number) => setStats({ visible, selected }), []);

  const pane = (i: 0 | 1) => {
    const h = histories[i];
    return (
      <ExplorerPane
        key={i} api={api} root={root} path={panePath(i)} active={activePane === i} view={view} search={searchFiles ? search : ''}
        typeFilter={typeFilter} lang={lang} t={t} refreshKey={refreshKey}
        canBack={h.index > 0}
        canForward={h.index >= 0 && h.index < h.stack.length - 1}
        autoOrganize={autoOrganize}
        dragDropEnabled={dragDropEnabled}
        highlightDuplicates={highlightDuplicates}
        dual={dual}
        autoColor={autoColor}
        showExplorerToolbar={i === 0}
        otherPaneEntries={dual ? paneEntries[i === 0 ? 1 : 0] : undefined}
        onEntriesLoaded={(list) => setPaneEntries((prev) => (i === 0 ? [list, prev[1]] : [prev[0], list]))}
        onQuickPreview={(p) => setPreviewPath(p)}
        onBatchRename={(list) => setBatchRenameTargets(list)}
        onNewFolder={() => { setActivePane(i); setDialog('folder'); }}
        onToggleAutoOrganize={toggleAutoOrganize}
        onToggleView={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))}
        onToggleDual={() => { setDual((d) => !d); setActivePane(0); }}
        onToggleDuplicates={() => setHighlightDuplicates((x) => !x)}
        onOrganizeNow={organizeNow}
        onToggleAutoColor={toggleAutoColor}
        onOpenThisPc={() => setThisPcOpen(true)}
        onBack={() => goBackPane(i)}
        onForward={() => goForwardPane(i)}
        onUp={() => goUpPane(i)}
        onCopyPath={copyPath}
        onActivate={() => setActivePane(i)} onNavigate={navigatePane(i)} onStats={onStats} onAction={onAction} onDropItems={dropItems}
      />
    );
  };

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'downloads') setDlCollapsed(false);
    void api?.settings.set({ viewMode: mode });
  };

  const checkForUpdates = async () => {
    if (!api?.updater) return;
    const st = await api.updater.check();
    setUpdateState(st);
    if (st.status === 'available') setUpdateBannerDismissed(false);
  };

  const triggerUpdateNow = async () => {
    if (!api?.updater) return;
    const hasActive = downloads.some((d) => d.status === 'active' || d.status === 'queued');
    if (hasActive && !window.confirm(t.updateActiveDownloadsWarning)) return;
    await api.updater.downloadAndInstall();
  };

  const showUpdateBanner = !updateBannerDismissed && (
    updateState?.status === 'available' ||
    updateState?.status === 'downloading' ||
    updateState?.status === 'ready'
  );

  return (
    <MetaContext.Provider value={metaCtx}>
    <div className="flex h-full flex-col">
      <TopBar
        t={t} version={version} search={search}
        searchDownloads={searchDownloads}
        searchFiles={searchFiles}
        viewMode={viewMode}
        clipboardMonitor={clipboardMonitor} showSidebar={showSidebar}
        maximized={maximized}
        canUndo={canUndo}
        updateAvailable={updateState?.status === 'available'}
        latestVersion={updateState?.latestVersion}
        onOpenUpdate={() => setUpdateBannerDismissed(false)}
        onSearch={setSearch}
        onToggleSearchDownloads={() => setSearchDownloads((v) => !v)}
        onToggleSearchFiles={() => setSearchFiles((v) => !v)}
        onChangeViewMode={changeViewMode}
        onToggleSidebar={toggleSidebar}
        onUndo={handleUndo}
        onClipboardMonitor={toggleClipboardMonitor}
        onSettings={() => setSettingsOpen(true)}
        onWinMinimize={() => { void api?.windowCtrl?.minimize(); }}
        onWinMaximize={() => { void api?.windowCtrl?.toggleMaximize().then(setMaximized); }}
        onWinClose={() => { void api?.windowCtrl?.close(); }}
      />
      {showUpdateBanner && updateState && (
        <div
          data-testid="update-banner"
          className="flex items-center justify-between gap-3 border-b border-emerald-500/35 bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-200"
        >
          <div className="min-w-0 flex-1 truncate">
            <span className="font-semibold">⬆ {t.updateAvailable}: v{updateState.latestVersion}</span>
            {updateState.releaseNotes && (
              <span className="ms-2 text-emerald-200/80">— {updateState.releaseNotes.split(/\r?\n/)[0]}</span>
            )}
            {updateState.status === 'downloading' && (
              <span className="ms-2 font-medium text-emerald-300">({t.downloadingUpdate} {updateState.downloadProgress ?? 0}%)</span>
            )}
            {updateState.status === 'ready' && (
              <span className="ms-2 font-medium text-emerald-300">({t.updateReadyLaunching})</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {updateState.status === 'available' && updateState.assetUrl && (
              <button
                type="button"
                data-testid="update-now-btn"
                onClick={() => { void triggerUpdateNow(); }}
                className="rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400"
              >{t.updateNow}</button>
            )}
            <button
              type="button"
              onClick={() => setUpdateBannerDismissed(true)}
              className="rounded-md px-1.5 py-0.5 text-emerald-300/80 hover:bg-emerald-500/20 hover:text-emerald-100"
            >✕</button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {showSidebar && viewMode !== 'downloads' && (
          <Sidebar api={api} root={root} current={current} t={t} typeFilter={typeFilter} refreshKey={refreshKey}
            categoryDirs={categoryDirs}
            onTypeFilter={(f) => {
              setTypeFilter(f);
              const custom = categoryDirs[f];
              if (custom) openCategoryDir(f);
            }}
            onSetCategoryDir={setCategoryDir}
            onResetCategoryDir={resetCategoryDir}
            onOpenCategoryDir={openCategoryDir}
            onNavigate={navigate} onDropItems={dropItems} />
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          {viewMode !== 'files' && (
            <DownloadsPanel t={t} items={downloads} tab={dlTab} search={searchDownloads ? search : ''} collapsed={viewMode === 'downloads' ? false : dlCollapsed} height={dlHeight}
              fillHeight={viewMode === 'downloads'}
              diskWarning={diskWarning}
              onTab={setDlTab} onToggle={() => setDlCollapsed((c) => !c)} onAddUrl={() => setDialog('url')} onResizeStart={onResizeStart}
              onPause={pauseDl} onResume={resumeDl} onRefreshUrl={(item) => setRefreshUrlItem(item)} onCancel={cancelDl}
              onSetNote={setDlNote} onExportList={exportDlList} onImportList={importDlList}
              onOpen={openDl} onReveal={revealDl} />
          )}
          {viewMode !== 'downloads' && defaultDownloadDir && root && !samePath(root, defaultDownloadDir) && (
            <div data-testid="external-browse-banner" className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
              <div className="min-w-0 truncate">
                <span className="font-medium">{t.browsingExternalBanner}:</span>{' '}
                <bdi dir="ltr">{root}</bdi>{' '}
                <span className="text-amber-300/80">({t.thisPcCurrentDefault}: <bdi dir="ltr">{defaultDownloadDir}</bdi>)</span>
              </div>
              <button
                type="button"
                data-testid="back-to-downloads-btn"
                onClick={() => { void returnToDefaultDownloads(); }}
                className="shrink-0 rounded-md border border-amber-400/40 bg-panel px-2.5 py-0.5 text-[11px] font-medium text-fg hover:border-amber-300"
              >
                {t.backToDownloads}
              </button>
            </div>
          )}
          {viewMode !== 'downloads' && (
            <div className="flex min-h-0 flex-1 gap-px bg-line">
              {pane(0)}
              {dual && pane(1)}
            </div>
          )}
        </main>
      </div>
      <StatusBar t={t} version={version} count={stats.visible} selected={stats.selected} bridge={!!api} engine={engineState} diskWarning={diskWarning} />

      {dialog === 'url' && (
        <AddDownloadDialog api={api} t={t} root={root} current={current} onSubmit={addUrl} onClose={() => setDialog(null)} />
      )}
      {dialog === 'folder' && (
        <PromptDialog t={t} title={t.newFolder} label={t.folderName} confirm={t.create} onSubmit={createFolder} onClose={() => setDialog(null)} />
      )}
      {moveSources && (
        <MoveDialog api={api} t={t} root={root} sources={moveSources}
          onClose={() => setMoveSources(null)}
          onPick={(target) => { const s = moveSources; setMoveSources(null); dropItems(s, target); }} />
      )}
      {renamePath && (
        <PromptDialog t={t} title={t.renameTitle} label={t.newName} confirm={t.rename}
          initial={renamePath.split('\\').pop()}
          onClose={() => setRenamePath(null)}
          onSubmit={(name) => { const p = renamePath; setRenamePath(null); void run(async () => { await api?.files.renameItem(p, name); return t.renamed; }); }} />
      )}
      {summaryPath && (
        <SummaryDialog t={t} name={summaryPath.split('\\').pop() ?? summaryPath}
          initial={metaMap[keyOf(summaryPath)]?.summary ?? ''}
          onClose={() => setSummaryPath(null)}
          onSave={(text) => {
            const p = summaryPath; setSummaryPath(null);
            void run(async () => { await api?.metadata.setSummary(p, text); loadMeta(); return t.summarySaved; });
          }}
          onDelete={() => {
            const p = summaryPath; setSummaryPath(null);
            void run(async () => { await api?.metadata.setSummary(p, null); loadMeta(); });
          }} />
      )}
      {aliasesPath && (
        <AliasesDialog
          api={api}
          t={t}
          folderPath={aliasesPath}
          onChanged={loadMeta}
          onClose={() => setAliasesPath(null)}
        />
      )}
      {checksumPath && (
        <ChecksumDialog
          api={api}
          t={t}
          filePath={checksumPath}
          onClose={() => setChecksumPath(null)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          api={api}
          t={t}
          version={version}
          lang={lang}
          theme={theme}
          downloadDir={root}
          showSidebar={showSidebar}
          dragDropEnabled={dragDropEnabled}
          launchAtStartup={launchAtStartup}
          minimizeToTray={minimizeToTray}
          batteryLiteMode={batteryLiteMode}
          afterDownloadAction={afterDownloadAction}
          maxConcurrentDownloads={maxConcurrentDownloads}
          maxDownloadSpeedKbps={maxDownloadSpeedKbps}
          extensionEnabled={extensionEnabled}
          extensionPort={extensionPort}
          onChangeLang={changeLang}
          onChangeTheme={setTheme}
          onChangeDownloadDir={changeDownloadDir}
          onToggleSidebar={toggleSidebar}
          onToggleDragDrop={toggleDragDrop}
          onToggleStartup={toggleStartup}
          onToggleTray={toggleTray}
          onToggleBatteryLite={toggleBatteryLite}
          onChangeAfterDownloadAction={changeAfterDownloadAction}
          onChangeDownloadSettings={changeDownloadSettings}
          onBatchAddUrls={batchAddUrls}
          onToggleExtension={toggleExtension}
          onChangeExtensionPort={changeExtensionPort}
          onOpenExternalFolder={openExternalFolder}
          onOrganizeExternalFolder={organizeExternalFolder}
          onRestoreDefaults={restoreDefaults}
          updateState={updateState}
          onCheckForUpdates={checkForUpdates}
          onUpdateNow={triggerUpdateNow}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          api={api}
          t={t}
          root={root}
          metaMap={metaMap}
          actions={[
            { id: 'add-url', label: t.addUrl, hint: 'URL', run: () => setDialog('url') },
            { id: 'new-folder', label: t.newFolder, run: () => setDialog('folder') },
            { id: 'organize', label: t.organizeNow, run: organizeNow },
            { id: 'settings', label: t.settings, run: () => setSettingsOpen(true) },
            { id: 'toggle-view', label: t.toggleView, run: () => setView((v) => (v === 'grid' ? 'list' : 'grid')) },
            { id: 'toggle-dual', label: t.dualPane, run: () => { setDual((d) => !d); setActivePane(0); } },
            { id: 'toggle-sidebar', label: t.toggleSidebar, run: toggleSidebar },
            ...(canUndo ? [{ id: 'undo', label: t.undoBtn, hint: 'Ctrl+Z', run: () => { void handleUndo(); } }] : []),
            { id: 'go-root', label: t.downloads, run: () => { if (root) navigate(root); } }
          ] satisfies CommandPaletteAction[]}
          onNavigate={navigate}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {thisPcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onMouseDown={() => setThisPcOpen(false)}>
          <div
            data-testid="this-pc-dialog"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[460px] max-w-[95vw] rounded-xl border border-line bg-panel p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-fg">💻 {t.thisPcNoticeTitle}</h2>
              <button type="button" onClick={() => setThisPcOpen(false)} className="rounded-lg px-2 py-1 text-xs text-silver hover:bg-panel2">✕</button>
            </div>
            <div data-testid="external-folder-notice" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              ⚠️ {t.thisPcNoticeBody}
            </div>
            <div className="rounded-lg border border-line bg-bg px-3 py-2 text-xs text-muted">
              <div>{t.thisPcCurrentDefault}:</div>
              <div className="mt-0.5 truncate font-mono text-fg" dir="ltr">{defaultDownloadDir}</div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              {defaultDownloadDir && root && !samePath(root, defaultDownloadDir) && (
                <button
                  type="button"
                  data-testid="this-pc-back-btn"
                  onClick={() => { setThisPcOpen(false); void returnToDefaultDownloads(); }}
                  className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs text-fg hover:border-silver"
                >
                  {t.backToDownloads}
                </button>
              )}
              <button
                type="button"
                onClick={() => setThisPcOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-silver hover:bg-panel2"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                data-testid="this-pc-browse-btn"
                onClick={() => {
                  void api?.files.pickFolder().then((picked) => {
                    if (picked) {
                      setThisPcOpen(false);
                      void openExternalFolder(picked);
                    }
                  });
                }}
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-accentfg hover:opacity-90"
              >
                {t.thisPcBrowseBtn}
              </button>
            </div>
          </div>
        </div>
      )}
      {refreshUrlItem && (
        <PromptDialog
          t={t}
          title={t.refreshUrl}
          label={t.refreshUrlLabel}
          confirm={t.dlResume}
          initial={refreshUrlItem.url}
          onClose={() => setRefreshUrlItem(null)}
          onSubmit={(newUrl) => {
            const target = refreshUrlItem;
            setRefreshUrlItem(null);
            void run(async () => {
              await api?.downloads.refreshUrl(target.id, newUrl);
              return t.urlRefreshed;
            });
          }}
        />
      )}
      {duplicatePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={() => setDuplicatePrompt(null)}>
          <div
            data-testid="duplicate-confirm-dialog"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[440px] max-w-[95vw] rounded-xl border border-line bg-panel p-5 shadow-2xl space-y-3"
          >
            <h2 className="text-base font-medium text-amber-300">⚠️ {t.duplicateTitle}</h2>
            <p className="text-sm text-fg">
              {duplicatePrompt.info.existsOnDisk ? t.duplicateOnDisk : t.duplicateInHistory}
            </p>
            <div className="truncate rounded-lg border border-line bg-bg px-3 py-2 text-xs text-muted" dir="ltr">
              {duplicatePrompt.info.fileName} — {duplicatePrompt.url}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="duplicate-cancel-btn"
                onClick={() => setDuplicatePrompt(null)}
                className="rounded-lg px-4 py-1.5 text-sm text-silver hover:bg-panel2"
              >{t.cancel}</button>
              <button
                type="button"
                data-testid="duplicate-continue-btn"
                onClick={() => {
                  const d = duplicatePrompt;
                  setDuplicatePrompt(null);
                  startDownloadNow(d.url, d.targetDir, d.fileName);
                }}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accentfg hover:opacity-90"
              >{t.continueAnyway}</button>
            </div>
          </div>
        </div>
      )}
      {batchRenameTargets && (
        <BatchRenameDialog
          t={t}
          entries={batchRenameTargets}
          onClose={() => setBatchRenameTargets(null)}
          onApply={(items) => {
            setBatchRenameTargets(null);
            void run(async () => {
              const res = await api?.files.batchRename(items);
              loadMeta();
              return `${t.renamed}: ${res?.length ?? 0}`;
            });
          }}
        />
      )}
      {previewPath && (
        <QuickPreviewModal
          api={api}
          t={t}
          lang={lang}
          itemPath={previewPath}
          onClose={() => setPreviewPath(null)}
        />
      )}
      {clipboardSuggestion && (
        <div
          data-testid="clipboard-suggestion"
          className="fixed bottom-10 end-4 z-50 flex w-[380px] flex-col gap-2 rounded-xl border border-line bg-panel p-3.5 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-silver">
            <span>📋 {t.clipboardDetected}</span>
            <button onClick={() => setClipboardSuggestion(null)} className="text-muted hover:text-fg">✕</button>
          </div>
          <div className="truncate text-sm font-medium text-fg" dir="auto" title={clipboardSuggestion.fileName}>
            {clipboardSuggestion.fileName}
          </div>
          <div className="truncate text-[11px] text-muted" dir="ltr" title={clipboardSuggestion.url}>
            {clipboardSuggestion.url}
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setClipboardSuggestion(null)}
              className="rounded-lg px-3 py-1 text-xs text-silver hover:bg-panel2"
            >{t.dismiss}</button>
            <button
              type="button"
              data-testid="clipboard-download-btn"
              onClick={() => {
                const u = clipboardSuggestion.url;
                setClipboardSuggestion(null);
                addUrl(u, root);
              }}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accentfg hover:opacity-90"
            >{t.downloadNow}</button>
          </div>
        </div>
      )}
      {toast && (
        <div className={`fixed bottom-10 start-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-xl ${toast.error ? 'border-rose-500/40 bg-rose-600 text-white' : 'border-line bg-panel2 text-fg'}`}>
          {toast.text}
        </div>
      )}
    </div>
    </MetaContext.Provider>
  );
}
