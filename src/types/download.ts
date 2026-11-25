export type DownloadStatus = 'queued' | 'active' | 'paused' | 'completed' | 'error' | 'removed';

export type DownloadWarningCode = 'small_file' | 'html_error_page';

export interface DownloadRequestOptions {
  referrer?: string;
  userAgent?: string;
  cookie?: string;
}

export interface DownloadItem {
  id: string;
  gid?: string;
  url: string;
  fileName: string;
  destination: string;
  filePath?: string;
  status: DownloadStatus;
  totalBytes: number;
  completedBytes: number;
  speedBps: number;
  etaSeconds?: number;
  errorMessage?: string;
  /** Set when a completed file looks suspiciously small or like an HTML error page. */
  warningCode?: DownloadWarningCode;
  warningMessage?: string;
  /** Set when the item was automatically routed/grouped into a sequence folder. */
  autoGroupedFolder?: string;
  /** Set when the item was matched to its folder via an alias or acronym (e.g. "GT" or "جي تي"). */
  matchedAlias?: string;
  /** Optional short user note attached to the download task. */
  note?: string;
  createdAt: number;
}

export interface Aria2EngineState {
  mode: 'aria2' | 'fallback' | 'pending' | 'error';
  connected: boolean;
  version?: string;
  port?: number;
  binaryPath?: string;
  error?: string;
}

export interface DiskSpaceWarning {
  freeBytes: number;
  thresholdBytes: number;
  requiredBytes?: number;
  lowSpace: boolean;
  insufficientForFile: boolean;
  fileName?: string;
}
