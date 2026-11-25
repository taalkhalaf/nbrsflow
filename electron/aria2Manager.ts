import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as path from 'node:path';
import type { Aria2EngineState, DiskSpaceWarning, DownloadItem, DownloadRequestOptions, DownloadStatus, DownloadWarningCode } from '../src/types/download';
import type { CategoryDirKey } from '../src/types/metadata';
import { resolveInside, uniquePath, validateName } from './fsOps';

const CATEGORY_EXTS: Record<Exclude<CategoryDirKey, 'downloads' | 'all'>, Set<string>> = {
  video: new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v']),
  audio: new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus']),
  docs: new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.epub', '.csv', '.srt', '.ass', '.vtt']),
  archives: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso']),
  apps: new Set(['.exe', '.msi', '.msix', '.appx', '.bat', '.cmd'])
};

export function classifyFileCategory(fileName: string): Exclude<CategoryDirKey, 'downloads' | 'all'> | null {
  const ext = path.extname(String(fileName ?? '')).toLowerCase();
  if (!ext) return null;
  for (const [cat, set] of Object.entries(CATEGORY_EXTS) as [Exclude<CategoryDirKey, 'downloads' | 'all'>, Set<string>][]) {
    if (set.has(ext)) return cat;
  }
  return null;
}

export function isWithinScheduleWindow(now: Date, startHHMM?: string, endHHMM?: string): boolean {
  const parse = (s?: string): number | null => {
    const m = String(s ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  };
  const start = parse(startHHMM);
  const end = parse(endHHMM);
  if (start === null || end === null || start === end) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

export interface DownloadTargetRequest {
  url: string;
  fileName: string;
  requestedDir?: string;
  rootDir: string;
}

export interface ResolvedTargetDir {
  targetDir: string;
  matchedAlias?: string;
}

export type DownloadTargetDirResolver = (
  req: DownloadTargetRequest
) => string | ResolvedTargetDir | Promise<string | ResolvedTargetDir>;

let customTargetResolver: DownloadTargetDirResolver | null = null;

/**
 * Register a custom target directory resolver (hook for Phase 7 automatic sequence grouping).
 */
export function setDownloadTargetDirResolver(resolver: DownloadTargetDirResolver | null): void {
  customTargetResolver = resolver;
}

export async function resolveDownloadTargetDirWithMeta(req: DownloadTargetRequest): Promise<ResolvedTargetDir> {
  const baseDir = req.requestedDir ? resolveInside(req.rootDir, req.requestedDir) : path.resolve(req.rootDir);
  const raw = customTargetResolver
    ? await customTargetResolver({ ...req, requestedDir: baseDir })
    : baseDir;
  const candidate = typeof raw === 'string' ? raw : raw.targetDir;
  const matchedAlias = typeof raw === 'object' && raw ? raw.matchedAlias : undefined;
  const safeDir = resolveInside(req.rootDir, candidate);
  await fs.promises.mkdir(safeDir, { recursive: true });
  return { targetDir: safeDir, matchedAlias };
}

/**
 * Resolves and validates the target directory inside `rootDir` for an incoming download.
 * Acts as the single hook point for future automatic sequence folder routing.
 */
export async function resolveDownloadTargetDir(req: DownloadTargetRequest): Promise<string> {
  const res = await resolveDownloadTargetDirWithMeta(req);
  return res.targetDir;
}

/** Infer a clean Windows-safe file name from a URL or an explicit override. */
export function inferDownloadFileName(url: string, explicitName?: string): string {
  if (explicitName && explicitName.trim()) {
    return validateName(explicitName.trim());
  }
  try {
    const u = new URL(url);
    const raw = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
    if (cleaned && cleaned !== '.' && cleaned !== '..') return validateName(cleaned);
  } catch {
    // ignore URL parse error
  }
  return `download-${Date.now()}.bin`;
}

/** Locate `aria2c.exe` in env, bundled resources, or system PATH. */
export function findAria2Binary(): string | null {
  const candidates: string[] = [];
  if (process.env.NBRS_ARIA2_PATH) candidates.push(process.env.NBRS_ARIA2_PATH);
  const resPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resPath) {
    candidates.push(path.join(resPath, 'bin', 'win32', 'aria2c.exe'));
    candidates.push(path.join(resPath, 'resources', 'bin', 'win32', 'aria2c.exe'));
  }
  // Dev workspace roots (from dist-electron/electron or electron)
  candidates.push(path.resolve(__dirname, '..', '..', 'resources', 'bin', 'win32', 'aria2c.exe'));
  candidates.push(path.resolve(__dirname, '..', 'resources', 'bin', 'win32', 'aria2c.exe'));
  candidates.push(path.resolve(process.cwd(), 'resources', 'bin', 'win32', 'aria2c.exe'));

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  try {
    const r = spawnSync('where.exe', ['aria2c.exe'], { encoding: 'utf8', timeout: 2500 });
    const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s));
    if (first) return first;
  } catch {
    // ignore
  }
  return null;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

const HTML_EXTENSIONS = new Set(['.html', '.htm', '.xhtml', '.mhtml']);
const LARGE_EXPECTED_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v',
  '.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso',
  '.exe', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.apk', '.pdf', '.bin'
]);
const MIN_EXPECTED_BINARY_BYTES = 16 * 1024;
const MAX_HTML_SNIFF_BYTES = 64 * 1024;

/**
 * Inspects a completed download on disk to detect suspiciously small files or
 * HTML error pages saved under a non-HTML filename (e.g. expired link / 403 page).
 */
