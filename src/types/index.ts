export * from './download';
export * from './files';
export * from './metadata';
import type { Aria2EngineState, DiskSpaceWarning, DownloadItem } from './download';
import type { AppSettings, ItemMeta } from './metadata';
import type { DiskSpace, FileEntry, FileHashes, FilePreviewResult, FolderIndicator, FolderNode, OrganizeResult, UndoResult } from './files';

export interface DownloadDirInfo {
  path: string;
  exists: boolean;
  writable: boolean;
}

export interface ClipboardUrlSuggestion {
  url: string;
  fileName: string;
}

export interface ExtensionBridgeStatus {
  enabled: boolean;
  listening: boolean;
  host: string;
  port: number;
  extensionPath: string;
  error?: string;
}

export interface DuplicateCheckResult {
  existsInHistory: boolean;
  existsOnDisk: boolean;
  existingPath?: string;
  fileName: string;
}

export interface ExtensionDownloadNotice {
  id: string;
  fileName: string;
  url: string;
  destination: string;
  autoGroupedFolder?: string;
  deduplicated?: boolean;
}

export interface NbrsAPI {
  version: string;
  platform: string;
  ping(): Promise<string>;
  getVersion(): Promise<string>;
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
  extension: {
    getStatus(): Promise<ExtensionBridgeStatus>;
    openFolder(): Promise<void>;
    onDownloadReceived(cb: (notice: ExtensionDownloadNotice) => void): () => void;
  };
  windowCtrl: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(cb: (maximized: boolean) => void): () => void;
  };
  files: {
    getDownloadDirInfo(): Promise<DownloadDirInfo>;
    listDirectory(dir?: string): Promise<FileEntry[]>;
    getFolderTree(dir?: string, depth?: number): Promise<FolderNode[]>;
    getDiskSpace(targetPath?: string): Promise<DiskSpace>;
    setExplorerRoot(folderPath: string | null): Promise<string>;
    createFolder(parent: string, name: string): Promise<string>;
    moveItems(sources: string[], targetDir: string): Promise<string[]>;
    renameItem(itemPath: string, newName: string): Promise<string>;
    deleteItems(itemPaths: string[]): Promise<number>;
    openItem(itemPath: string): Promise<void>;
    revealInExplorer(itemPath: string): Promise<void>;
    calculateFolderSize(folderPath: string): Promise<number>;
    inspectFolderIndicators(folderPaths: string[]): Promise<Record<string, FolderIndicator>>;
    smartExtractArchive(archivePath: string): Promise<string>;
    computeHashes(filePath: string): Promise<FileHashes>;
    organizeSequences(dir?: string): Promise<OrganizeResult>;
    pickFolder(): Promise<string | null>;
    organizeExternalFolder(folderPath: string): Promise<OrganizeResult & { folderPath: string }>;
    batchRename(items: { path: string; newName: string }[]): Promise<{ from: string; to: string }[]>;
    readPreview(itemPath: string): Promise<FilePreviewResult>;
    undo(): Promise<UndoResult>;
    canUndo(): Promise<boolean>;
    /** Subscribe to live file-system changes; returns an unsubscribe function. */
    onChanged(cb: (changedPaths?: string[]) => void): () => void;
  };
  metadata: {
    /** All metadata, keyed by lower-cased absolute path. */
    getAll(): Promise<Record<string, ItemMeta>>;
    setFolderColor(path: string, color: string | null): Promise<ItemMeta | undefined>;
    setTag(path: string, tag: string | null): Promise<ItemMeta | undefined>;
    /** Empty/null text deletes the summary. */
    setSummary(path: string, summary: string | null): Promise<ItemMeta | undefined>;
    /** Auto-color suggestions for folders, keyed by lower-cased absolute path. */
    suggestColors(paths: string[]): Promise<Record<string, string>>;
    getAliases(path: string): Promise<string[]>;
    setAliases(path: string, aliases: string[]): Promise<string[]>;
    addAlias(path: string, alias: string): Promise<string[]>;
    removeAlias(path: string, alias: string): Promise<string[]>;
    suggestAliases(pathOrTitle: string): Promise<string[]>;
    markOpened(filePath: string): Promise<ItemMeta | undefined>;
    resetAsNew(filePath: string): Promise<ItemMeta | undefined>;
    setShortcut(alias: string, target: string | null): Promise<Record<string, string>>;
    getShortcuts(): Promise<Record<string, string>>;
  };
  downloads: {
    list(): Promise<DownloadItem[]>;
    getEngineState(): Promise<Aria2EngineState>;
    add(url: string, targetDir?: string, fileName?: string): Promise<DownloadItem>;
    pause(id: string): Promise<DownloadItem>;
    resume(id: string): Promise<DownloadItem>;
    refreshUrl(id: string, newUrl: string): Promise<DownloadItem>;
    cancel(id: string, removeFile?: boolean): Promise<void>;
    setNote(id: string, note: string): Promise<DownloadItem>;
    exportJson(): Promise<string>;
    importJson(jsonText: string): Promise<number>;
    checkDuplicate(url: string, targetDir?: string, fileName?: string): Promise<DuplicateCheckResult>;
    checkDiskSpace(requiredBytes?: number): Promise<DiskSpaceWarning>;
    onUpdated(cb: (payload: { items: DownloadItem[]; engine: Aria2EngineState }) => void): () => void;
    onDiskWarning(cb: (warning: DiskSpaceWarning) => void): () => void;
    onClipboardUrl(cb: (suggestion: ClipboardUrlSuggestion) => void): () => void;
    onAllCompleted(cb: (info: { action: string; destination: string; fileName: string }) => void): () => void;
  };
  system: {
    sleep(): Promise<void>;
  };
}
