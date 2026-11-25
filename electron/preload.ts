import { contextBridge, ipcRenderer } from 'electron';
import type { NbrsAPI } from '../src/types';

const api: NbrsAPI = {
  version: (ipcRenderer.sendSync('app:version-sync') as string) || '0.1.0',
  platform: process.platform,
  ping: () => ipcRenderer.invoke('app:ping'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  extension: {
    getStatus: () => ipcRenderer.invoke('extension:getStatus'),
    openFolder: () => ipcRenderer.invoke('extension:openFolder'),
    onDownloadReceived: (cb) => {
      const handler = (_e: unknown, notice: import('../src/types').ExtensionDownloadNotice) => cb(notice);
      ipcRenderer.on('extension:downloadReceived', handler);
      return () => { ipcRenderer.removeListener('extension:downloadReceived', handler); };
    }
  },
  windowCtrl: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (cb) => {
      const handler = (_e: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on('window:maximized', handler);
      return () => { ipcRenderer.removeListener('window:maximized', handler); };
    }
  },
  files: {
    getDownloadDirInfo: () => ipcRenderer.invoke('files:downloadDirInfo'),
    listDirectory: (dir) => ipcRenderer.invoke('files:listDirectory', dir),
    getFolderTree: (dir, depth) => ipcRenderer.invoke('files:getFolderTree', dir, depth),
    getDiskSpace: (targetPath) => ipcRenderer.invoke('files:getDiskSpace', targetPath),
    setExplorerRoot: (folderPath) => ipcRenderer.invoke('files:setExplorerRoot', folderPath),
    createFolder: (parent, name) => ipcRenderer.invoke('files:createFolder', parent, name),
    moveItems: (sources, targetDir) => ipcRenderer.invoke('files:moveItems', sources, targetDir),
    renameItem: (p, name) => ipcRenderer.invoke('files:renameItem', p, name),
    deleteItems: (paths) => ipcRenderer.invoke('files:deleteItems', paths),
    openItem: (p) => ipcRenderer.invoke('files:openItem', p),
    revealInExplorer: (p) => ipcRenderer.invoke('files:revealInExplorer', p),
    calculateFolderSize: (p) => ipcRenderer.invoke('files:calculateFolderSize', p),
    inspectFolderIndicators: (paths) => ipcRenderer.invoke('files:inspectFolderIndicators', paths),
    smartExtractArchive: (p) => ipcRenderer.invoke('files:smartExtractArchive', p),
    computeHashes: (p) => ipcRenderer.invoke('files:computeHashes', p),
    organizeSequences: (dir) => ipcRenderer.invoke('files:organizeSequences', dir),
    pickFolder: () => ipcRenderer.invoke('files:pickFolder'),
    organizeExternalFolder: (folderPath) => ipcRenderer.invoke('files:organizeExternalFolder', folderPath),
    batchRename: (items) => ipcRenderer.invoke('files:batchRename', items),
    readPreview: (p) => ipcRenderer.invoke('files:readPreview', p),
    undo: () => ipcRenderer.invoke('files:undo'),
    canUndo: () => ipcRenderer.invoke('files:canUndo'),
    onChanged: (cb) => {
      const handler = (_e: unknown, changedPaths?: string[]) => cb(changedPaths);
      ipcRenderer.on('fs:changed', handler);
      return () => { ipcRenderer.removeListener('fs:changed', handler); };
    }
  },
  metadata: {
    getAll: () => ipcRenderer.invoke('meta:getAll'),
    setFolderColor: (p, c) => ipcRenderer.invoke('meta:setFolderColor', p, c),
    setTag: (p, tag) => ipcRenderer.invoke('meta:setTag', p, tag),
    setSummary: (p, s) => ipcRenderer.invoke('meta:setSummary', p, s),
    suggestColors: (paths) => ipcRenderer.invoke('meta:suggestColors', paths),
    getAliases: (p) => ipcRenderer.invoke('meta:getAliases', p),
    setAliases: (p, aliases) => ipcRenderer.invoke('meta:setAliases', p, aliases),
    addAlias: (p, alias) => ipcRenderer.invoke('meta:addAlias', p, alias),
    removeAlias: (p, alias) => ipcRenderer.invoke('meta:removeAlias', p, alias),
    suggestAliases: (pathOrTitle) => ipcRenderer.invoke('meta:suggestAliases', pathOrTitle),
    markOpened: (p) => ipcRenderer.invoke('meta:markOpened', p),
    resetAsNew: (p) => ipcRenderer.invoke('meta:resetAsNew', p),
    setShortcut: (a, t) => ipcRenderer.invoke('meta:setShortcut', a, t),
    getShortcuts: () => ipcRenderer.invoke('meta:getShortcuts')
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    getEngineState: () => ipcRenderer.invoke('downloads:engineState'),
    add: (url, targetDir, fileName) => ipcRenderer.invoke('downloads:add', url, targetDir, fileName),
    pause: (id) => ipcRenderer.invoke('downloads:pause', id),
    resume: (id) => ipcRenderer.invoke('downloads:resume', id),
    refreshUrl: (id, newUrl) => ipcRenderer.invoke('downloads:refreshUrl', id, newUrl),
    cancel: (id, removeFile) => ipcRenderer.invoke('downloads:cancel', id, removeFile),
    setNote: (id, note) => ipcRenderer.invoke('downloads:setNote', id, note),
    exportJson: () => ipcRenderer.invoke('downloads:export'),
    importJson: (jsonText) => ipcRenderer.invoke('downloads:import', jsonText),
    checkDuplicate: (url, targetDir, fileName) => ipcRenderer.invoke('downloads:checkDuplicate', url, targetDir, fileName),
    checkDiskSpace: (requiredBytes) => ipcRenderer.invoke('downloads:checkDiskSpace', requiredBytes),
    onUpdated: (cb) => {
      const handler = (_e: unknown, payload: { items: import('../src/types').DownloadItem[]; engine: import('../src/types').Aria2EngineState }) => cb(payload);
      ipcRenderer.on('downloads:updated', handler);
      return () => { ipcRenderer.removeListener('downloads:updated', handler); };
    },
    onDiskWarning: (cb) => {
      const handler = (_e: unknown, warning: import('../src/types').DiskSpaceWarning) => cb(warning);
      ipcRenderer.on('downloads:diskWarning', handler);
      return () => { ipcRenderer.removeListener('downloads:diskWarning', handler); };
    },
    onClipboardUrl: (cb) => {
      const handler = (_e: unknown, suggestion: import('../src/types').ClipboardUrlSuggestion) => cb(suggestion);
      ipcRenderer.on('clipboard:urlDetected', handler);
      return () => { ipcRenderer.removeListener('clipboard:urlDetected', handler); };
    },
    onAllCompleted: (cb) => {
      const handler = (_e: unknown, info: { action: string; destination: string; fileName: string }) => cb(info);
      ipcRenderer.on('downloads:allCompleted', handler);
      return () => { ipcRenderer.removeListener('downloads:allCompleted', handler); };
    }
  },
  system: {
    sleep: () => ipcRenderer.invoke('system:sleep')
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:getState'),
    check: () => ipcRenderer.invoke('updater:check'),
    downloadAndInstall: () => ipcRenderer.invoke('updater:downloadAndInstall'),
    onStateChange: (cb) => {
      const handler = (_e: unknown, state: import('../src/types').UpdateState) => cb(state);
      ipcRenderer.on('updater:state', handler);
      return () => { ipcRenderer.removeListener('updater:state', handler); };
    }
  }
};

contextBridge.exposeInMainWorld('nbrsAPI', api);
