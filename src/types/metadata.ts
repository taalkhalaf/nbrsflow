export const COLOR_IDS = ['blue', 'green', 'purple', 'orange', 'red', 'gray', 'teal'] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export const PRESET_FOLDER_TAGS = ['أنمي', 'كرتون', 'مسلسل', 'فيلم', 'فيلم أنمي'] as const;
export type ViewMode = 'default' | 'downloads' | 'files';

/** User-provided metadata attached to a file or folder. */
export interface ItemMeta {
  /** Folder color tag (one of COLOR_IDS). */
  color?: ColorId;
  /** Optional category/type tag shown on the folder icon (e.g., أنمي, مسلسل, فيلم, or custom). */
  tag?: string;
  /** Free-form note/summary (multi-line, any language). */
  summary?: string;
  /** Shortcuts / alternate names / acronyms associated with this folder or group. */
  aliases?: string[];
  /** Timestamp when this file was last opened or marked as watched/read. */
  openedAt?: number;
  /** Stored on a folder: relative path (from downloads root) of the most recently opened child file. */
  lastOpenedChildRelPath?: string;
  /** Stored on a folder: lowercased filenames of newly downloaded/organized files not yet opened. */
  unopenedFiles?: string[];
  /** True when the folder was automatically created by nbrsflow for sequence/similarity grouping. */
  autoCreated?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface MetadataData {
  version: 2;
  /** Keyed by lower-cased path RELATIVE to the downloads root ('' = the root itself). */
  items: Record<string, ItemMeta>;
  /** alias/shortcut -> target path or name */
  shortcuts: Record<string, string>;
}

export type CategoryDirKey = 'downloads' | 'all' | 'video' | 'audio' | 'docs' | 'archives' | 'apps';

export interface AppSettings {
  language: 'ar' | 'en';
  downloadDir: string;
  /** When true, folders without an explicit color get one based on their dominant content. */
  autoColor: boolean;
  /** When true (default), sequential downloads and files are automatically grouped into a folder named after their normalized title. */
  autoOrganizeEnabled?: boolean;
  /** Disk space guard threshold in bytes (defaults to 2 GB). */
  minFreeDiskSpaceBytes?: number;
  /** Watch clipboard for direct download URLs and suggest adding them. */
  clipboardMonitor?: boolean;
  /** Launch automatically when Windows starts. */
  launchAtStartup?: boolean;
  /** Hide/minimize window to the Windows system tray instead of exiting. */
  minimizeToTray?: boolean;
  /** Enable local HTTP receiver on 127.0.0.1 for the browser extension. */
  extensionEnabled?: boolean;
  /** Port for the browser extension local HTTP receiver (default 47832). */
  extensionPort?: number;
  /** Show or hide the Quick Access / folder tree sidebar (default true). */
  showSidebar?: boolean;
  /** Maximum number of concurrent downloads in aria2 (1..20, default 5). */
  maxConcurrentDownloads?: number;
  /** Maximum overall download speed in KB/s (0 = unlimited). */
  maxDownloadSpeedKbps?: number;
  /** Action to take when all downloads complete ('notify' | 'open_folder' | 'sleep'). */
  afterDownloadAction?: 'notify' | 'open_folder' | 'sleep';
  /** Battery / resource-saving lite mode (caps concurrency and speed). */
  batteryLiteMode?: boolean;
  /** Enable or disable drag-and-drop file moving in explorer/sidebar (default true). */
  dragDropEnabled?: boolean;
  /** Optional custom folder overrides per Quick Access category (empty/undefined = unrestricted default). */
  categoryDirs?: Partial<Record<CategoryDirKey, string>>;
  /** Optional download schedule window & timed speed limit. */
  scheduleEnabled?: boolean;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleSpeedKbps?: number;
  /** Allow opening/revealing verified downloaded files located outside the current main download folder. */
  allowOpenDownloadsOutsideRoot?: boolean;
  /** Disable GPU hardware acceleration (software rendering fallback for black-screen prevention; takes effect on restart). */
  disableHardwareAcceleration?: boolean;
  /** Active workspace view mode ('default' | 'downloads' | 'files'). */
  viewMode?: ViewMode;
  /** Automatically move completed series (detected via `end` suffix + full episode sequence) to a dedicated completed folder (default false). */
  autoMoveCompletedSeries?: boolean;
  /** Automatically group folders with the same tag into a dedicated tag folder (default false). */
  groupFoldersByTag?: boolean;
}
