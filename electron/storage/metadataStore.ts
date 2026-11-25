import * as fs from 'node:fs';
import * as path from 'node:path';
import { COLOR_IDS, type AppSettings, type ColorId, type ItemMeta, type MetadataData } from '../../src/types/metadata';

const emptyData = (): MetadataData => ({ version: 2, items: {}, shortcuts: {} });
const MAX_SUMMARY = 5000;
const MAX_ALIASES = 50;
const MAX_ALIAS_LEN = 120;

/**
 * Normalizes a title or alias for comparison:
 * - lowercases ASCII
 * - strips Arabic diacritics (tashkeel) and tatweel
 * - unifies hamza forms (أ إ آ ٱ -> ا), taa marbuta (ة -> ه), alef maqsura (ى -> ي)
 * - collapses separators and multiple spaces into a single space
 */
export function normalizeAliasForCompare(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[._\-–—~|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Space-free normalized key so "ج ت" and "جت" or "G T" and "GT" compare equal when needed. */
export function normalizeAliasCompact(text: string): string {
  return normalizeAliasForCompare(text).replace(/\s+/g, '');
}

/** Atomic JSON write: write temp file, flush, then rename over the target. */
function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: () => T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && fs.existsSync(file)) {
      // Corrupted file: keep a copy and start fresh.
      try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    }
    return fallback();
  }
}

export class MetadataStore {
  private metaFile: string;
  private settingsFile: string;
  private data: MetadataData;
  private settings: AppSettings;
  private batchDepth = 0;
  private batchDirty = false;

  constructor(dir: string, defaults: AppSettings) {
    this.metaFile = path.join(dir, 'metadata.json');
    this.settingsFile = path.join(dir, 'settings.json');
    this.settings = { autoOrganizeEnabled: true, showSidebar: true, ...defaults, ...readJson<Partial<AppSettings>>(this.settingsFile, () => ({})) };
    this.data = this.load();
  }

  private get root(): string { return path.resolve(this.settings.downloadDir); }

  /** Key = lower-cased path relative to the downloads root. Throws for paths outside the root. */
  keyOf(abs: string): string {
    const rel = path.relative(this.root, path.resolve(abs));
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path is outside the downloads folder');
    return rel.toLowerCase();
  }

  private load(): MetadataData {
    const raw = readJson<Record<string, unknown> | null>(this.metaFile, () => null);
    if (raw && raw.version === 2 && typeof raw.items === 'object') {
      return { ...emptyData(), ...(raw as unknown as MetadataData) };
    }
    const data = emptyData();
    if (raw) {
      // Migrate v1 (absolute-path keys) to relative keys.
      const old = { ...(raw.folders as object), ...(raw.files as object) } as Record<string, ItemMeta>;
      for (const [abs, m] of Object.entries(old)) {
        try { data.items[this.keyOf(abs)] = { ...m, createdAt: m.createdAt ?? Date.now() }; } catch { /* outside root: drop */ }
      }
      if (raw.shortcuts && typeof raw.shortcuts === 'object') data.shortcuts = raw.shortcuts as Record<string, string>;
      writeJsonAtomic(this.metaFile, data);
    }
    return data;
  }

  private save() {
    if (this.batchDepth > 0) {
      this.batchDirty = true;
      return;
    }
    writeJsonAtomic(this.metaFile, this.data);
  }

