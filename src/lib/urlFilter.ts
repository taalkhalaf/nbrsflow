export type UrlFilterCategory = 'all' | 'video' | 'audio' | 'archive' | 'docs' | 'apps';

const CATEGORY_EXTS: Record<Exclude<UrlFilterCategory, 'all'>, Set<string>> = {
  video: new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.ts']),
  audio: new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus', '.wma']),
  archive: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso']),
  docs: new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.epub', '.csv', '.srt', '.ass']),
  apps: new Set(['.exe', '.msi', '.apk', '.dmg', '.pkg', '.deb', '.rpm', '.appimage'])
};

/**
 * Extracts unique HTTP/HTTPS URLs from arbitrary text and optionally filters them
 * by media/file category or custom extension (e.g. ".pdf" or "zip").
 */
export function extractAndFilterUrls(
  rawText: string,
  category: UrlFilterCategory = 'all',
  customExt?: string
): string[] {
  const matches = String(rawText ?? '').match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [];
  const seen = new Set<string>();
  const cleanExt = customExt ? customExt.trim().toLowerCase().replace(/^\*?\.?/, '.') : '';
  const useCustom = cleanExt.length > 1;

  const out: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?]+$/, '');
    if (seen.has(url)) continue;
    let pathname = '';
    try {
      pathname = new URL(url).pathname.toLowerCase();
    } catch {
      continue;
    }
    if (useCustom) {
      if (!pathname.endsWith(cleanExt)) continue;
    } else if (category !== 'all') {
      const exts = CATEGORY_EXTS[category];
      const dot = pathname.lastIndexOf('.');
      const ext = dot >= 0 ? pathname.slice(dot) : '';
      if (!exts.has(ext)) continue;
    }
    seen.add(url);
    out.push(url);
  }
  return out;
}