export async function inspectCompletedFile(
  filePath: string,
  fileName: string
): Promise<{ warningCode?: DownloadWarningCode; warningMessage?: string }> {
  try {
    const st = await fs.promises.stat(filePath);
    if (!st.isFile()) return {};
    const ext = path.extname(fileName || filePath).toLowerCase();
    if (HTML_EXTENSIONS.has(ext)) return {};

    if (st.size > 0 && st.size <= MAX_HTML_SNIFF_BYTES) {
      const fh = await fs.promises.open(filePath, 'r');
      try {
        const buf = Buffer.alloc(Math.min(512, st.size));
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        const head = buf.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
        if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
          return {
            warningCode: 'html_error_page',
            warningMessage: 'Suspicious HTML response saved instead of expected file'
          };
        }
      } finally {
        await fh.close();
      }
    }

    if (st.size === 0 || (LARGE_EXPECTED_EXTENSIONS.has(ext) && st.size < MIN_EXPECTED_BINARY_BYTES)) {
      return {
        warningCode: 'small_file',
        warningMessage: `Suspiciously small file (${st.size} bytes)`
      };
    }
    return {};
  } catch {
    return {};
  }
}

function formatAria2Error(errorCode?: string, errorMessage?: string): string {
  if (errorMessage && errorMessage.trim()) {
    return errorCode ? `${errorMessage.trim()} (code ${errorCode})` : errorMessage.trim();
  }
  const codeMap: Record<string, string> = {
    '1': 'Unknown error',
    '2': 'Timeout',
    '3': 'Resource not found (404)',
    '4': 'Too many "resource not found" responses',
    '5': 'Download aborted due to slow speed',
    '6': 'Network problem occurred',
    '8': 'Remote server did not support resume',
    '9': 'Not enough disk space',
    '19': 'Name resolution failed',
    '21': 'FTP command failed',
    '22': 'HTTP response header was bad or unexpected',
    '23': 'Too many redirects',
    '24': 'HTTP authorization failed (401/403)'
  };
  if (errorCode && codeMap[errorCode]) {
    return `${codeMap[errorCode]} (code ${errorCode})`;
  }
  return errorCode ? `aria2 error ${errorCode}` : 'Download failed';
}

export interface Aria2GlobalDownloadOptions {
  maxConcurrentDownloads?: number;
  maxDownloadSpeedKbps?: number;
}

export interface IAria2Engine {
  getState(): Aria2EngineState;
  start(): Promise<Aria2EngineState>;
  stop(): Promise<void>;
  listDownloads(): DownloadItem[];
  addDownload(url: string, targetDir?: string, fileName?: string, requestOptions?: DownloadRequestOptions): Promise<DownloadItem>;
  pauseDownload(id: string): Promise<DownloadItem>;
  resumeDownload(id: string): Promise<DownloadItem>;
  refreshDownloadUrl(id: string, newUrl: string): Promise<DownloadItem>;
  cancelDownload(id: string, removeFile?: boolean): Promise<void>;
  checkDuplicate(url: string, targetDir?: string, fileName?: string): { existsInHistory: boolean; existsOnDisk: boolean; existingPath?: string; fileName: string };
  setGlobalOptions(opts: Aria2GlobalDownloadOptions): Promise<void>;
  onUpdate(cb: (items: DownloadItem[], state: Aria2EngineState) => void): () => void;
}

export interface Aria2ManagerOptions {
  storageDir: string;
  getRootDir: () => string;
  appVersion?: string;
  binaryPath?: string | null;
  forceFallback?: boolean;
  maxConcurrentDownloads?: number;
  maxDownloadSpeedKbps?: number;
  maxCompletedHistory?: number;
  getMinFreeDiskBytes?: () => number;
  getCategoryDir?: (fileName: string) => string | undefined;
  onDiskWarning?: (warning: DiskSpaceWarning) => void;
  onDownloadCompleted?: (item: DownloadItem) => void | Promise<void>;
  onFileRemoved?: (filePath: string) => void | Promise<void>;
}

interface FallbackActiveStream {
  req: http.ClientRequest;
  fileStream: fs.WriteStream;
  lastTickMs: number;
  lastBytes: number;
}

function readPackageVersionFallback(): string {
  for (const candidate of [
    path.resolve(__dirname, '..', '..', 'package.json'),
    path.resolve(__dirname, '..', 'package.json'),
    path.resolve(process.cwd(), 'package.json')
  ]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: string };
      if (pkg?.version) return pkg.version;
    } catch { /* try next */ }
  }
  return '0.2.1';
}

export class Aria2Manager implements IAria2Engine {
  private storageFile: string;
  private getRootDir: () => string;
  private appVersion: string;
  private explicitBinary?: string | null;
  private forceFallback: boolean;
  private getMinFreeDiskBytes: () => number;
  private getCategoryDir?: (fileName: string) => string | undefined;
  private onDiskWarning?: (warning: DiskSpaceWarning) => void;
  private onDownloadCompleted?: (item: DownloadItem) => void | Promise<void>;
  private onFileRemoved?: (filePath: string) => void | Promise<void>;

  private state: Aria2EngineState = { mode: 'pending', connected: false };
  private items: DownloadItem[] = [];
  private listeners = new Set<(items: DownloadItem[], state: Aria2EngineState) => void>();

  // aria2 daemon fields
  private proc: ChildProcess | null = null;
  private port = 0;
  private secret = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private stopping = false;
  private restartCount = 0;
  private maxConcurrentDownloads = 0;
  private maxDownloadSpeedKbps = 0;
  private maxCompletedHistory = 300;