  /** Execute multiple metadata mutations and flush to metadata.json once at the end. */
  batchUpdate(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.batchDirty) {
        this.batchDirty = false;
        this.save();
      }
    }
  }

  /** Async variant of batchUpdate for multi-step filesystem organization operations. */
  async batchUpdateAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.batchDepth++;
    try {
      return await fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.batchDirty) {
        this.batchDirty = false;
        this.save();
      }
    }
  }

  // ---- settings ----
  getSettings(): AppSettings { return { ...this.settings }; }

  setSettings(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch };
    writeJsonAtomic(this.settingsFile, this.settings);
    return this.getSettings();
  }

  // ---- item metadata ----
  get(abs: string): ItemMeta | undefined {
    const m = this.data.items[this.keyOf(abs)];
    return m ? { ...m, aliases: m.aliases ? [...m.aliases] : undefined } : undefined;
  }

  /** Everything, keyed by lower-cased ABSOLUTE path (what the renderer looks up). */
  getAll(): Record<string, ItemMeta> {
    const out: Record<string, ItemMeta> = {};
    for (const [k, v] of Object.entries(this.data.items)) {
      out[path.join(this.root, k).toLowerCase()] = { ...v, aliases: v.aliases ? [...v.aliases] : undefined };
    }
    return out;
  }

  private update(abs: string, fn: (m: ItemMeta) => void): ItemMeta | undefined {
    const key = this.keyOf(abs);
    const now = Date.now();
    const m: ItemMeta = { ...this.data.items[key] };
    fn(m);
    if (m.aliases && m.aliases.length === 0) delete m.aliases;
    if (m.unopenedFiles && m.unopenedFiles.length === 0) delete m.unopenedFiles;
    if (!m.color && !m.tag && !m.summary && !m.aliases && m.openedAt === undefined && !m.lastOpenedChildRelPath && !m.unopenedFiles && !m.autoCreated) {
      delete this.data.items[key];
    } else {
      m.createdAt = m.createdAt ?? now;
      m.updatedAt = now;
      this.data.items[key] = m;
    }
    this.save();
    return this.get(abs);
  }

  // ---- new / resume markers ----
  markFolderHasNewFile(absFilePath: string): void {
    const fileName = path.basename(path.resolve(absFilePath)).toLowerCase();
    const parentAbs = path.dirname(path.resolve(absFilePath));
    if (!fileName || parentAbs.toLowerCase() === this.root.toLowerCase()) return;
    try {
      this.keyOf(parentAbs);
      this.update(parentAbs, (pm) => {
        const list = pm.unopenedFiles ? [...pm.unopenedFiles] : [];
        if (!list.includes(fileName)) {
          list.push(fileName);
          pm.unopenedFiles = list.slice(-50);
        }
      });
    } catch {
      // parent outside root
    }
  }

  markOpened(absFilePath: string, timestamp = Date.now()): ItemMeta | undefined {
    const fileKey = this.keyOf(absFilePath);
    const fileName = path.basename(path.resolve(absFilePath)).toLowerCase();
    const updated = this.update(absFilePath, (m) => {
      m.openedAt = timestamp;
    });
    const parentAbs = path.dirname(path.resolve(absFilePath));
    try {
      this.keyOf(parentAbs); // ensure parent is within root
      this.update(parentAbs, (pm) => {
        pm.lastOpenedChildRelPath = fileKey;
        if (pm.unopenedFiles?.length) {
          pm.unopenedFiles = pm.unopenedFiles.filter((n) => n !== fileName);
        }
      });
    } catch {
      // parent is outside root (e.g. if absFilePath was root itself)
    }
    return updated;
  }

  resetAsNew(absFilePath: string): ItemMeta | undefined {
    const fileKey = this.keyOf(absFilePath);
    const updated = this.update(absFilePath, (m) => {
      delete m.openedAt;
    });
    const parentAbs = path.dirname(path.resolve(absFilePath));
    try {
      const parentKey = this.keyOf(parentAbs);
      const pm = this.data.items[parentKey];
      if (pm?.lastOpenedChildRelPath === fileKey) {
        this.update(parentAbs, (m) => {
          delete m.lastOpenedChildRelPath;
        });
      }
    } catch {
      // ignore
    }
    return updated;
  }

  setColor(abs: string, color: string | null): ItemMeta | undefined {
    if (color !== null && !(COLOR_IDS as readonly string[]).includes(color)) throw new Error('Unknown color');
    return this.update(abs, (m) => { if (color) m.color = color as ColorId; else delete m.color; });
  }

  setTag(abs: string, tag: string | null): ItemMeta | undefined {
    const clean = typeof tag === 'string' ? tag.trim().slice(0, 32) : '';
    return this.update(abs, (m) => { if (clean) m.tag = clean; else delete m.tag; });
  }

  setSummary(abs: string, text: string | null): ItemMeta | undefined {
    const t = String(text ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_SUMMARY);
    return this.update(abs, (m) => { if (t) m.summary = t; else delete m.summary; });
  }

  isAutoCreated(abs: string): boolean {
    try {
      return !!this.get(abs)?.autoCreated;
    } catch {
      return false;
    }
  }

  setAutoCreated(abs: string, value = true): ItemMeta | undefined {
    return this.update(abs, (m) => {
      if (value) m.autoCreated = true;
      else delete m.autoCreated;
    });
  }

  // ---- folder/group aliases (shortcuts / alternate names) ----
  getAliases(abs: string): string[] {
    return [...(this.get(abs)?.aliases ?? [])];
  }

  setAliases(abs: string, aliases: string[]): string[] {
    const clean: string[] = [];
    const seen = new Set<string>();
    for (const raw of Array.isArray(aliases) ? aliases : []) {
      const trimmed = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ALIAS_LEN);
      const norm = normalizeAliasForCompare(trimmed);
      if (!trimmed || !norm || seen.has(norm)) continue;
      seen.add(norm);
      clean.push(trimmed);
      if (clean.length >= MAX_ALIASES) break;
    }
    const updated = this.update(abs, (m) => {
      if (clean.length > 0) m.aliases = clean;
      else delete m.aliases;
    });
    return [...(updated?.aliases ?? [])];
  }

  addAlias(abs: string, alias: string): string[] {
    const current = this.getAliases(abs);
    return this.setAliases(abs, [...current, alias]);
  }

  removeAlias(abs: string, alias: string): string[] {
    const targetNorm = normalizeAliasForCompare(alias);
    if (!targetNorm) return this.getAliases(abs);
    const current = this.getAliases(abs).filter((a) => normalizeAliasForCompare(a) !== targetNorm);
    return this.setAliases(abs, current);
  }

  /**
   * Look up a folder path (relative to root) whose registered aliases match `query`.
   */
  findByAlias(query: string): { folderPath: string; matchedAlias: string } | null {
    const qNorm = normalizeAliasForCompare(query);
    const qCompact = normalizeAliasCompact(query);
    if (!qNorm) return null;

    for (const [relKey, meta] of Object.entries(this.data.items)) {
      if (!meta.aliases?.length) continue;
      for (const a of meta.aliases) {
        if (normalizeAliasForCompare(a) === qNorm || (qCompact.length >= 2 && normalizeAliasCompact(a) === qCompact)) {
          return { folderPath: path.join(this.root, relKey), matchedAlias: a };
        }
      }
    }
    return null;
  }

  /** Keep metadata (color, summary, aliases, openedAt, lastOpenedChildRelPath) attached when an item is renamed or moved. */
  moveKey(oldAbs: string, newAbs: string): void {
    const from = this.keyOf(oldAbs);
    const to = this.keyOf(newAbs);
    if (from === to) return;

    let changed = false;
    const moved: [string, ItemMeta][] = [];
    for (const k of Object.keys(this.data.items)) {
      if (k === from || k.startsWith(from + path.sep)) {
        const entry = { ...this.data.items[k] };
        if (entry.lastOpenedChildRelPath && (entry.lastOpenedChildRelPath === from || entry.lastOpenedChildRelPath.startsWith(from + path.sep))) {
          entry.lastOpenedChildRelPath = to + entry.lastOpenedChildRelPath.slice(from.length);
        }
        moved.push([to + k.slice(from.length), entry]);
        delete this.data.items[k];
        changed = true;
      }
    }
    for (const [k, v] of moved) this.data.items[k] = v;

    // Update or clear the old parent folder's lastOpenedChildRelPath pointer
    const oldParent = path.dirname(path.resolve(oldAbs));
    const newParent = path.dirname(path.resolve(newAbs));
    try {
      const oldParentKey = this.keyOf(oldParent);
      const pm = this.data.items[oldParentKey];
      if (pm?.lastOpenedChildRelPath === from) {
        if (oldParent.toLowerCase() === newParent.toLowerCase()) {
          pm.lastOpenedChildRelPath = to;
        } else {
          delete pm.lastOpenedChildRelPath;
          if (!pm.color && !pm.summary && !pm.aliases && pm.openedAt === undefined && !pm.autoCreated) {
            delete this.data.items[oldParentKey];
          }
        }
        changed = true;
      }
    } catch {
      // ignore if parent outside root
    }

    if (changed) this.save();
  }

  /** Forget metadata of an item (and its children), e.g. after it went to the Recycle Bin. */
  removeKey(abs: string): void {
    const key = this.keyOf(abs);
    let changed = false;
    for (const k of Object.keys(this.data.items)) {
      if (k === key || k.startsWith(key + path.sep)) { delete this.data.items[k]; changed = true; }
    }
    const parentAbs = path.dirname(path.resolve(abs));
    try {
      const parentKey = this.keyOf(parentAbs);
      const pm = this.data.items[parentKey];
      const base = path.basename(path.resolve(abs));
      if (pm) {
        let pmChanged = false;
        if (pm.lastOpenedChildRelPath && (pm.lastOpenedChildRelPath === key || pm.lastOpenedChildRelPath.startsWith(key + path.sep))) {
          delete pm.lastOpenedChildRelPath;
          pmChanged = true;
        }
        if (pm.unopenedFiles?.includes(base)) {
          const next = pm.unopenedFiles.filter((f) => f !== base);
          if (next.length > 0) pm.unopenedFiles = next;
          else delete pm.unopenedFiles;
          pmChanged = true;
        }
        if (pmChanged) {
          if (!pm.color && !pm.summary && !pm.aliases && pm.openedAt === undefined && !pm.lastOpenedChildRelPath && !pm.unopenedFiles && !pm.autoCreated) {
            delete this.data.items[parentKey];
          }
          changed = true;
        }
      }
    } catch {
      // ignore
    }
    if (changed) this.save();
  }

  // ---- global shortcuts ----
  getShortcuts() { return { ...this.data.shortcuts }; }

  setShortcut(alias: string, target: string | null) {
    const a = alias.trim().toLowerCase();
    if (!a) return this.getShortcuts();
    if (target) this.data.shortcuts[a] = target; else delete this.data.shortcuts[a];
    this.save();
    return this.getShortcuts();
  }
}
