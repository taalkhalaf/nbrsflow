import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ColorId } from '../src/types/metadata';

const CATEGORIES: Record<string, string[]> = {
  video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.ts'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'],
  docs: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.epub', '.csv', '.rtf'],
  archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'],
  programs: ['.exe', '.msi', '.apk', '.msix', '.bat']
};

export const CATEGORY_COLOR: Record<string, ColorId> = {
  video: 'purple',
  audio: 'teal',
  docs: 'orange',
  archives: 'gray',
  programs: 'green'
};

export function categoryOf(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  for (const [cat, list] of Object.entries(CATEGORIES)) if (list.includes(ext)) return cat;
  return null;
}

/**
 * Looks inside a folder (up to `maxDepth` levels / `maxFiles` files) and returns the color of the
 * dominant content type, or null when no type makes up at least half of the files.
 */
export async function suggestFolderColor(dir: string, maxFiles = 400, maxDepth = 2): Promise<ColorId | null> {
  const counts: Record<string, number> = {};
  let total = 0;
  let queue: string[] = [dir];
  for (let depth = 0; depth <= maxDepth && queue.length && total < maxFiles; depth++) {
    const next: string[] = [];
    for (const d of queue) {
      let dirents: fs.Dirent[];
      try { dirents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { continue; }
      for (const e of dirents) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) { next.push(path.join(d, e.name)); continue; }
        total++;
        const cat = categoryOf(e.name);
        if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
        if (total >= maxFiles) break;
      }
      if (total >= maxFiles) break;
    }
    queue = next;
  }
  if (total === 0) return null;
  const [cat, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
  return cat && n / total >= 0.5 ? CATEGORY_COLOR[cat] : null;
}
