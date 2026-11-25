import { inferDownloadFileName } from './aria2Manager';

const DIRECT_EXT_RE =
  /\.(?:mp4|mkv|avi|mov|wmv|webm|flv|m4v|ts|mp3|wav|flac|aac|ogg|m4a|wma|zip|rar|7z|tar|gz|bz2|xz|iso|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|csv|exe|msi|apk|msix|srt|ass|vtt|bin|dmg|deb|rpm|part\d+\.(?:rar|zip|7z)|(?:7z|zip|rar)\.\d{3,4})$/i;

/**
 * Checks whether `rawText` is a single direct HTTP/HTTPS download link ending with a known file extension.
 * Returns `{ url, fileName }` or `null`.
 */
export function extractDirectDownloadUrl(rawText: string): { url: string; fileName: string } | null {
  const trimmed = String(rawText ?? '').trim();
  if (!trimmed || trimmed.length > 2048 || /[\r\n\s]/.test(trimmed)) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    const pathname = decodeURIComponent(parsed.pathname || '');
    if (!DIRECT_EXT_RE.test(pathname)) return null;
    const fileName = inferDownloadFileName(trimmed);
    return { url: trimmed, fileName };
  } catch {
    return null;
  }
}

export class ClipboardMonitor {
  private lastText = '';
  private seenUrls = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readClipboard: () => string | Promise<string>,
    private isEnabled: () => boolean,
    private onDetected: (hit: { url: string; fileName: string }) => void,
    private intervalMs = 1200
  ) {}

  async start(): Promise<void> {
    this.stop();
    try {
      this.lastText = (await this.readClipboard()) || '';
    } catch {
      this.lastText = '';
    }
    this.timer = setInterval(() => { void this.pollOnce(); }, this.intervalMs);
  }

  async pollOnce(): Promise<{ url: string; fileName: string } | null> {
    if (!this.isEnabled()) return null;
    let current = '';
    try {
      current = (await this.readClipboard()) || '';
    } catch {
      return null;
    }
    if (!current || current === this.lastText) return null;
    this.lastText = current;

    const hit = extractDirectDownloadUrl(current);
    if (!hit) return null;

    const key = hit.url.toLowerCase();
    if (this.seenUrls.has(key)) return null;
    this.seenUrls.add(key);
    if (this.seenUrls.size > 200) {
      const oldest = this.seenUrls.values().next().value;
      if (oldest) this.seenUrls.delete(oldest);
    }
    this.onDetected(hit);
    return hit;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
