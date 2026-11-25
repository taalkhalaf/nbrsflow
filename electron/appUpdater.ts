import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import type { UpdateState } from '../src/types';

export interface ParsedRelease {
  latestVersion: string;
  available: boolean;
  releaseNotes?: string;
  releaseUrl?: string;
  assetUrl?: string;
  assetName?: string;
}

/**
 * Compares two semantic version strings (e.g. "v0.2.11" vs "0.2.10").
 * Returns >0 if a > b, <0 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Parses a GitHub Releases API JSON payload against `currentVersion`.
 */
export function parseGithubRelease(raw: unknown, currentVersion: string): ParsedRelease | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const tag = typeof obj.tag_name === 'string' ? obj.tag_name.trim() : '';
  const latestVersion = tag.replace(/^v/i, '');
  if (!latestVersion) return null;

  const available = compareSemver(latestVersion, currentVersion) > 0;
  const releaseUrl = typeof obj.html_url === 'string' ? obj.html_url : undefined;
  const rawBody = typeof obj.body === 'string' ? obj.body.trim() : '';
  const releaseNotes = rawBody ? rawBody.slice(0, 600) : undefined;

  const assets = Array.isArray(obj.assets) ? (obj.assets as Record<string, unknown>[]) : [];
  const exeAssets = assets.filter(
    (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.exe') && typeof a?.browser_download_url === 'string'
  );
  const preferred =
    exeAssets.find((a) => String(a.name).toLowerCase().includes('setup')) ?? exeAssets[0];

  return {
    latestVersion,
    available,
    releaseNotes,
    releaseUrl,
    assetUrl: preferred ? String(preferred.browser_download_url) : undefined,
    assetName: preferred ? String(preferred.name) : undefined
  };
}

function fetchJsonWithTimeout(urlStr: string, userAgent: string, timeoutMs = 8000): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const client = u.protocol === 'http:' ? http : https;
    const req = client.get(
      u,
      {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/vnd.github+json'
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode ?? 0, data: text ? JSON.parse(text) : null });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: null });
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(new Error('Update check timed out')); });
    req.on('error', reject);
  });
}

function downloadFileWithRedirects(
  urlStr: string,
  destPath: string,
  userAgent: string,
  onProgress: (pct: number) => void,
  redirectsLeft = 5
): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const client = u.protocol === 'http:' ? http : https;
    const req = client.get(u, { headers: { 'User-Agent': userAgent }, timeout: 25000 }, (res) => {
      const code = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, u).toString();
        downloadFileWithRedirects(nextUrl, destPath, userAgent, onProgress, redirectsLeft - 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (code < 200 || code >= 300) {
        res.resume();
        reject(new Error(`HTTP ${code}`));
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const tmp = `${destPath}.part`;
      const ws = fs.createWriteStream(tmp);
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (total > 0) onProgress(Math.min(100, Math.round((received / total) * 100)));
      });
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close(() => {
          fs.renameSync(tmp, destPath);
          onProgress(100);
          resolve(destPath);
        });
      });
      ws.on('error', (err) => {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        reject(err);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Update download timed out')); });
    req.on('error', reject);
  });
}

export interface AppUpdaterOptions {
  currentVersion: string;
  repo?: string;
  apiBaseUrl?: string;
  downloadDir?: string;
  onStateChange?: (state: UpdateState) => void;
  launchInstaller?: (installerPath: string) => Promise<void> | void;
}

export class AppUpdater {
  private state: UpdateState;
  private repo: string;
  private apiBaseUrl: string;
  private downloadDir: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(private opts: AppUpdaterOptions) {
    this.repo = opts.repo ?? 'taalkhalaf/nbrsflow';
    this.apiBaseUrl = (opts.apiBaseUrl ?? 'https://api.github.com').replace(/\/+$/, '');
    this.downloadDir = opts.downloadDir ?? path.join(os.tmpdir(), 'nbrsflow-updates');
    this.state = {
      status: 'idle',
      currentVersion: opts.currentVersion
    };
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  private emit(patch: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...patch };
    this.opts.onStateChange?.(this.getState());
    return this.getState();
  }

  startPeriodicCheck(initialDelayMs = 8000, intervalMs = 6 * 60 * 60 * 1000): void {
    this.stop();
    const t0 = setTimeout(() => { void this.checkForUpdates(); }, initialDelayMs);
    t0.unref?.();
    this.timer = setInterval(() => { void this.checkForUpdates(); }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (this.state.status === 'downloading') return this.getState();
    this.emit({ status: 'checking', error: undefined });
    try {
      const url = `${this.apiBaseUrl}/repos/${this.repo}/releases/latest`;
      const { status, data } = await fetchJsonWithTimeout(url, `nbrsflow/${this.state.currentVersion}`);
      if (status === 404) {
        return this.emit({ status: 'up-to-date', checkedAt: Date.now(), error: undefined });
      }
      if (status < 200 || status >= 300) {
        throw new Error(`HTTP ${status}`);
      }
      const parsed = parseGithubRelease(data, this.state.currentVersion);
      if (!parsed) {
        return this.emit({ status: 'up-to-date', checkedAt: Date.now(), error: undefined });
      }
      return this.emit({
        status: parsed.available ? 'available' : 'up-to-date',
        latestVersion: parsed.latestVersion,
        releaseNotes: parsed.releaseNotes,
        releaseUrl: parsed.releaseUrl,
        assetUrl: parsed.assetUrl,
        assetName: parsed.assetName,
        checkedAt: Date.now(),
        error: undefined
      });
    } catch (e) {
      return this.emit({
        status: 'error',
        checkedAt: Date.now(),
        error: (e as Error).message
      });
    }
  }

  async downloadAndInstall(): Promise<UpdateState> {
    const targetUrl = this.state.assetUrl;
    if (!targetUrl) {
      throw new Error('No installer asset URL available for this release');
    }
    const fileName = this.state.assetName || `nbrsflow-setup-${this.state.latestVersion || 'latest'}.exe`;
    const destPath = path.join(this.downloadDir, path.basename(fileName));

    this.emit({ status: 'downloading', downloadProgress: 0, error: undefined });
    try {
      const saved = await downloadFileWithRedirects(
        targetUrl,
        destPath,
        `nbrsflow/${this.state.currentVersion}`,
        (pct) => { this.emit({ downloadProgress: pct }); }
      );
      this.emit({ status: 'ready', downloadProgress: 100, downloadedPath: saved });
      await this.opts.launchInstaller?.(saved);
      return this.getState();
    } catch (e) {
      return this.emit({
        status: 'error',
        error: (e as Error).message
      });
    }
  }
}