  // fallback streams & per-session request headers (kept in memory, not persisted to disk)
  private fallbackStreams = new Map<string, FallbackActiveStream>();
  private requestOptionsMap = new Map<string, DownloadRequestOptions>();
  private scheduledPausedIds = new Set<string>();

  constructor(opts: Aria2ManagerOptions) {
    this.storageFile = path.join(opts.storageDir, 'downloads.json');
    this.getRootDir = opts.getRootDir;
    this.appVersion = opts.appVersion || readPackageVersionFallback();
    this.explicitBinary = opts.binaryPath;
    this.forceFallback = !!opts.forceFallback;
    if (typeof opts.maxConcurrentDownloads === 'number' && Number.isFinite(opts.maxConcurrentDownloads)) {
      this.maxConcurrentDownloads = Math.max(0, Math.min(100, Math.round(opts.maxConcurrentDownloads)));
    }
    if (typeof opts.maxDownloadSpeedKbps === 'number' && opts.maxDownloadSpeedKbps >= 0) {
      this.maxDownloadSpeedKbps = Math.round(opts.maxDownloadSpeedKbps);
    }
    if (typeof opts.maxCompletedHistory === 'number' && opts.maxCompletedHistory >= 1) {
      this.maxCompletedHistory = Math.round(opts.maxCompletedHistory);
    }
    this.getMinFreeDiskBytes = opts.getMinFreeDiskBytes ?? (() => 2 * 1024 * 1024 * 1024);
    this.getCategoryDir = opts.getCategoryDir;
    this.onDiskWarning = opts.onDiskWarning;
    this.onDownloadCompleted = opts.onDownloadCompleted;
    this.onFileRemoved = opts.onFileRemoved;
    this.loadHistory();
  }

  async checkDiskSpace(requiredBytes?: number, fileName?: string): Promise<DiskSpaceWarning> {
    const root = this.getRootDir();
    fs.mkdirSync(root, { recursive: true });
    const s = await fs.promises.statfs(root);
    const freeBytes = s.bavail * s.bsize;
    const thresholdBytes = Math.max(0, this.getMinFreeDiskBytes());
    const lowSpace = freeBytes < thresholdBytes;
    const insufficientForFile = requiredBytes !== undefined && requiredBytes > 0 && freeBytes < requiredBytes;
    const warning: DiskSpaceWarning = {
      freeBytes,
      thresholdBytes,
      requiredBytes,
      lowSpace,
      insufficientForFile,
      fileName
    };
    if (lowSpace || insufficientForFile) {
      this.onDiskWarning?.(warning);
    }
    return warning;
  }

  /** Update a download item's path when a file or parent folder is moved/renamed/organized. */
  relocateCompletedItem(oldFilePath: string, newFilePath: string): void {
    const oldNorm = path.resolve(oldFilePath).toLowerCase();
    const newAbs = path.resolve(newFilePath);
    const rootNorm = path.resolve(this.getRootDir()).toLowerCase();
    let changed = false;
    for (const it of this.items) {
      const itPath = path.resolve(it.filePath ? it.filePath : path.join(it.destination, it.fileName));
      const itLower = itPath.toLowerCase();
      let updatedPath: string | null = null;
      if (itLower === oldNorm) {
        updatedPath = newAbs;
      } else if (itLower.startsWith(oldNorm + path.sep)) {
        updatedPath = path.join(newAbs, itPath.slice(oldNorm.length + 1));
      }
      if (updatedPath) {
        it.filePath = updatedPath;
        it.fileName = path.basename(updatedPath);
        it.destination = path.dirname(updatedPath);
        if (it.destination.toLowerCase() !== rootNorm) {
          it.autoGroupedFolder = path.basename(it.destination);
        } else {
          it.autoGroupedFolder = undefined;
        }
        changed = true;
      }
    }
    if (changed) {
      this.saveHistory();
      this.emit();
    }
  }

  private loadHistory(): void {
    try {
      if (!fs.existsSync(this.storageFile)) return;
      const raw = JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
      if (!Array.isArray(raw)) return;
      this.items = raw.map((it: DownloadItem): DownloadItem => {
        const wasRunning = it.status === 'active' || it.status === 'queued';
        return {
          ...it,
          status: wasRunning ? 'paused' : it.status,
          speedBps: 0,
          etaSeconds: undefined,
          gid: undefined
        };
      });
    } catch {
      this.items = [];
    }
  }

  private pruneCompletedHistory(): void {
    let completedCount = 0;
    this.items = this.items.filter((it) => {
      if (it.status !== 'completed') return true;
      completedCount++;
      return completedCount <= this.maxCompletedHistory;
    });
  }

  private saveHistory(): void {
    try {
      this.pruneCompletedHistory();
      writeJsonAtomic(this.storageFile, this.items);
    } catch {
      // ignore disk errors during telemetry save
    }
  }

  private emit(): void {
    const snapItems = this.listDownloads();
    const snapState = this.getState();
    for (const cb of this.listeners) {
      try { cb(snapItems, snapState); } catch { /* ignore listener error */ }
    }
  }

  getState(): Aria2EngineState {
    return { ...this.state };
  }

  listDownloads(): DownloadItem[] {
    return this.items.map((x) => ({ ...x }));
  }

