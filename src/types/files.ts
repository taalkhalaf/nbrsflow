export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedMs: number;
  extension: string;
}

export interface FolderEntry extends FileEntry {
  isDirectory: true;
  color?: string;
}

export interface FolderNode {
  name: string;
  path: string;
  hasChildren: boolean;
  children?: FolderNode[];
}

export interface DiskSpace {
  path: string;
  totalBytes: number;
  freeBytes: number;
}

export interface OrganizeGroupResult {
  folderName: string;
  folderPath: string;
  files: string[];
}

export interface OrganizeResult {
  movedCount: number;
  groups: OrganizeGroupResult[];
}

export interface FileHashes {
  sha256: string;
  md5: string;
  size: number;
}

export interface ArchiveEntryPreview {
  name: string;
  isDirectory: boolean;
  size: number;
}

export interface DownloadProvenance {
  url: string;
  downloadedAt: number;
}

export interface FilePreviewResult {
  kind: 'image' | 'text' | 'archive' | 'info';
  name: string;
  size: number;
  modifiedMs: number;
  extension: string;
  dataUrl?: string;
  text?: string;
  archiveEntries?: ArchiveEntryPreview[];
  archiveTotalCount?: number;
  provenance?: DownloadProvenance;
}

export interface UndoResult {
  undone: boolean;
  kind?: 'move' | 'rename' | 'organize';
  count: number;
}

export interface FolderIndicator {
  hasDuplicates: boolean;
  duplicateReason?: string;
  isComplete?: boolean;
  totalEpisodes?: number;
}