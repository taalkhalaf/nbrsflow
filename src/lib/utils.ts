import type { FileEntry } from '../types';

export type TypeFilter = 'all' | 'video' | 'audio' | 'docs' | 'archives' | 'apps';

const EXT: Record<Exclude<TypeFilter, 'all'>, string[]> = {
  video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'],
  docs: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.epub', '.csv'],
  archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.iso'],
  apps: ['.exe', '.msi', '.msix', '.appx', '.bat', '.cmd']
};

export const EXTRACTABLE_ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz']);
export function isExtractableArchive(ext: string): boolean {
  return EXTRACTABLE_ARCHIVE_EXTS.has(ext.toLowerCase());
}

export function matchesType(e: FileEntry, f: TypeFilter): boolean {
  if (f === 'all' || e.isDirectory) return true;
  return EXT[f].includes(e.extension);
}

export function fileIcon(e: FileEntry): string {
  if (e.isDirectory) return '📁';
  for (const [k, list] of Object.entries(EXT)) {
    if (list.includes(e.extension)) return { video: '🎬', audio: '🎵', docs: '📄', archives: '🗜️', apps: '⚙️' }[k]!;
  }
  return '📦';
}

export function formatBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function formatDate(ms: number, lang: string): string {
  return new Date(ms).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

export const sep = '\\';

export function samePath(a: string, b: string): boolean {
  return a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();
}

/** Breadcrumb segments from root to current (inclusive). */
export function breadcrumbs(root: string, current: string): { name: string; path: string }[] {
  const out = [{ name: '', path: root }];
  const r = root.replace(/[\\/]+$/, '');
  if (current.toLowerCase().startsWith(r.toLowerCase()) && !samePath(root, current)) {
    let acc = r;
    for (const part of current.slice(r.length).split(/[\\/]+/).filter(Boolean)) {
      acc += sep + part;
      out.push({ name: part, path: acc });
    }
  }
  return out;
}

export function parentOf(p: string): string {
  const i = p.lastIndexOf(sep);
  return i > 0 ? p.slice(0, i) : p;
}

export const DRAG_MIME = 'application/x-nbrsflow-items';
/** Paths currently being dragged (dataTransfer data is unreadable during dragover). */
let dragging: string[] = [];
export const getDragging = () => dragging;

export function startDrag(e: React.DragEvent, paths: string[]): void {
  dragging = paths;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));
  e.dataTransfer.setData('text/plain', paths.join('\n'));
}
export function endDrag(): void { dragging = []; }
export function hasDrag(e: React.DragEvent): boolean { return e.dataTransfer.types.includes(DRAG_MIME); }
export function readDrag(e: React.DragEvent): string[] {
  try { const v = JSON.parse(e.dataTransfer.getData(DRAG_MIME)); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
/** True if dropping `paths` onto `target` is meaningful (not onto itself or its own parent). */
export function canDropOn(paths: string[], target: string): boolean {
  return paths.length > 0 && paths.every((p) => !samePath(p, target) && !samePath(parentOf(p), target) && !target.toLowerCase().startsWith(p.toLowerCase() + sep));
}