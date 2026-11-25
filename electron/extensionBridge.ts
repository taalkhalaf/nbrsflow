import * as http from 'node:http';
import * as path from 'node:path';
import type { DownloadItem } from '../src/types/download';
import type { ExtensionBridgeStatus } from '../src/types';

export const DEFAULT_EXTENSION_PORT = 47832;
export const DEFAULT_DEDUPE_COOLDOWN_MS = 5000;
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_URL_LENGTH = 8192;
const ALLOWED_ORIGIN_RE = /^(?:chrome-extension|moz-extension|extension):\/\/[a-z0-9_-]+$/i;

export interface ExtensionDownloadPayload {
  url: string;
  fileName?: string;
  referrer?: string;
  userAgent?: string;
  cookie?: string;
}

export interface ExtensionBridgeOptions {
  port?: number;
  enabled?: boolean;
  dedupeCooldownMs?: number;
  appVersion: string;
  extensionPath: string;
  isEngineReady: () => boolean;
  getLanguage?: () => 'ar' | 'en';
  onAddDownload: (payload: ExtensionDownloadPayload) => Promise<DownloadItem>;
  onDownloadReceived?: (item: DownloadItem) => void;
}

/** Validates an incoming download URL from the browser extension (HTTP/HTTPS only). */
export function validateExtensionUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH || /[\r\n\s]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/** Sanitizes an optional filename suggested by the browser. */
export function sanitizeSuggestedFileName(rawName: unknown): string | undefined {
  if (typeof rawName !== 'string') return undefined;
  const base = path.basename(rawName.trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  if (!base || base === '.' || base === '..') return undefined;
  return base.slice(0, 200);
}

/** Normalizes a TCP port number, falling back to DEFAULT_EXTENSION_PORT when invalid. */
export function normalizeExtensionPort(port: unknown): number {
  const n = Number(port);
  if (Number.isInteger(n) && n >= 1024 && n <= 65535) return n;
  return DEFAULT_EXTENSION_PORT;
}

/** Sanitizes an optional HTTP header value (User-Agent / Cookie), stripping CR/LF/control characters. */
export function sanitizeHeaderValue(raw: unknown, maxLen = 4096): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(/[\r\n\x00-\x1f\x7f]/g, '').trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLen);
}

/**
 * Localhost-only HTTP bridge receiving download requests from the nbrsflow browser extension.
 * Rejects web-page origins and requests lacking the extension header to prevent CSRF/drive-by downloads.
 */
export class ExtensionBridgeServer {
  private server: http.Server | null = null;
  private enabled: boolean;
  private port: number;
  private dedupeCooldownMs: number;
  private recentDownloads = new Map<string, { at: number; item: DownloadItem }>();
  private listening = false;
  private lastError: string | undefined;

  constructor(private opts: ExtensionBridgeOptions) {
    this.enabled = opts.enabled !== false;
    this.port = normalizeExtensionPort(opts.port);
    this.dedupeCooldownMs = typeof opts.dedupeCooldownMs === 'number' && opts.dedupeCooldownMs >= 0
      ? opts.dedupeCooldownMs
      : DEFAULT_DEDUPE_COOLDOWN_MS;
  }

  getStatus(): ExtensionBridgeStatus {
    return {
      enabled: this.enabled,
      listening: this.listening,
      host: HOST,
      port: this.port,
      extensionPath: this.opts.extensionPath,
      ...(this.lastError ? { error: this.lastError } : {})
    };
  }

  async start(): Promise<ExtensionBridgeStatus> {
    await this.stop();
    if (!this.enabled) return this.getStatus();

    const srv = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.server = srv;

    return new Promise((resolve) => {
      const onError = (err: Error) => {
        this.listening = false;
        this.lastError = err.message;
        if (this.server === srv) {
          this.server = null;
          try { srv.close(); } catch { /* ignore */ }
        }
        resolve(this.getStatus());
      };

      srv.once('error', onError);
      srv.listen(this.port, HOST, () => {
        srv.removeListener('error', onError);
        srv.on('error', (err) => { this.lastError = err.message; });
        const addr = srv.address();
        if (addr && typeof addr === 'object') this.port = addr.port;
        this.listening = true;
        this.lastError = undefined;
        resolve(this.getStatus());
      });
    });
  }