  onUpdate(cb: (items: DownloadItem[], state: Aria2EngineState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  async start(): Promise<Aria2EngineState> {
    this.stopping = false;
    const bin = this.forceFallback ? null : (this.explicitBinary !== undefined ? this.explicitBinary : findAria2Binary());
    if (bin && fs.existsSync(bin)) {
      try {
        await this.spawnAria2Daemon(bin);
        await this.recoverAria2Tasks();
        this.startPolling();
        this.emit();
        return this.getState();
      } catch (err) {
        // Fallback if binary fails to start
        this.state = {
          mode: 'fallback',
          connected: true,
          version: 'node-http-1.0',
          error: (err as Error).message
        };
        this.emit();
        return this.getState();
      }
    }
    this.state = {
      mode: 'fallback',
      connected: true,
      version: 'node-http-1.0'
    };
    this.emit();
    return this.getState();
  }

  private aria2ConcurrentValue(): string {
    return String(this.maxConcurrentDownloads > 0 ? this.maxConcurrentDownloads : 99);
  }

  private async spawnAria2Daemon(bin: string): Promise<void> {
    this.port = await getFreePort();
    this.secret = crypto.randomBytes(16).toString('hex');
    const rootDir = this.getRootDir();
    fs.mkdirSync(rootDir, { recursive: true });

    const args = [
      '--enable-rpc=true',
      '--rpc-listen-all=false',
      `--rpc-listen-port=${this.port}`,
      `--rpc-secret=${this.secret}`,
      `--dir=${rootDir}`,
      '--continue=true',
      '--max-connection-per-server=8',
      '--split=8',
      '--min-split-size=1M',
      `--max-concurrent-downloads=${this.aria2ConcurrentValue()}`,
      `--max-overall-download-limit=${this.maxDownloadSpeedKbps > 0 ? `${this.maxDownloadSpeedKbps}K` : '0'}`,
      '--auto-file-renaming=false',
      '--allow-overwrite=true',
      '--content-disposition-default-utf8=true',
      '--file-allocation=none',
      '--quiet=true',
      `--stop-with-process=${process.pid}`
    ];

    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: 'ignore'
    });
    this.proc = child;

    child.on('exit', () => {
      this.proc = null;
      if (this.stopping) return;
      this.state = { ...this.state, connected: false };
      this.emit();
      if (this.restartCount < 3) {
        this.restartCount++;
        setTimeout(() => {
          if (!this.stopping) void this.start();
        }, 800 * this.restartCount);
      } else {
        let changed = false;
        for (const item of this.items) {
          if (item.status === 'active' || item.status === 'queued') {
            item.status = 'paused';
            item.speedBps = 0;
            item.etaSeconds = undefined;
            item.gid = undefined;
            changed = true;
          }
        }
        if (changed) this.saveHistory();
        this.emit();
      }
    });

    // Wait until JSON-RPC responds to aria2.getVersion
    const t0 = Date.now();
    let version = '';
    while (Date.now() - t0 < 6000) {
      if (!this.proc) throw new Error('aria2c exited prematurely');
      try {
        const res = await this.rpc<{ version: string }>('aria2.getVersion');
        version = res.version;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    if (!version) {
      try { child.kill(); } catch { /* ignore */ }
      throw new Error('Timed out waiting for aria2c JSON-RPC');
    }

    this.restartCount = 0;
    this.state = {
      mode: 'aria2',
      connected: true,
      version,
      port: this.port,
      binaryPath: bin
    };
  }

  private async recoverAria2Tasks(): Promise<void> {
    if (this.state.mode !== 'aria2' || !this.state.connected) return;
    const pending = this.items.filter((i) => i.status === 'active' || i.status === 'queued');
    if (pending.length === 0) return;

    let changed = false;
    for (const item of pending) {
      try {
        const gid = await this.rpc<string>(
          'aria2.addUri',
          [[item.url], this.buildAria2AddUriOptions(item.destination, item.fileName, item.id, { continue: 'true' })]
        );
        item.gid = gid;
        item.errorMessage = undefined;
        changed = true;
      } catch (err) {
        item.status = 'error';
        item.gid = undefined;
        item.speedBps = 0;
        item.etaSeconds = undefined;
        item.errorMessage = (err as Error)?.message || 'Failed to recover download after aria2 restart';
        changed = true;
      }
    }
    if (changed) {
      this.saveHistory();
      this.emit();
    }
  }

  private async rpcRaw<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.port || !this.secret) throw new Error('aria2 RPC is not initialized');
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params
    });
    const res = await fetch(`http://127.0.0.1:${this.port}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const data = (await res.json()) as { result?: T; error?: { message: string } };
    if (data.error) throw new Error(data.error.message || 'aria2 RPC error');
    return data.result as T;
  }

  private async rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    return this.rpcRaw<T>(method, [`token:${this.secret}`, ...params]);
  }

  async setGlobalOptions(opts: Aria2GlobalDownloadOptions): Promise<void> {
    if (typeof opts.maxConcurrentDownloads === 'number' && Number.isFinite(opts.maxConcurrentDownloads)) {
      this.maxConcurrentDownloads = Math.max(0, Math.min(100, Math.round(opts.maxConcurrentDownloads)));
    }
    if (typeof opts.maxDownloadSpeedKbps === 'number' && Number.isFinite(opts.maxDownloadSpeedKbps)) {
      this.maxDownloadSpeedKbps = Math.max(0, Math.round(opts.maxDownloadSpeedKbps));
    }
    if (this.state.mode === 'aria2' && this.state.connected) {
      await this.rpc('aria2.changeGlobalOption', [{
        'max-concurrent-downloads': this.aria2ConcurrentValue(),
        'max-overall-download-limit': this.maxDownloadSpeedKbps > 0 ? `${this.maxDownloadSpeedKbps}K` : '0'
      }]);
    }
  }

  async getAria2GlobalOptions(): Promise<Record<string, string>> {
    if (this.state.mode === 'aria2' && this.state.connected) {
      return this.rpc<Record<string, string>>('aria2.getGlobalOption');
    }
    return {
      'max-concurrent-downloads': this.aria2ConcurrentValue(),
      'max-overall-download-limit': this.maxDownloadSpeedKbps > 0 ? `${this.maxDownloadSpeedKbps}K` : '0'
    };
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      void this.pollAria2Tasks();
    }, 350);
  }

  private async pollAria2Tasks(): Promise<void> {
    if (this.polling) return;
    if (this.state.mode !== 'aria2' || !this.state.connected) return;
    const tracked = this.items.filter((i) => i.gid && (i.status === 'active' || i.status === 'queued' || i.status === 'paused'));
    if (tracked.length === 0) return;

    this.polling = true;
    try {
      const calls = tracked.map((item) => ({
        methodName: 'aria2.tellStatus',
        params: [`token:${this.secret}`, item.gid]
      }));

      type TellStatusResult = {
        status: string;
        totalLength: string;
        completedLength: string;
        downloadSpeed: string;
        errorCode?: string;
        errorMessage?: string;
        files?: { path?: string }[];
      };
      type MulticallEntry = [TellStatusResult] | { faultCode: number; faultString: string };

      let results: MulticallEntry[];
      try {
        results = await this.rpcRaw<MulticallEntry[]>('system.multicall', [calls]);
      } catch {
        return;
      }
      if (!Array.isArray(results)) return;

      let changed = false;
      let shouldSave = false;

      for (let idx = 0; idx < tracked.length; idx++) {
        const item = tracked[idx];
        const entry = results[idx];
        if (!Array.isArray(entry) || !entry[0]) continue;
        const st = entry[0];

        const total = Number(st.totalLength) || item.totalBytes;
        const completed = Number(st.completedLength) || 0;
        const speed = Number(st.downloadSpeed) || 0;
        const eta = speed > 0 && total > completed ? Math.ceil((total - completed) / speed) : undefined;

        let nextStatus: DownloadStatus = item.status;
        if (st.status === 'active') nextStatus = 'active';
        else if (st.status === 'waiting') nextStatus = 'queued';
        else if (st.status === 'paused') nextStatus = 'paused';
        else if (st.status === 'complete') nextStatus = 'completed';
        else if (st.status === 'error') nextStatus = 'error';
        else if (st.status === 'removed') nextStatus = 'removed';

        const reportedPath = st.files?.[0]?.path ? path.resolve(st.files[0].path) : item.filePath;
        const reportedName = reportedPath ? path.basename(reportedPath) : item.fileName;

        if (
          item.status !== nextStatus ||
          item.totalBytes !== total ||
          item.completedBytes !== completed ||
          item.speedBps !== speed ||
          item.fileName !== reportedName
        ) {
          const justGotSize = item.totalBytes === 0 && total > 0;
          const justCompleted = item.status !== 'completed' && nextStatus === 'completed';
          if (item.status !== nextStatus) shouldSave = true;
          item.status = nextStatus;
          item.totalBytes = total;
          if (justGotSize) {
            void this.checkDiskSpace(total - completed, item.fileName).catch(() => undefined);
          }
          item.completedBytes = nextStatus === 'completed' && total > 0 ? total : completed;
          item.speedBps = nextStatus === 'active' ? speed : 0;
          item.etaSeconds = nextStatus === 'active' ? eta : undefined;
          if (reportedPath) item.filePath = reportedPath;
          if (reportedName) item.fileName = reportedName;
          if (nextStatus === 'error') {
            item.errorMessage = formatAria2Error(st.errorCode, st.errorMessage);
          }
          if (justCompleted) {
            const targetFile = item.filePath || path.join(item.destination, item.fileName);
            const warn = await inspectCompletedFile(targetFile, item.fileName);
            if (warn.warningCode) {
              item.warningCode = warn.warningCode;
              item.warningMessage = warn.warningMessage;
              shouldSave = true;
            }
            if (this.onDownloadCompleted) {
              void Promise.resolve(this.onDownloadCompleted(item)).catch(() => undefined);
            }
          }
          changed = true;
        }
      }

      if (shouldSave) this.saveHistory();
      if (changed) this.emit();
    } finally {
      this.polling = false;
    }
  }

  async addDownload(
    url: string,
    targetDir?: string,
    explicitName?: string,
    requestOptions?: DownloadRequestOptions
  ): Promise<DownloadItem> {
    const cleanUrl = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      throw new Error('Only HTTP/HTTPS download URLs are supported');
    }

    const rootDir = this.getRootDir();
    const initialName = inferDownloadFileName(cleanUrl, explicitName);
    const customCatDir = !targetDir ? this.getCategoryDir?.(initialName) : undefined;
    let resolvedDir: string;
    let matchedAlias: string | undefined;
    let wasAutoGrouped = false;

    if (customCatDir) {
      const absCat = path.resolve(customCatDir);
      await fs.promises.mkdir(absCat, { recursive: true });
      const rel = path.relative(path.resolve(rootDir).toLowerCase(), absCat.toLowerCase());
      const insideRoot = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
      if (insideRoot) {
        const res = await resolveDownloadTargetDirWithMeta({
          url: cleanUrl,
          fileName: initialName,
          requestedDir: absCat,
          rootDir
        });
        resolvedDir = res.targetDir;
        matchedAlias = res.matchedAlias;
        wasAutoGrouped = path.resolve(resolvedDir).toLowerCase() !== absCat.toLowerCase();
      } else {
        resolvedDir = absCat;
      }
    } else {
      const res = await resolveDownloadTargetDirWithMeta({
        url: cleanUrl,
        fileName: initialName,
        requestedDir: targetDir,
        rootDir
      });
      resolvedDir = res.targetDir;
      matchedAlias = res.matchedAlias;
      const requestedBase = path.resolve(targetDir || rootDir);
      wasAutoGrouped = path.resolve(resolvedDir).toLowerCase() !== requestedBase.toLowerCase();
    }

    const uniqueFullPath = uniquePath(resolvedDir, initialName);
    const finalName = path.basename(uniqueFullPath);

    // Check free disk space before starting the download (non-blocking warning)
    void this.checkDiskSpace(undefined, finalName).catch(() => undefined);

    const item: DownloadItem = {
      id: crypto.randomUUID(),
      url: cleanUrl,
      fileName: finalName,
      destination: resolvedDir,
      filePath: uniqueFullPath,
      status: 'queued',
      totalBytes: 0,
      completedBytes: 0,
      speedBps: 0,
      autoGroupedFolder: wasAutoGrouped ? path.basename(resolvedDir) : undefined,
      matchedAlias: wasAutoGrouped ? matchedAlias : undefined,
      createdAt: Date.now()
    };

    if (requestOptions && (requestOptions.referrer || requestOptions.userAgent || requestOptions.cookie)) {
      this.requestOptionsMap.set(item.id, { ...requestOptions });
    }

    this.items.unshift(item);

    if (this.state.mode === 'aria2' && this.state.connected) {
      const gid = await this.rpc<string>('aria2.addUri', [[cleanUrl], this.buildAria2AddUriOptions(resolvedDir, finalName, item.id)]);
      item.gid = gid;
      item.status = 'active';
      this.saveHistory();
      this.emit();
      void this.pollAria2Tasks();
      return { ...item };
    }

    // Fallback engine
    this.saveHistory();
    this.emit();
    this.startFallbackStream(item);
    return { ...item };
  }

  checkDuplicate(url: string, targetDir?: string, explicitName?: string): {
    existsInHistory: boolean;
    existsOnDisk: boolean;
    existingPath?: string;
    fileName: string;
  } {
    const cleanUrl = String(url ?? '').trim();
    const fileName = inferDownloadFileName(cleanUrl, explicitName);
    const rootDir = this.getRootDir();
    const baseDir = targetDir ? resolveInside(rootDir, targetDir) : path.resolve(rootDir);
    const candidatePath = path.join(baseDir, fileName);

    let diskPath: string | undefined = fs.existsSync(candidatePath) ? candidatePath : undefined;

    const urlMatch = this.items.find((x) => x.status !== 'removed' && x.url === cleanUrl);
    const completedNameMatch = this.items.find(
      (x) => x.status === 'completed' && x.fileName.toLowerCase() === fileName.toLowerCase()
    );
    const histMatch = urlMatch ?? completedNameMatch;

    if (!diskPath && histMatch?.filePath && fs.existsSync(histMatch.filePath)) {
      diskPath = histMatch.filePath;
    }

    if (!diskPath && fs.existsSync(rootDir)) {
      try {
        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const subCandidate = path.join(rootDir, ent.name, fileName);
          if (fs.existsSync(subCandidate)) {
            diskPath = subCandidate;
            break;
          }
        }
      } catch {
        // ignore unreadable rootDir
      }
    }

    return {
      existsInHistory: !!histMatch,
      existsOnDisk: !!diskPath,
      existingPath: diskPath ?? histMatch?.filePath,
      fileName
    };
  }

  async refreshDownloadUrl(id: string, newUrl: string): Promise<DownloadItem> {
    const cleanUrl = String(newUrl ?? '').trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      throw new Error('Only HTTP/HTTPS download URLs are supported');
    }
    const item = this.findItem(id);
    if (item.status === 'completed') return { ...item };

    if (this.state.mode === 'aria2' && this.state.connected && item.gid) {
      try { await this.rpc('aria2.forcePause', [item.gid]); } catch { /* ignore */ }
      try { await this.rpc('aria2.forceRemove', [item.gid]); } catch { /* ignore */ }
      try { await this.rpc('aria2.removeDownloadResult', [item.gid]); } catch { /* ignore */ }
    } else {
      this.abortFallbackStream(item.id);
    }

    item.url = cleanUrl;
    item.errorMessage = undefined;
    item.warningCode = undefined;
    item.warningMessage = undefined;

    if (this.state.mode === 'aria2' && this.state.connected) {
      const gid = await this.rpc<string>(
        'aria2.addUri',
        [[cleanUrl], this.buildAria2AddUriOptions(item.destination, item.fileName, item.id, { continue: 'true' })]
      );
      item.gid = gid;
      item.status = 'active';
      this.saveHistory();
      this.emit();
      void this.pollAria2Tasks();
      return { ...item };
    }

    if (this.state.mode === 'aria2' && !this.state.connected && this.restartCount > 0 && this.restartCount <= 3) {
      item.status = 'queued';
      this.saveHistory();
      this.emit();
      return { ...item };
    }

    this.startFallbackStream(item);
    return { ...item };
  }

  private buildAria2AddUriOptions(dir: string, out: string, itemId: string, extra?: Record<string, unknown>): Record<string, unknown> {
    const opts: Record<string, unknown> = { dir, out, ...extra };
    const reqOpts = this.requestOptionsMap.get(itemId);
    if (reqOpts?.referrer) opts.referer = reqOpts.referrer;
    if (reqOpts?.userAgent) opts['user-agent'] = reqOpts.userAgent;
    if (reqOpts?.cookie) opts.header = [`Cookie: ${reqOpts.cookie}`];
    return opts;
  }

  async pauseDownload(id: string): Promise<DownloadItem> {
    const item = this.findItem(id);
    if (item.status !== 'active' && item.status !== 'queued') return { ...item };

    if (this.state.mode === 'aria2' && this.state.connected && item.gid) {
      try { await this.rpc('aria2.forcePause', [item.gid]); } catch { /* ignore */ }
    } else {
      this.abortFallbackStream(item.id);
    }

    item.status = 'paused';
    item.speedBps = 0;
    item.etaSeconds = undefined;
    this.saveHistory();
    this.emit();
    return { ...item };
  }

  async resumeDownload(id: string): Promise<DownloadItem> {
    const item = this.findItem(id);
    if (item.status !== 'paused' && item.status !== 'error') return { ...item };
    item.errorMessage = undefined;

    if (this.state.mode === 'aria2' && this.state.connected) {
      let unpaused = false;
      if (item.gid) {
        try {
          await this.rpc('aria2.unpause', [item.gid]);
          unpaused = true;
        } catch {
          unpaused = false;
        }
      }
      if (!unpaused) {
        // Re-add URI with --continue=true to the same destination and filename
        const gid = await this.rpc<string>(
          'aria2.addUri',
          [[item.url], this.buildAria2AddUriOptions(item.destination, item.fileName, item.id, { continue: 'true' })]
        );
        item.gid = gid;
      }
      item.status = 'active';
      this.saveHistory();
      this.emit();
      void this.pollAria2Tasks();
      return { ...item };
    }

    if (this.state.mode === 'aria2' && !this.state.connected && this.restartCount > 0 && this.restartCount <= 3) {
      item.status = 'queued';
      this.saveHistory();
      this.emit();
      return { ...item };
    }

    this.startFallbackStream(item);
    return { ...item };
  }

  async cancelDownload(id: string, removeFile = false): Promise<void> {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const item = this.items[idx];
    const wasFinished = item.status === 'completed';

    if (this.state.mode === 'aria2' && this.state.connected && item.gid) {
      try { await this.rpc('aria2.forceRemove', [item.gid]); } catch { /* ignore */ }
      try { await this.rpc('aria2.removeDownloadResult', [item.gid]); } catch { /* ignore */ }
    } else {
      this.abortFallbackStream(item.id);
    }

    this.items.splice(idx, 1);
    this.saveHistory();
    this.emit();

    // Remove partial file if cancelled mid-flight (or if removeFile is requested)
    if ((!wasFinished || removeFile) && item.filePath) {
      await this.safeDeleteCancelledFiles(item.filePath);
    }
  }

  private async safeDeleteCancelledFiles(target: string): Promise<void> {
    const aria2Meta = `${target}.aria2`;
    let deletedTarget = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
      }
      let retryNeeded = false;
      try {
        if (fs.existsSync(target)) {
          await fs.promises.unlink(target);
          deletedTarget = true;
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') retryNeeded = true;
      }
      try {
        if (fs.existsSync(aria2Meta)) {
          await fs.promises.unlink(aria2Meta);
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') retryNeeded = true;
      }
      if (!retryNeeded && !fs.existsSync(target) && !fs.existsSync(aria2Meta)) break;
    }
    if (deletedTarget && this.onFileRemoved) {
      await Promise.resolve(this.onFileRemoved(target)).catch(() => undefined);
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const id of [...this.fallbackStreams.keys()]) {
      this.abortFallbackStream(id);
    }
    if (this.proc) {
      const child = this.proc;
      this.proc = null;
      try { await this.rpc('aria2.forceShutdown'); } catch { /* ignore */ }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
          resolve();
        }, 600);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.saveHistory();
  }

  setTaskNote(id: string, note: string): DownloadItem {
    const item = this.findItem(id);
    const clean = String(note ?? '').trim().slice(0, 500);
    item.note = clean || undefined;
    this.saveHistory();
    this.emit();
    return { ...item };
  }

  exportDownloads(): string {
    return JSON.stringify(this.items, null, 2);
  }

  importDownloads(jsonText: string): number {
    const parsed = JSON.parse(String(jsonText ?? ''));
    if (!Array.isArray(parsed)) throw new Error('Invalid download list JSON');
    const existingUrls = new Set(this.items.map((i) => i.url));
    const rootDir = this.getRootDir();
    let count = 0;
    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') continue;
      const url = String((raw as { url?: unknown }).url ?? '').trim();
      if (!/^https?:\/\//i.test(url) || existingUrls.has(url)) continue;
      const fileName = inferDownloadFileName(url, typeof (raw as { fileName?: unknown }).fileName === 'string' ? (raw as { fileName: string }).fileName : undefined);
      const destRaw = typeof (raw as { destination?: unknown }).destination === 'string' ? (raw as { destination: string }).destination : rootDir;
      const destination = fs.existsSync(destRaw) ? path.resolve(destRaw) : rootDir;
      const note = typeof (raw as { note?: unknown }).note === 'string' ? (raw as { note: string }).note.trim().slice(0, 500) : undefined;
      this.items.push({
        id: crypto.randomUUID(),
        url,
        fileName,
        destination,
        filePath: path.join(destination, fileName),
        status: 'paused',
        totalBytes: Number((raw as { totalBytes?: unknown }).totalBytes) || 0,
        completedBytes: 0,
        speedBps: 0,
        ...(note ? { note } : {}),
        createdAt: Number((raw as { createdAt?: unknown }).createdAt) || Date.now()
      });
      existingUrls.add(url);
      count++;
    }
    if (count > 0) {
      this.saveHistory();
      this.emit();
    }
    return count;
  }

  async pauseAllForSchedule(): Promise<void> {
    const running = this.items.filter((i) => i.status === 'active' || i.status === 'queued');
    for (const it of running) {
      this.scheduledPausedIds.add(it.id);
      await this.pauseDownload(it.id).catch(() => undefined);
    }
  }

  async resumeScheduledTasks(): Promise<void> {
    if (this.scheduledPausedIds.size === 0) return;
    const ids = [...this.scheduledPausedIds];
    this.scheduledPausedIds.clear();
    for (const id of ids) {
      const it = this.items.find((x) => x.id === id);
      if (it && it.status === 'paused') {
        await this.resumeDownload(id).catch(() => undefined);
      }
    }
  }

  private findItem(id: string): DownloadItem {
    const it = this.items.find((x) => x.id === id);
    if (!it) throw new Error('Download task not found');
    return it;
  }

  // ---- Built-in Node HTTP/HTTPS fallback implementation ----
  private abortFallbackStream(id: string): void {
    const active = this.fallbackStreams.get(id);
    if (!active) return;
    this.fallbackStreams.delete(id);
    try { active.req.destroy(); } catch { /* ignore */ }
    try { active.fileStream.end(); } catch { /* ignore */ }
  }

  private startFallbackStream(item: DownloadItem, redirectCount = 0): void {
    this.abortFallbackStream(item.id);
    const filePath = item.filePath || path.join(item.destination, item.fileName);
    item.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let existingBytes = 0;
    try {
      if (fs.existsSync(filePath)) existingBytes = fs.statSync(filePath).size;
    } catch {
      existingBytes = 0;
    }
    item.completedBytes = existingBytes;
    item.status = 'active';
    this.emit();

    const parsed = new URL(item.url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqOpts = this.requestOptionsMap.get(item.id);
    const headers: Record<string, string> = {
      'User-Agent': reqOpts?.userAgent || `nbrsflow/${this.appVersion}`
    };
    if (reqOpts?.referrer) headers['Referer'] = reqOpts.referrer;
    if (reqOpts?.cookie) headers['Cookie'] = reqOpts.cookie;
    if (existingBytes > 0) headers['Range'] = `bytes=${existingBytes}-`;

    const req = mod.get(parsed, { headers }, (res) => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectCount >= 5) {
          item.status = 'error';
          item.errorMessage = 'Too many redirects';
          this.saveHistory();
          this.emit();
          return;
        }
        item.url = new URL(res.headers.location, item.url).toString();
        this.startFallbackStream(item, redirectCount + 1);
        return;
      }

      if (!res.statusCode || res.statusCode >= 400) {
        res.resume();
        this.fallbackStreams.delete(item.id);
        item.status = 'error';
        item.speedBps = 0;
        item.errorMessage = `HTTP ${res.statusCode ?? 'Error'}`;
        this.saveHistory();
        this.emit();
        return;
      }

      const isPartial = res.statusCode === 206;
      const contentLen = Number(res.headers['content-length'] || 0);
      if (!isPartial) {
        existingBytes = 0;
        item.completedBytes = 0;
      }
      if (contentLen > 0) {
        item.totalBytes = existingBytes + contentLen;
        void this.checkDiskSpace(contentLen, item.fileName).catch(() => undefined);
      }

      const fileStream = fs.createWriteStream(filePath, { flags: isPartial ? 'a' : 'w' });
      const activeObj: FallbackActiveStream = {
        req,
        fileStream,
        lastTickMs: Date.now(),
        lastBytes: item.completedBytes
      };
      this.fallbackStreams.set(item.id, activeObj);

      res.on('data', (chunk: Buffer) => {
        if (item.status !== 'active') return;
        fileStream.write(chunk);
        item.completedBytes += chunk.length;
        const now = Date.now();
        const dt = (now - activeObj.lastTickMs) / 1000;
        if (dt >= 0.25) {
          item.speedBps = Math.round((item.completedBytes - activeObj.lastBytes) / dt);
          item.etaSeconds = item.speedBps > 0 && item.totalBytes > item.completedBytes
            ? Math.ceil((item.totalBytes - item.completedBytes) / item.speedBps)
            : undefined;
          activeObj.lastTickMs = now;
          activeObj.lastBytes = item.completedBytes;
          this.emit();
        }
      });

      res.on('end', () => {
        if (!this.fallbackStreams.has(item.id)) return;
        this.fallbackStreams.delete(item.id);
        fileStream.end(() => {
          void (async () => {
            if (item.status === 'active') {
              if (item.totalBytes === 0) item.totalBytes = item.completedBytes;
              item.status = 'completed';
              item.speedBps = 0;
              item.etaSeconds = undefined;
              const warn = await inspectCompletedFile(filePath, item.fileName);
              if (warn.warningCode) {
                item.warningCode = warn.warningCode;
                item.warningMessage = warn.warningMessage;
              }
              this.saveHistory();
              this.emit();
              if (this.onDownloadCompleted) {
                void Promise.resolve(this.onDownloadCompleted(item)).catch(() => undefined);
              }
            }
          })();
        });
      });

      res.on('error', (err) => {
        if (!this.fallbackStreams.has(item.id)) return;
        this.fallbackStreams.delete(item.id);
        try { fileStream.end(); } catch { /* ignore */ }
        item.status = 'error';
        item.speedBps = 0;
        item.errorMessage = err.message;
        this.saveHistory();
        this.emit();
      });
    });

    req.on('error', (err) => {
      if (item.status === 'paused') return;
      this.fallbackStreams.delete(item.id);
      item.status = 'error';
      item.speedBps = 0;
      item.errorMessage = err.message;
      this.saveHistory();
      this.emit();
    });
  }
}
