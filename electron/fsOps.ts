import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';
import type { DownloadProvenance, FileHashes, FilePreviewResult, FolderIndicator } from '../src/types/files';
import { inspectSeriesCompletion } from './sequenceOrganizer';

const execFileAsync = promisify(execFile);
export const SUPPORTED_ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz']);

/** Pure filesystem operations. Every path is validated against `root`. */

const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function validateName(name: string): string {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('Name is empty');
  if (n === '.' || n === '..') throw new Error('Invalid name');
  if (INVALID_CHARS.test(n)) throw new Error('Name contains characters not allowed on Windows: \\ / : * ? " < > |');
  if (RESERVED.test(n)) throw new Error('Name is reserved by Windows');
  if (/[. ]$/.test(n)) throw new Error('Name cannot end with a dot or a space');
  if (n.length > 255) throw new Error('Name is too long');
  return n;
}

function lexicallyInside(root: string, target: string): boolean {
  const rel = path.relative(root.toLowerCase(), target.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve `p` and make sure it (and its real location, if it exists) is inside root. */
export function resolveInside(root: string, p: string): string {
  if (typeof p !== 'string' || !p) throw new Error('Invalid path');
  const r = path.resolve(root);
  const resolved = path.resolve(p);
  if (!lexicallyInside(r, resolved)) throw new Error('Access denied: path is outside the allowed folder');
  // Guard against junctions/symlinks that point outside the root.
  let probe = resolved;
  while (!fs.existsSync(probe) && probe !== path.dirname(probe)) probe = path.dirname(probe);
  if (fs.existsSync(probe)) {
    const real = fs.realpathSync.native(probe);
    if (!lexicallyInside(fs.realpathSync.native(r), real)) throw new Error('Access denied: path resolves outside the allowed folder');
  }
  return resolved;
}

function assertNotRoot(root: string, p: string): void {
  if (path.resolve(p).toLowerCase() === path.resolve(root).toLowerCase()) throw new Error('Operation not allowed on the root folder');
}

/** "name (1).ext" style unique path inside `dir`. */
export function uniquePath(dir: string, name: string): string {
  let candidate = path.join(dir, name);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(name);
  const base = ext && name.length > ext.length ? name.slice(0, -ext.length) : name;
  const finalExt = ext && name.length > ext.length ? ext : '';
  for (let i = 1; i < 10000; i++) {
    candidate = path.join(dir, `${base} (${i})${finalExt}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find a free name');
}

export async function moveItems(root: string, sources: string[], targetDir: string): Promise<string[]> {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const target = resolveInside(root, targetDir);
  if (!(await fs.promises.stat(target)).isDirectory()) throw new Error('Target is not a folder');
  const srcs = sources.map((s) => { const r = resolveInside(root, s); assertNotRoot(root, r); return r; });
  const result: string[] = [];
  for (const src of srcs) {
    const st = await fs.promises.lstat(src);
    if (path.dirname(src).toLowerCase() === target.toLowerCase()) { result.push(src); continue; } // already there
    if (st.isDirectory() && lexicallyInside(src, target)) throw new Error('Cannot move a folder into itself');
    const dest = uniquePath(target, path.basename(src));
    await fs.promises.rename(src, dest);
    result.push(dest);
  }
  return result;
}

export async function renameItem(root: string, itemPath: string, newName: string): Promise<string> {
  const src = resolveInside(root, itemPath);
  assertNotRoot(root, src);
  const name = validateName(newName);
  const dest = path.join(path.dirname(src), name);
  if (dest === src) return src;
  const sameIgnoringCase = dest.toLowerCase() === src.toLowerCase();
  if (!sameIgnoringCase && fs.existsSync(dest)) throw new Error('An item with this name already exists');
  await fs.promises.rename(src, dest);
  return dest;
}

export async function calculateFolderSize(root: string, folderPath: string): Promise<number> {
  const dir = resolveInside(root, folderPath);
  const walk = async (d: string): Promise<number> => {
    let dirents: fs.Dirent[];
    try { dirents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return 0; }
    const sizes = await Promise.all(dirents.map(async (e) => {
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) return 0;
      if (e.isDirectory()) return walk(full);
      try { return (await fs.promises.stat(full)).size; } catch { return 0; }
    }));
    return sizes.reduce((a, b) => a + b, 0);
  };
  return walk(dir);
}

/**
 * Scans each folder (up to depth 3) to detect duplicate or suspected duplicate files
 * (matching normalized name / copy suffix like ` (1)` or matching non-zero byte size).
 */
export async function inspectFolderIndicators(
  root: string,
  folderPaths: string[]
): Promise<Record<string, FolderIndicator>> {
  const out: Record<string, FolderIndicator> = {};
  for (const fp of (Array.isArray(folderPaths) ? folderPaths : []).slice(0, 120)) {
    try {
      const dir = resolveInside(root, fp);
      const seenNames = new Set<string>();
      const seenSizes = new Set<number>();
      let hasDuplicates = false;
      let duplicateReason: string | undefined;
      let scanned = 0;

      const walk = async (d: string, depth: number): Promise<void> => {
        if (hasDuplicates || depth > 3 || scanned >= 500) return;
        let dirents: fs.Dirent[];
        try { dirents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const ent of dirents) {
          if (hasDuplicates || scanned >= 500) break;
          if (ent.isSymbolicLink()) continue;
          const full = path.join(d, ent.name);
          if (ent.isDirectory()) {
            await walk(full, depth + 1);
            continue;
          }
          if (/\.(aria2|tmp)$/i.test(ent.name)) continue;
          scanned++;
          const ext = path.extname(ent.name).toLowerCase();
          const stem = (ext ? ent.name.slice(0, -ext.length) : ent.name)
            .replace(/\s*\(\d+\)$/, '')
            .replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')
            .trim()
            .toLowerCase();
          const normName = `${stem}${ext}`;
          if (seenNames.has(normName)) {
            hasDuplicates = true;
            duplicateReason = ent.name;
            break;
          }
          seenNames.add(normName);
          try {
            const st = await fs.promises.stat(full);
            if (st.size > 0) {
              if (seenSizes.has(st.size)) {
                hasDuplicates = true;
                duplicateReason = ent.name;
                break;
              }
              seenSizes.add(st.size);
            }
          } catch { /* ignore */ }
        }
      };

      await walk(dir, 0);
      const completion = await inspectSeriesCompletion(dir);
      out[dir.toLowerCase()] = {
        hasDuplicates,
        ...(duplicateReason ? { duplicateReason } : {}),
        ...(completion.isComplete ? { isComplete: true, totalEpisodes: completion.totalEpisodes } : {})
      };
    } catch { /* ignore invalid folder */ }
  }
  return out;
}

function archiveBaseName(archivePath: string): string {
  const base = path.basename(archivePath);
  return base.replace(/\.tar\.(?:gz|bz2|xz)$/i, '').replace(/\.[^.]+$/, '') || 'extracted';
}

async function listTarEntries(archivePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('tar', ['-tf', archivePath], {
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024
  });
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== './' && l !== '.');
}

/**
 * Extract an archive (.zip via AdmZip, or .rar/.7z/.tar/.gz/.bz2/.xz/.tgz via Windows bsdtar).
 * mode:
 * - 'smart': 1 top-level item -> next to archive; multiple -> folder named after archive.
 * - 'folder': always extract into a new folder named after the archive.
 * - 'here': extract directly into the archive's parent directory.
 */
export async function smartExtractArchive(
  root: string,
  archivePath: string,
  mode: 'smart' | 'folder' | 'here' = 'smart'
): Promise<string> {
  const archive = resolveInside(root, archivePath);
  const ext = path.extname(archive).toLowerCase();
  if (!SUPPORTED_ARCHIVE_EXTS.has(ext)) {
    throw new Error(`Unsupported archive format: ${ext || 'unknown'}`);
  }

  const parent = path.dirname(archive);
  const norm = (n: string) => n.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

  if (ext === '.zip') {
    const zip = new AdmZip(archive);
    const entries = zip.getEntries().filter((e) => norm(e.entryName) !== '');
    if (entries.length === 0) throw new Error('Archive is empty');

    const topLevel = new Set(entries.map((e) => norm(e.entryName).split('/')[0]));
    const single = mode === 'smart' && topLevel.size === 1;
    const outDir =
      mode === 'here' || single
        ? parent
        : uniquePath(parent, archiveBaseName(archive));
    if (mode !== 'here' && !single) await fs.promises.mkdir(outDir, { recursive: true });

    const topName = [...topLevel][0];
    const renamedTop = single ? path.basename(uniquePath(outDir, validateName(topName))) : topName;
    const outRoot = path.resolve(outDir);

    let total = 0;
    const MAX_TOTAL = 50 * 1024 ** 3;
    const MAX_ENTRY = 4 * 1024 ** 3;
    for (const entry of entries) {
      const parts = norm(entry.entryName).split('/');
      if (single) parts[0] = renamedTop;
      const dest = path.resolve(outRoot, ...parts);
      if (!lexicallyInside(outRoot, dest) || dest === outRoot) throw new Error(`Unsafe path in archive: ${entry.entryName}`);
      resolveInside(root, dest);
      if (entry.isDirectory) { await fs.promises.mkdir(dest, { recursive: true }); continue; }
      if (entry.header.size < 0 || entry.header.size > MAX_ENTRY) throw new Error('Archive entry is too large to extract');
      total += entry.header.size;
      if (total > MAX_TOTAL) throw new Error('Archive is too large to extract');
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      if (mode === 'here') {
        const safeDest = fs.existsSync(dest) ? uniquePath(path.dirname(dest), path.basename(dest)) : dest;
        await fs.promises.writeFile(safeDest, entry.getData(), { flag: 'wx' });
      } else {
        await fs.promises.writeFile(dest, entry.getData(), { flag: 'wx' });
      }
    }
    return single ? path.join(outDir, renamedTop) : outDir;
  }

  // Non-zip archives via Windows bsdtar (libarchive)
  const rawList = await listTarEntries(archive);
  if (rawList.length === 0) throw new Error('Archive is empty');
  const outDir = mode === 'here' ? parent : uniquePath(parent, archiveBaseName(archive));
  const outRoot = path.resolve(outDir);
  for (const rawEntry of rawList) {
    const clean = norm(rawEntry);
    if (!clean) continue;
    const parts = clean.split('/');
    const dest = path.resolve(outRoot, ...parts);
    if (!lexicallyInside(outRoot, dest) || dest === outRoot) {
      throw new Error(`Unsafe path in archive: ${rawEntry}`);
    }
    resolveInside(root, dest);
  }
  if (mode !== 'here') await fs.promises.mkdir(outDir, { recursive: true });
  await execFileAsync('tar', ['-xf', archive, '-C', outDir], { timeout: 120000 });
  return outDir;
}

/**
 * Computes SHA-256 and MD5 hashes of a file via streaming so the UI / event loop is never blocked.
 */
export async function computeFileHashes(root: string, filePath: string): Promise<FileHashes> {
  const target = resolveInside(root, filePath);
  const st = await fs.promises.stat(target);
  if (st.isDirectory()) throw new Error('Cannot compute checksum of a folder');

  return new Promise((resolve, reject) => {
    const sha256 = crypto.createHash('sha256');
    const md5 = crypto.createHash('md5');
    const stream = fs.createReadStream(target);
    stream.on('data', (chunk) => {
      sha256.update(chunk);
      md5.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve({
        sha256: sha256.digest('hex'),
        md5: md5.digest('hex'),
        size: st.size
      });
    });
  });
}

/**
 * Renames multiple files/folders inside `root` safely, returning `{ from, to }[]` pairs.
 */
export async function batchRename(
  root: string,
  items: { path: string; newName: string }[]
): Promise<{ from: string; to: string }[]> {
  const results: { from: string; to: string }[] = [];
  for (const entry of items) {
    const src = resolveInside(root, entry.path);
    const clean = validateName(entry.newName);
    if (path.resolve(src).toLowerCase() === path.resolve(root).toLowerCase()) {
      throw new Error('Cannot rename the downloads root');
    }
    const dest = resolveInside(root, path.join(path.dirname(src), clean));
    if (src.toLowerCase() === dest.toLowerCase()) continue;
    if (fs.existsSync(dest)) throw new Error(`An item named "${clean}" already exists`);
    await fs.promises.rename(src, dest);
    results.push({ from: src, to: dest });
  }
  return results;
}

const PREVIEW_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
};

const PREVIEW_TEXT_EXTS = new Set([
  '.txt', '.md', '.json', '.log', '.srt', '.ass', '.vtt', '.csv', '.xml',
  '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.htm', '.yml', '.yaml', '.ini', '.conf'
]);

/**
 * Reads a lightweight preview (image data URL, first 64 KB of text, .zip contents, or file info) inside `root`.
 */
export async function readFilePreview(
  root: string,
  itemPath: string,
  provenance?: DownloadProvenance
): Promise<FilePreviewResult> {
  const target = resolveInside(root, itemPath);
  const st = await fs.promises.stat(target);
  const ext = path.extname(target).toLowerCase();
  const base: FilePreviewResult = {
    kind: 'info',
    name: path.basename(target),
    size: st.size,
    modifiedMs: st.mtimeMs,
    extension: ext,
    ...(provenance ? { provenance } : {})
  };
  if (st.isDirectory()) return base;

  const mime = PREVIEW_IMAGE_MIME[ext];
  if (mime && st.size <= 10 * 1024 * 1024) {
    const buf = await fs.promises.readFile(target);
    return { ...base, kind: 'image', dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  }

  if (PREVIEW_TEXT_EXTS.has(ext)) {
    const maxBytes = Math.min(64 * 1024, st.size);
    const fh = await fs.promises.open(target, 'r');
    try {
      const buf = Buffer.alloc(maxBytes);
      const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
      return { ...base, kind: 'text', text: buf.subarray(0, bytesRead).toString('utf8') };
    } finally {
      await fh.close();
    }
  }

  const MAX_ARCHIVE_PREVIEW_BYTES = 512 * 1024 * 1024;
  if (ext === '.zip' && st.size <= MAX_ARCHIVE_PREVIEW_BYTES) {
    try {
      const zip = new AdmZip(target);
      const rawEntries = zip.getEntries();
      const archiveEntries = rawEntries.slice(0, 200).map((e) => ({
        name: e.entryName,
        isDirectory: e.isDirectory,
        size: e.header.size
      }));
      return {
        ...base,
        kind: 'archive',
        archiveEntries,
        archiveTotalCount: rawEntries.length
      };
    } catch {
      return base;
    }
  }

  if (SUPPORTED_ARCHIVE_EXTS.has(ext) && st.size <= MAX_ARCHIVE_PREVIEW_BYTES) {
    try {
      const listed = await listTarEntries(target);
      const archiveEntries = listed.slice(0, 200).map((name) => ({
        name,
        isDirectory: name.endsWith('/'),
        size: 0
      }));
      return {
        ...base,
        kind: 'archive',
        archiveEntries,
        archiveTotalCount: listed.length
      };
    } catch {
      return base;
    }
  }

  return base;
}

async function readImageThumbnailDataUrl(imgPath: string): Promise<string | null> {
  try {
    const st = await fs.promises.stat(imgPath);
    if (!st.isFile() || st.size === 0 || st.size > 10 * 1024 * 1024) return null;
    const ext = path.extname(imgPath).toLowerCase();
    const mime = PREVIEW_IMAGE_MIME[ext];
    if (!mime) return null;

    if (ext !== '.svg') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron') as { nativeImage?: { createFromPath: (p: string) => { isEmpty: () => boolean; resize: (opts: { width: number }) => { toDataURL: () => string } } } };
        if (electron?.nativeImage) {
          const img = electron.nativeImage.createFromPath(imgPath);
          if (!img.isEmpty()) {
            return img.resize({ width: 128 }).toDataURL();
          }
        }
      } catch { /* plain Node.js or resize failed */ }
    }

    if (st.size <= 512 * 1024) {
      const buf = await fs.promises.readFile(imgPath);
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Returns a lightweight thumbnail data URL for an image file or the first image inside a folder.
 */
export async function getThumbnail(root: string, itemPath: string): Promise<string | null> {
  const target = resolveInside(root, itemPath);
  const st = await fs.promises.stat(target);
  if (st.isFile()) {
    return readImageThumbnailDataUrl(target);
  }
  if (st.isDirectory()) {
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(target, { withFileTypes: true });
    } catch {
      return null;
    }
    let checked = 0;
    for (const d of dirents) {
      if (!d.isFile()) continue;
      const ext = path.extname(d.name).toLowerCase();
      if (!PREVIEW_IMAGE_MIME[ext]) continue;
      checked++;
      const thumb = await readImageThumbnailDataUrl(path.join(target, d.name));
      if (thumb) return thumb;
      if (checked >= 3) break;
    }
  }
  return null;
}