  async stop(): Promise<void> {
    this.listening = false;
    const srv = this.server;
    this.server = null;
    if (!srv) return;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
    });
  }

  async reconfigure(enabled: boolean, port?: number): Promise<ExtensionBridgeStatus> {
    const nextEnabled = !!enabled;
    const nextPort = port !== undefined ? normalizeExtensionPort(port) : this.port;
    if (nextEnabled === this.enabled && nextPort === this.port && (nextEnabled === this.listening)) {
      return this.getStatus();
    }
    this.enabled = nextEnabled;
    this.port = nextPort;
    if (!this.enabled) {
      await this.stop();
      this.lastError = undefined;
      return this.getStatus();
    }
    return this.start();
  }

  private applyCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!ALLOWED_ORIGIN_RE.test(origin)) {
        return false;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Nbrsflow-Extension');
    }
    return true;
  }

  private sendJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          reject(new Error('PAYLOAD_TOO_LARGE'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8').trim();
          const parsed = raw ? JSON.parse(raw) : {};
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            reject(new Error('INVALID_JSON'));
            return;
          }
          resolve(parsed as Record<string, unknown>);
        } catch {
          reject(new Error('INVALID_JSON'));
        }
      });
      req.on('error', (err) => reject(err));
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.applyCors(req, res)) {
      this.sendJson(res, 403, { ok: false, error: 'Forbidden origin' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.headers['x-nbrsflow-extension'] !== '1') {
      this.sendJson(res, 403, { ok: false, error: 'Unauthorized client' });
      return;
    }

    const urlPath = (req.url || '').split('?')[0];

    if (req.method === 'GET' && urlPath === '/api/status') {
      this.sendJson(res, 200, {
        ok: true,
        app: 'nbrsflow',
        version: this.opts.appVersion,
        port: this.port,
        enabled: this.enabled,
        listening: this.listening,
        engineReady: this.opts.isEngineReady(),
        ...(this.opts.getLanguage ? { language: this.opts.getLanguage() } : {})
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/download') {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('application/json')) {
        this.sendJson(res, 415, { ok: false, error: 'Content-Type must be application/json' });
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = await this.readJsonBody(req);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid request body';
        this.sendJson(res, msg === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { ok: false, error: msg });
        return;
      }

      const validUrl = validateExtensionUrl(body.url);
      if (!validUrl) {
        this.sendJson(res, 400, { ok: false, error: 'Invalid or unsupported download URL' });
        return;
      }

      const now = Date.now();
      if (this.dedupeCooldownMs > 0) {
        for (const [k, entry] of this.recentDownloads.entries()) {
          if (now - entry.at >= this.dedupeCooldownMs) this.recentDownloads.delete(k);
        }
        const recent = this.recentDownloads.get(validUrl);
        if (recent && now - recent.at < this.dedupeCooldownMs) {
          this.sendJson(res, 200, {
            ok: true,
            deduplicated: true,
            id: recent.item.id,
            fileName: recent.item.fileName,
            destination: recent.item.destination,
            status: recent.item.status
          });
          return;
        }
      }

      const fileName = sanitizeSuggestedFileName(body.fileName);
      const referrer = validateExtensionUrl(body.referrer) ?? undefined;
      const userAgent = sanitizeHeaderValue(body.userAgent, 512);
      const cookie = sanitizeHeaderValue(body.cookie, 8192);

      try {
        const item = await this.opts.onAddDownload({ url: validUrl, fileName, referrer, userAgent, cookie });
        if (this.dedupeCooldownMs > 0) {
          this.recentDownloads.set(validUrl, { at: Date.now(), item });
        }
        this.opts.onDownloadReceived?.(item);
        this.sendJson(res, 200, {
          ok: true,
          deduplicated: false,
          id: item.id,
          fileName: item.fileName,
          destination: item.destination,
          status: item.status
        });
      } catch (err) {
        this.sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to enqueue download'
        });
      }
      return;
    }

    this.sendJson(res, 404, { ok: false, error: 'Not found' });
  }
}
