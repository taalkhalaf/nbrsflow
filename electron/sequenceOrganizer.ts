import * as fs from 'node:fs';
import * as path from 'node:path';
import type { OrganizeGroupResult, OrganizeResult } from '../src/types/files';
import { moveItems, resolveInside, validateName } from './fsOps';
import { normalizeAliasCompact, normalizeAliasForCompare } from './storage/metadataStore';

export interface NormalizedSequenceInfo {
  rawName: string;
  normalizedTitle: string;
  normalizedKey: string;
  hasSequenceMarker: boolean;
  /** True when an explicit marker (S01E01, Ep.01, Part 1, الحلقة 1, .part1.rar, etc.) is present. */
  isExplicitSequence: boolean;
  sequenceIndex?: number;
  /** True when the filename carries an `end` final-episode suffix (e.g. E12end, 12 end, الحلقة 12 end). */
  isEndEpisode?: boolean;
}

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

const ARABIC_ORDINALS: Record<string, number> = {
  'الأولى': 1, 'الاولى': 1, 'الأول': 1, 'الاول': 1, 'أولى': 1, 'اولى': 1, 'أول': 1, 'اول': 1,
  'الثانية': 2, 'الثانيه': 2, 'الثاني': 2, 'ثانية': 2, 'ثاني': 2,
  'الثالثة': 3, 'الثالثه': 3, 'الثالث': 3, 'ثالثة': 3, 'ثالث': 3,
  'الرابعة': 4, 'الرابعه': 4, 'الرابع': 4, 'رابعة': 4, 'رابع': 4,
  'الخامسة': 5, 'الخامسه': 5, 'الخامس': 5, 'خامسة': 5, 'خامس': 5,
  'السادسة': 6, 'السادسه': 6, 'السادس': 6, 'سادسة': 6, 'سادس': 6,
  'السابعة': 7, 'السابعه': 7, 'السابع': 7, 'سابعة': 7, 'سابع': 7,
  'الثامنة': 8, 'الثامنه': 8, 'الثامن': 8, 'ثامنة': 8, 'ثامن': 8,
  'التاسعة': 9, 'التاسعه': 9, 'التاسع': 9, 'تاسعة': 9, 'تاسع': 9,
  'العاشرة': 10, 'العاشره': 10, 'العاشر': 10, 'عاشرة': 10, 'عاشر': 10
};

/** Spoken Arabic letter / English-transliterated initial names (e.g. ج -> جي, ت -> تي). */
const ARABIC_LETTER_PHONETIC: Record<string, string> = {
  'ا': 'اي', 'أ': 'اي', 'إ': 'اي', 'آ': 'اي',
  'ب': 'بي',
  'ت': 'تي', 'ط': 'تي',
  'ث': 'ثي',
  'ج': 'جي',
  'ح': 'اتش', 'ه': 'اتش',
  'خ': 'كي', 'ك': 'كي', 'ق': 'كيو',
  'د': 'دي', 'ض': 'دي',
  'ذ': 'ذال',
  'ر': 'ار',
  'ز': 'زي',
  'س': 'اس', 'ص': 'اس',
  'ش': 'شين',
  'ع': 'سي',
  'غ': 'جي',
  'ف': 'اف',
  'ل': 'ال',
  'م': 'ام',
  'ن': 'ان',
  'و': 'دبليو',
  'ي': 'واي'
};

const EN_STOP_WORDS = new Set(['the', 'of', 'on', 'in', 'at', 'to', 'a', 'an', 'and', 'for']);
const AR_STOP_WORDS = new Set(['في', 'من', 'على', 'علي', 'عن', 'إلى', 'الى', 'و', 'او', 'أو']);

/** Extensible synonym/abbreviation groups (normalized automatically on lookup). */
const CUSTOM_SYNONYM_GROUPS: string[][] = [
  ['تايم جولد', 'تي جي', 'ت ج', 'تج', 'TG', 'Time Gold'],
  ['جولد تايم', 'جي تي', 'ج ت', 'جت'],
  ['Golden Time', 'GT']
];

export function registerTitleSynonyms(group: string[]): void {
  const clean = group.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (clean.length >= 2) CUSTOM_SYNONYM_GROUPS.push(clean);
}

function findSynonymGroup(title: string): string[] {
  const qNorm = normalizeAliasForCompare(title);
  const qCompact = normalizeAliasCompact(title);
  if (!qNorm) return [];
  for (const grp of CUSTOM_SYNONYM_GROUPS) {
    if (grp.some((item) => normalizeAliasForCompare(item) === qNorm || (qCompact.length >= 2 && normalizeAliasCompact(item) === qCompact))) {
      return grp;
    }
  }
  return [];
}

/**
 * Generates candidate abbreviations/acronyms for a folder or series title in English & Arabic.
 * Examples:
 * - "Golden Time" -> ["GT", "G T"]
 * - "جولد تايم" -> ["جي تي", "ج ت", "جت"]
 */
export function generateTitleAliases(title: string): string[] {
  const clean = String(title ?? '').replace(/[._\-–—~|/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
  const rawWords = clean.split(' ').filter(Boolean);
  if (rawWords.length < 2) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string) => {
    const t = candidate.replace(/\s+/g, ' ').trim();
    const norm = normalizeAliasForCompare(t);
    if (!t || !norm || norm === normalizeAliasForCompare(clean) || seen.has(norm)) return;
    seen.add(norm);
    out.push(t);
  };

  const isArabic = /[\u0600-\u06FF]/.test(clean);

  if (!isArabic) {
    const wordSets = [rawWords];
    if (rawWords.length > 2) {
      const filtered = rawWords.filter((w) => !EN_STOP_WORDS.has(w.toLowerCase()));
      if (filtered.length >= 2 && filtered.length !== rawWords.length) wordSets.push(filtered);
    }
    for (const words of wordSets) {
      const initials = words.map((w) => w[0].toUpperCase()).filter((c) => /[A-Z0-9]/.test(c));
      if (initials.length >= 2) {
        push(initials.join(''));
        push(initials.join(' '));
      }
    }
  } else {
    const wordSets = [rawWords];
    if (rawWords.length > 2) {
      const filtered = rawWords.filter((w) => !AR_STOP_WORDS.has(w));
      if (filtered.length >= 2 && filtered.length !== rawWords.length) wordSets.push(filtered);
    }
    for (const words of wordSets) {
      // Extract primary initial of each Arabic word (strip leading "ال" if word has >= 4 chars)
      const strippedInitials = words.map((w) => {
        const bare = w.replace(/^[\u064B-\u065F]+/, '');
        if (bare.startsWith('ال') && bare.length >= 4) return bare[2];
        return bare[0];
      }).filter(Boolean);

      const rawInitials = words.map((w) => w[0]).filter(Boolean);

      for (const initials of [strippedInitials, rawInitials]) {
        if (initials.length < 2) continue;
        // 1. Phonetic initials (e.g. جولد تايم -> جي تي)
        const phonetics = initials.map((ch) => ARABIC_LETTER_PHONETIC[ch] || ch);
        if (phonetics.every(Boolean)) {
          push(phonetics.join(' '));
        }
        // 2. Spaced initials (e.g. ج ت)
        push(initials.join(' '));
        // 3. Compact initials (e.g. جت)
        push(initials.join(''));
      }
    }
  }

  return out;
}

/**
 * Checks if `queryTitle` matches `targetTitle` directly, via explicit aliases, or via generated candidate aliases.
 */
export function matchTitleOrAlias(
  queryTitle: string,
  targetTitle: string,
  explicitAliases: string[] = []
): { matched: boolean; viaAlias?: string } {
  const qNorm = normalizeAliasForCompare(queryTitle);
  const qCompact = normalizeAliasCompact(queryTitle);
  const tNorm = normalizeAliasForCompare(targetTitle);
  if (!qNorm || !tNorm) return { matched: false };

  if (qNorm === tNorm) return { matched: true };

  for (const a of explicitAliases) {
    const aNorm = normalizeAliasForCompare(a);
    const aCompact = normalizeAliasCompact(a);
    if (aNorm && (qNorm === aNorm || (qCompact.length >= 2 && qCompact === aCompact))) {
      return { matched: true, viaAlias: a };
    }
  }

  for (const gen of generateTitleAliases(targetTitle)) {
    const gNorm = normalizeAliasForCompare(gen);
    const gCompact = normalizeAliasCompact(gen);
    if (gNorm && (qNorm === gNorm || (qCompact.length >= 2 && qCompact === gCompact))) {
      return { matched: true, viaAlias: queryTitle };
    }
  }

  for (const syn of findSynonymGroup(targetTitle)) {
    const sNorm = normalizeAliasForCompare(syn);
    const sCompact = normalizeAliasCompact(syn);
    if (sNorm && (qNorm === sNorm || (qCompact.length >= 2 && qCompact === sCompact))) {
      return { matched: true, viaAlias: queryTitle };
    }
  }

  return { matched: false };
}

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d);
}

function parseSeqToken(token: string): number | undefined {
  const clean = toAsciiDigits(token.trim());
  if (/^\d+$/.test(clean)) return Number(clean);
  return ARABIC_ORDINALS[clean];
}

const QUALITY_AND_CODEC_RE = new RegExp(
  '(?:^|[\\s._\\-\\[\\]()])(?:' +
    '4320p|2160p|1440p|1080p|1080i|720p|720i|576p|576i|480p|480i|360p|240p|4k|8k|2k|uhd|fhd|hdrip|hdtv|hd|sd|' +
    'web-dl|webdl|webrip|web-rip|bluray|blu-ray|bdrip|brrip|dvdrip|dvd|tvrip|satrip|cam|hdts|' +
    'hdr10\\+|hdr10|hdr|dovi|dolby\\s*vision|' +
    'x264|x265|h\\.?264|h\\.?265|hevc|avc|av1|xvid|divx|vp9|10bit|10-bit|8bit|8-bit|' +
    'aac2\\.?0|aac|ac-?3|e-?ac-?3|ddp5\\.?1|dts-hd|dts|truehd|atmos|flac|opus|mp3|mp4|mkv|avi|' +
    '128kbps|192kbps|256kbps|320kbps|' +
    'dual-audio|multi-subs|multisubs|proper|repack|remux|extended|uncut|uncensored|subbed|dubbed|raw|complete|final|' +
    'arabic|english|مترجم|مدبلج|اونلاين|كامل' +
  ')(?=$|[\\s._\\-\\[\\]()])',
  'gi'
);

const KNOWN_EXTENSIONS_RE = /\.(?:mkv|mp4|avi|mov|wmv|webm|flv|m4v|ts|mp3|wav|flac|aac|ogg|m4a|wma|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|epub|csv|zip|rar|7z|tar|gz|bz2|xz|iso|exe|msi|apk|srt|ass|vtt|bin)$/i;

/** Produces a punctuation-free, separator-agnostic comparison key for similarity/sequence matching. */
export function normalizeSequenceKey(text: string): string {
  return normalizeAliasForCompare(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitleText(s: string): string {
  let out = s
    .replace(QUALITY_AND_CODEC_RE, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s*[-–—~|:]+\s*/g, ' ')
    .replace(/[,;!?@#$%^&+=]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Remove forbidden Windows folder characters and trailing dots
  out = out.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/[. ]+$/, '').replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Extracts the normalized work/series title and sequence/episode metadata from a file name.
 */
export function normalizeTitle(rawName: string): NormalizedSequenceInfo {
  const raw = String(rawName ?? '').trim();
  let working = raw;
  let hasSequenceMarker = false;
  let isExplicitSequence = false;
  let sequenceIndex: number | undefined;
  let isEndEpisode = false;

  // 1. Check split archive extensions first: .part1.rar, .part01.rar, .7z.001, .zip.001, .r01, .z01
  const splitArchMatch = working.match(/\.(?:part\s*(\d{1,4})\.(?:rar|zip|7z)|(?:7z|zip|rar)\.(\d{3,4})|[rz](\d{2,3}))$/i);
  if (splitArchMatch) {
    hasSequenceMarker = true;
    isExplicitSequence = true;
    sequenceIndex = Number(splitArchMatch[1] || splitArchMatch[2] || splitArchMatch[3]);
    working = working.slice(0, splitArchMatch.index);
  } else {
    // Strip standard file extensions (up to two levels like .tar.gz)
    working = working.replace(/\.(?:tar\.(?:gz|bz2|xz))$/i, '');
    working = working.replace(KNOWN_EXTENSIONS_RE, '');
  }

  // 2. Inspect brackets/parentheses for sequence numbers (e.g. "(03)" or "[02]" or "(Ep 04)") before stripping them
  let bracketSeqIndex: number | undefined;
  let bracketExplicit = false;
  const bracketMatches = [...working.matchAll(/\[([^\]]+)\]|(?:\(([^)]+)\))/g)];
  for (const m of bracketMatches) {
    const innerRaw = (m[1] ?? m[2] ?? '').trim();
    const innerEnd = innerRaw.match(/^(.*\d)\s*[-_.]*\s*end$/i);
    const inner = innerEnd ? innerEnd[1].trim() : innerRaw;
    if (innerEnd) isEndEpisode = true;
    const epM = inner.match(/^(?:s\d{1,2}\s*e(\d{1,4})|(?:ep?\.?|episode|part|pt\.?|vol\.?|الحلقة|حلقة|الجزء|جزء)\s*(\d{1,4}|[٠-٩]{1,4}))$/i);
    if (epM) {
      bracketExplicit = true;
      bracketSeqIndex = parseSeqToken(epM[1] || epM[2]);
    } else if (/^\d{1,3}$/.test(inner)) {
      const n = Number(inner);
      if (![360, 480, 576, 720, 264, 265].includes(n)) {
        bracketSeqIndex = n;
      }
    }
  }

  // Strip [...] and (...) blocks
  working = working.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ');

  // Detect and strip final-episode `end` suffix attached to a number/episode marker (e.g. E12end, 12 end, الحلقة 12 end)
  const asciiWorking = toAsciiDigits(working);
  if (/(\d)\s*[-_.]*\s*end(?=$|[\s._\-])/i.test(asciiWorking)) {
    isEndEpisode = true;
    working = asciiWorking.replace(/(\d)\s*[-_.]*\s*end(?=$|[\s._\-])/gi, '$1 ');
  }

  // Normalize separators for pattern detection while keeping positions
  const normSep = toAsciiDigits(working).replace(/[._]+/g, ' ');

  // 3. Explicit sequence patterns (English & Arabic)
  const ordinalGroup = Object.keys(ARABIC_ORDINALS).join('|');
  const explicitPatterns: { re: RegExp; groupIdx: number }[] = [
    // S01E01, S1E2, S01 E02, S01x02
    { re: /(?:^|[\s\-])s\d{1,2}\s*[-x._ ]?\s*(?:e|ep|episode)\s*(\d{1,4})(?=$|[\s\-])/i, groupIdx: 1 },
    // Season 1 Episode 2 / الموسم 1 الحلقة 2
    { re: /(?:^|[\s\-])(?:season|s)\s*\d{1,2}\s*(?:episode|ep?\.?)\s*(\d{1,4})(?=$|[\s\-])/i, groupIdx: 1 },
    { re: new RegExp(`(?:^|[\\s\\-])(?:الموسم|موسم)\\s*(?:\\d{1,2}|${ordinalGroup})\\s*[-–— ]*\\s*(?:الحلقة|حلقة|الحلقه|حلقه)\\s*(?:رقم\\s*)?(\\d{1,4}|${ordinalGroup})(?=$|[\\s\\-])`, 'i'), groupIdx: 1 },
    // Ep 01, Ep.01, E01, Episode 12
    { re: /(?:^|[\s\-])(?:episode|ep\.?|e)\s*(\d{1,4})(?=$|[\s\-])/i, groupIdx: 1 },
    // Part 1, Pt.1, Pt 02, Vol.1, Volume 2, Chapter 3
    { re: /(?:^|[\s\-])(?:part|pt\.?|vol\.?|volume|chapter|ch\.?)\s*(\d{1,4})(?=$|[\s\-])/i, groupIdx: 1 },
    // Arabic: الحلقة 1, الحلقة الأولى, الجزء 1, الجزء الأول
    { re: new RegExp(`(?:^|[\\s\\-])(?:الحلقة|حلقة|الحلقه|حلقه|الجزء|جزء)\\s*(?:رقم\\s*)?(\\d{1,4}|${ordinalGroup})(?=$|[\\s\\-])`, 'i'), groupIdx: 1 }
  ];

  let cutIndex = -1;
  let cutEndIndex = -1;

  for (const { re, groupIdx } of explicitPatterns) {
    const m = normSep.match(re);
    if (m && m.index !== undefined) {
      hasSequenceMarker = true;
      isExplicitSequence = true;
      sequenceIndex = parseSeqToken(m[groupIdx]);
      cutIndex = m.index;
      cutEndIndex = m.index + m[0].length;
      break;
    }
  }

  // 4. Numeric sequence patterns if no explicit marker matched
  if (!hasSequenceMarker) {
    // Strip quality tokens first so "- 1080p" isn't confused with "- 01"
    const withoutQuality = normSep.replace(QUALITY_AND_CODEC_RE, ' ').replace(/\s+/g, ' ').trim();
    // Pattern A: "Title - 01", "Title-01", "Title #01", "Title - 1"
    const dashNum = withoutQuality.match(/^(.*?\S)\s*[-–—~#]\s*(\d{1,3})(?:\s+.*)?$/);
    // Pattern B: "Title 01", "Title 1", "Title v2" at the end
    const trailingNum = !dashNum ? withoutQuality.match(/^(.*?\S)\s+(?:v)?(\d{1,3})$/i) : null;

    if (dashNum) {
      const n = Number(dashNum[2]);
      if (![264, 265, 360, 480, 576, 720].includes(n)) {
        hasSequenceMarker = true;
        sequenceIndex = n;
        working = dashNum[1];
      }
    } else if (trailingNum) {
      const n = Number(trailingNum[2]);
      if (![264, 265, 360, 480, 576, 720].includes(n)) {
        hasSequenceMarker = true;
        sequenceIndex = n;
        working = trailingNum[1];
      }
    } else if (bracketSeqIndex !== undefined) {
      hasSequenceMarker = true;
      isExplicitSequence = bracketExplicit;
      sequenceIndex = bracketSeqIndex;
    }
  } else if (cutIndex >= 0) {
    const before = normSep.slice(0, cutIndex);
    const after = normSep.slice(cutEndIndex);
    // Strip trailing "Season X" / "الموسم X" from `before` if present
    const beforeCleaned = before
      .replace(new RegExp(`(?:^|[\\s\\-])(?:season|s|الموسم|موسم)\\s*(?:\\d{1,2}|${ordinalGroup})\\s*$`, 'i'), ' ')
      .trim();
    working = cleanTitleText(beforeCleaned) ? beforeCleaned : after;
  }

  let normalizedTitle = cleanTitleText(working);
  if (!normalizedTitle) {
    normalizedTitle = cleanTitleText(raw.replace(KNOWN_EXTENSIONS_RE, '')) || 'Downloads';
  }

  try {
    normalizedTitle = validateName(normalizedTitle);
  } catch {
    normalizedTitle = 'Grouped_Sequence';
  }

  return {
    rawName: raw,
    normalizedTitle,
    normalizedKey: normalizeSequenceKey(normalizedTitle),
    hasSequenceMarker,
    isExplicitSequence,
    sequenceIndex,
    ...(isEndEpisode ? { isEndEpisode: true } : {})
  };
}

function sameDir(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

export type UnifiedTypeCategory = 'docs' | 'apps' | 'audio' | 'images';

const UNIFIED_CATEGORY_EXTS: Record<UnifiedTypeCategory, Set<string>> = {
  docs: new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.epub', '.csv', '.rtf', '.odt', '.ods', '.odp']),
  apps: new Set(['.exe', '.msi', '.msix', '.appx', '.bat', '.cmd']),
  audio: new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus']),
  images: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'])
};

const UNIFIED_CATEGORY_ALIASES: Record<UnifiedTypeCategory, Set<string>> = {
  docs: new Set(['documents', 'docs', 'المستندات', 'مستندات']),
  apps: new Set(['executables', 'programs', 'apps', 'التطبيقات', 'البرامج', 'ملفات تنفيذية']),
  audio: new Set(['audio', 'music', 'sounds', 'الصوتيات', 'صوتيات', 'موسيقى']),
  images: new Set(['images', 'pictures', 'photos', 'الصور', 'صور'])
};

const UNIFIED_CATEGORY_NAMES: Record<UnifiedTypeCategory, { ar: string; en: string }> = {
  docs: { ar: 'المستندات', en: 'Documents' },
  apps: { ar: 'البرامج', en: 'Executables' },
  audio: { ar: 'الصوتيات', en: 'Audio' },
  images: { ar: 'الصور', en: 'Images' }
};

export function classifyUnifiedFolderCategory(fileName: string): UnifiedTypeCategory | null {
  const ext = path.extname(String(fileName ?? '')).toLowerCase();
  if (!ext) return null;
  for (const [cat, set] of Object.entries(UNIFIED_CATEGORY_EXTS) as [UnifiedTypeCategory, Set<string>][]) {
    if (set.has(ext)) return cat;
  }
  return null;
}

export interface AutoRouteContext {
  url: string;
  fileName: string;
  requestedDir?: string;
  rootDir: string;
  language?: 'ar' | 'en';
  isAutoOrganizeEnabled: () => boolean;
  getTrackedDownloads: () => { id: string; fileName: string; destination: string; filePath?: string; status: string }[];
  getFolderAliases?: (folderPath: string) => string[];
  onRegisterDefaultAliases?: (folderPath: string, aliases: string[]) => void;
  onFolderAutoCreated?: (folderPath: string) => void;
  onRetroactiveMove?: (oldPath: string, newPath: string) => void;
}

export interface AutoRouteDecision {
  targetDir: string;
  autoGroupedFolder?: string;
  matchedAlias?: string;
  retroMovedPaths: { from: string; to: string }[];
}

/**
 * Decides the target directory for a new download when `autoOrganizeEnabled` is active,
 * matching direct folder titles, explicit registered aliases, and auto-generated candidate acronyms
 * (such as "GT" -> "Golden Time" or "جي تي" -> "جولد تايم").
 */
export async function resolveAutoOrganizedDownloadDir(ctx: AutoRouteContext): Promise<AutoRouteDecision> {
  const root = path.resolve(ctx.rootDir);
  const reqDir = ctx.requestedDir ? resolveInside(root, ctx.requestedDir) : root;

  // Respect disabling auto-organize OR explicit manual subfolder selection
  if (!ctx.isAutoOrganizeEnabled() || !sameDir(reqDir, root)) {
    return { targetDir: reqDir, retroMovedPaths: [] };
  }

  const info = normalizeTitle(ctx.fileName);
  if (!info.normalizedTitle || info.normalizedTitle.length < 2) {
    return { targetDir: root, retroMovedPaths: [] };
  }

  let dirents: fs.Dirent[] = [];
  try {
    dirents = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    dirents = [];
  }

  const existingFolders = dirents
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, fullPath: path.join(root, d.name) }));

  // 0. Unified type folders for non-series types (Documents, Executables, Audio, Images):
  // never create per-file folders for these; route and collect them into one unified folder per type.
  const unifiedCat = classifyUnifiedFolderCategory(ctx.fileName);
  if (unifiedCat) {
    const aliases = UNIFIED_CATEGORY_ALIASES[unifiedCat];
    const existingCatDir = existingFolders.find((f) => aliases.has(f.name.toLowerCase()));
    const targetName = existingCatDir?.name ?? UNIFIED_CATEGORY_NAMES[unifiedCat][ctx.language ?? 'ar'];
    const groupDir = existingCatDir?.fullPath ?? path.join(root, targetName);
    const existedBefore = existingCatDir !== undefined || fs.existsSync(groupDir);
    await fs.promises.mkdir(groupDir, { recursive: true });
    if (!existedBefore) {
      ctx.onFolderAutoCreated?.(groupDir);
    }

    const retroMovedPaths: { from: string; to: string }[] = [];
    for (const d of dirents) {
      if (!d.isFile() || d.name.endsWith('.aria2')) continue;
      if (classifyUnifiedFolderCategory(d.name) !== unifiedCat) continue;
      const src = path.join(root, d.name);
      try {
        const [dest] = await moveItems(root, [src], groupDir);
        if (dest && dest !== src) {
          retroMovedPaths.push({ from: src, to: dest });
          ctx.onRetroactiveMove?.(src, dest);
        }
      } catch {
        // ignore if locked
      }
    }

    return {
      targetDir: groupDir,
      autoGroupedFolder: path.basename(groupDir),
      retroMovedPaths
    };
  }

  // 1. First: match normalizedTitle directly (or normalizedKey) or against explicit registered `aliases` of any existing folder
  let matchedFolder: { name: string; fullPath: string; viaAlias?: string } | null = null;
  for (const f of existingFolders) {
    if (normalizeSequenceKey(f.name) === info.normalizedKey || normalizeTitle(f.name).normalizedKey === info.normalizedKey) {
      matchedFolder = { ...f };
      break;
    }
    const explicit = ctx.getFolderAliases?.(f.fullPath) ?? [];
    for (const a of explicit) {
      if (
        normalizeAliasForCompare(a) === info.normalizedKey ||
        (normalizeAliasCompact(info.normalizedTitle).length >= 2 && normalizeAliasCompact(a) === normalizeAliasCompact(info.normalizedTitle))
      ) {
        matchedFolder = { ...f, viaAlias: a };
        break;
      }
    }
    if (matchedFolder) break;
  }

  // 2. Second: if not matched yet and the incoming file has a sequence marker, check generated/synonym aliases (in both directions)
  if (!matchedFolder && info.hasSequenceMarker) {
    for (const f of existingFolders) {
      const mForward = matchTitleOrAlias(info.normalizedTitle, f.name, ctx.getFolderAliases?.(f.fullPath) ?? []);
      if (mForward.matched) {
        matchedFolder = { ...f, viaAlias: mForward.viaAlias };
        break;
      }
      const mReverse = matchTitleOrAlias(f.name, info.normalizedTitle);
      if (mReverse.matched) {
        matchedFolder = { ...f, viaAlias: f.name };
        break;
      }
    }
  }

  // 3. Scan loose files in root that share the same normalizedKey OR match via generated/registered aliases
  const looseFiles = dirents
    .filter((d) => d.isFile() && !d.name.endsWith('.aria2'))
    .map((d) => ({ name: d.name, fullPath: path.join(root, d.name), info: normalizeTitle(d.name) }));

  let chosenGroupTitle = matchedFolder?.name ?? info.normalizedTitle;
  let viaAlias = matchedFolder?.viaAlias;

  const matchingLooseFiles = looseFiles.filter((f) => {
    if (f.info.normalizedKey === info.normalizedKey) return true;
    // Check if incoming title is an alias of a loose full-title file (e.g. incoming "جي تي - 02", loose "جولد تايم - الحلقة 1")
    if (info.hasSequenceMarker || f.info.hasSequenceMarker) {
      const m1 = matchTitleOrAlias(info.normalizedTitle, f.info.normalizedTitle);
      if (m1.matched) {
        if (f.info.normalizedTitle.length > chosenGroupTitle.length) chosenGroupTitle = f.info.normalizedTitle;
        viaAlias = viaAlias ?? m1.viaAlias;
        return true;
      }
      // Or loose file is an abbreviation of incoming full-title file (e.g. loose "جي تي - 01", incoming "جولد تايم - الحلقة 2")
      const m2 = matchTitleOrAlias(f.info.normalizedTitle, info.normalizedTitle);
      if (m2.matched) {
        if (info.normalizedTitle.length > chosenGroupTitle.length) chosenGroupTitle = info.normalizedTitle;
        viaAlias = viaAlias ?? m2.viaAlias;
        return true;
      }
    }
    return false;
  });

  // 4. Check active/queued/completed downloads in root sharing the same normalizedKey or alias
  const matchingDownloads = ctx
    .getTrackedDownloads()
    .filter((d) => sameDir(d.destination, root) && d.fileName.toLowerCase() !== ctx.fileName.toLowerCase())
    .filter((d) => {
      const dInfo = normalizeTitle(d.fileName);
      if (dInfo.normalizedKey === info.normalizedKey) return true;
      if (info.hasSequenceMarker || dInfo.hasSequenceMarker) {
        const m1 = matchTitleOrAlias(info.normalizedTitle, dInfo.normalizedTitle);
        if (m1.matched) {
          if (dInfo.normalizedTitle.length > chosenGroupTitle.length) chosenGroupTitle = dInfo.normalizedTitle;
          viaAlias = viaAlias ?? m1.viaAlias;
          return true;
        }
        const m2 = matchTitleOrAlias(dInfo.normalizedTitle, info.normalizedTitle);
        if (m2.matched) {
          if (info.normalizedTitle.length > chosenGroupTitle.length) chosenGroupTitle = info.normalizedTitle;
          viaAlias = viaAlias ?? m2.viaAlias;
          return true;
        }
      }
      return false;
    });

  const hasSiblingMatch =
    matchingLooseFiles.some((f) => f.name.toLowerCase() !== ctx.fileName.toLowerCase()) ||
    matchingDownloads.length > 0;

  const shouldGroup =
    matchedFolder !== null ||
    info.isExplicitSequence ||
    hasSiblingMatch;

  if (!shouldGroup) {
    return { targetDir: root, retroMovedPaths: [] };
  }

  const groupDir = matchedFolder?.fullPath ?? path.join(root, chosenGroupTitle);
  const existedBefore = matchedFolder !== null || fs.existsSync(groupDir);
  await fs.promises.mkdir(groupDir, { recursive: true });
  if (!existedBefore) {
    ctx.onFolderAutoCreated?.(groupDir);
  }

  // Register default generated candidate aliases on the folder for multi-word titles
  const defaultAliases = generateTitleAliases(path.basename(groupDir));
  if (defaultAliases.length > 0) {
    ctx.onRegisterDefaultAliases?.(groupDir, defaultAliases);
  }

  // Retroactively move any matching loose files from root into groupDir
  const retroMovedPaths: { from: string; to: string }[] = [];
  for (const f of matchingLooseFiles) {
    try {
      const [dest] = await moveItems(root, [f.fullPath], groupDir);
      if (dest && dest !== f.fullPath) {
        retroMovedPaths.push({ from: f.fullPath, to: dest });
        ctx.onRetroactiveMove?.(f.fullPath, dest);
      }
    } catch {
      // ignore if file is currently locked by an active stream
    }
  }

  return {
    targetDir: groupDir,
    autoGroupedFolder: path.basename(groupDir),
    matchedAlias: viaAlias,
    retroMovedPaths
  };
}

export interface OrganizeDirectoryOptions {
  language?: 'ar' | 'en';
  getFolderAliases?: (folderPath: string) => string[];
  onRegisterDefaultAliases?: (folderPath: string, aliases: string[]) => void;
  onFolderAutoCreated?: (folderPath: string) => void;
  onMoved?: (oldPath: string, newPath: string) => void;
}

/**
 * Scans `targetDir` and groups sequential files (including files matching folder/group aliases)
 * into `<targetDir>/<normalizedTitle>` folders.
 */
export async function organizeDirectorySequences(
  rootDir: string,
  targetDir: string,
  onMovedOrOpts?: ((oldPath: string, newPath: string) => void) | OrganizeDirectoryOptions
): Promise<OrganizeResult> {
  const opts: OrganizeDirectoryOptions =
    typeof onMovedOrOpts === 'function' ? { onMoved: onMovedOrOpts } : (onMovedOrOpts ?? {});

  const root = path.resolve(rootDir);
  const dir = resolveInside(root, targetDir);
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });

  const existingFolders: { name: string; fullPath: string; key: string }[] = [];
  for (const d of dirents) {
    if (d.isDirectory()) {
      existingFolders.push({ name: d.name, fullPath: path.join(dir, d.name), key: normalizeSequenceKey(d.name) });
    }
  }

  const dirBaseLower = path.basename(dir).toLowerCase();
  const unifiedBuckets = new Map<UnifiedTypeCategory, { name: string; fullPath: string; existed: boolean; files: { name: string; fullPath: string }[] }>();
  const sequenceCandidates: { name: string; fullPath: string; info: NormalizedSequenceInfo }[] = [];

  for (const d of dirents) {
    if (!d.isFile() || d.name.endsWith('.aria2')) continue;
    const fullPath = path.join(dir, d.name);
    const cat = classifyUnifiedFolderCategory(d.name);
    if (cat && !UNIFIED_CATEGORY_ALIASES[cat].has(dirBaseLower)) {
      let ub = unifiedBuckets.get(cat);
      if (!ub) {
        const aliases = UNIFIED_CATEGORY_ALIASES[cat];
        const existingCat = existingFolders.find((f) => aliases.has(f.name.toLowerCase()));
        const folderName = existingCat?.name ?? UNIFIED_CATEGORY_NAMES[cat][opts.language ?? 'ar'];
        ub = {
          name: folderName,
          fullPath: existingCat?.fullPath ?? path.join(dir, folderName),
          existed: existingCat !== undefined,
          files: []
        };
        unifiedBuckets.set(cat, ub);
      }
      ub.files.push({ name: d.name, fullPath });
      continue;
    }
    const info = normalizeTitle(d.name);
    if (info.normalizedTitle && info.normalizedTitle.length >= 2) {
      sequenceCandidates.push({ name: d.name, fullPath, info });
    }
  }

  const looseFiles = sequenceCandidates;

  // Build canonical buckets (existing folders first, then longest/full titles)
  const buckets: {
    title: string;
    key: string;
    existingPath?: string;
    items: { name: string; fullPath: string; info: NormalizedSequenceInfo }[];
  }[] = existingFolders.map((f) => ({
    title: f.name,
    key: f.key,
    existingPath: f.fullPath,
    items: []
  }));

  // Sort loose files so multi-word full titles are bucketed before short abbreviations
  const sortedFiles = [...looseFiles].sort((a, b) => b.info.normalizedTitle.length - a.info.normalizedTitle.length);

  for (const f of sortedFiles) {
    // 1. Exact key match with an existing bucket
    let bucket = buckets.find((b) => b.key === f.info.normalizedKey);
    // 2. Alias / acronym / synonym match with an existing bucket (both forward and reverse)
    if (!bucket && f.info.hasSequenceMarker) {
      bucket = buckets.find((b) => {
        const aliases = b.existingPath ? (opts.getFolderAliases?.(b.existingPath) ?? []) : [];
        return matchTitleOrAlias(f.info.normalizedTitle, b.title, aliases).matched ||
          matchTitleOrAlias(b.title, f.info.normalizedTitle).matched;
      });
    }
    if (!bucket) {
      bucket = { title: f.info.normalizedTitle, key: f.info.normalizedKey, items: [] };
      buckets.push(bucket);
    }
    bucket.items.push(f);
  }

  let movedCount = 0;
  const groups: OrganizeGroupResult[] = [];

  for (const ub of unifiedBuckets.values()) {
    if (ub.files.length === 0) continue;
    const existedBefore = ub.existed || fs.existsSync(ub.fullPath);
    await fs.promises.mkdir(ub.fullPath, { recursive: true });
    if (!existedBefore) {
      opts.onFolderAutoCreated?.(ub.fullPath);
    }
    const movedNames: string[] = [];
    for (const f of ub.files) {
      const [dest] = await moveItems(root, [f.fullPath], ub.fullPath);
      if (dest && dest !== f.fullPath) {
        movedCount++;
        movedNames.push(path.basename(dest));
        opts.onMoved?.(f.fullPath, dest);
      }
    }
    if (movedNames.length > 0) {
      groups.push({
        folderName: path.basename(ub.fullPath),
        folderPath: ub.fullPath,
        files: movedNames
      });
    }
  }

  for (const bucket of buckets) {
    if (bucket.items.length === 0) continue;
    const hasExplicit = bucket.items.some((x) => x.info.isExplicitSequence);
    const shouldOrganize =
      bucket.existingPath !== undefined ||
      hasExplicit ||
      bucket.items.length >= 2;

    if (!shouldOrganize) continue;

    const folderPath = bucket.existingPath ?? path.join(dir, bucket.title);
    const existedBefore = bucket.existingPath !== undefined || fs.existsSync(folderPath);
    await fs.promises.mkdir(folderPath, { recursive: true });
    if (!existedBefore) {
      opts.onFolderAutoCreated?.(folderPath);
    }

    const defaultAliases = generateTitleAliases(path.basename(folderPath));
    if (defaultAliases.length > 0) {
      opts.onRegisterDefaultAliases?.(folderPath, defaultAliases);
    }

    const movedNames: string[] = [];
    for (const it of bucket.items) {
      const [dest] = await moveItems(root, [it.fullPath], folderPath);
      if (dest && dest !== it.fullPath) {
        movedCount++;
        movedNames.push(path.basename(dest));
        opts.onMoved?.(it.fullPath, dest);
      }
    }

    if (movedNames.length > 0) {
      groups.push({
        folderName: path.basename(folderPath),
        folderPath,
        files: movedNames
      });
    }
  }

  return { movedCount, groups };
}

/**
 * Removes empty directories that were automatically created by nbrsflow (`isAutoCreated === true`),
 * walking up to (but never including) `rootDir`. Manually created folders are untouched.
 */
export async function cleanupEmptyAutoCreatedDirs(
  startDir: string,
  rootDir: string,
  isAutoCreated: (absPath: string) => boolean,
  removeMeta: (absPath: string) => void
): Promise<string[]> {
  const root = path.resolve(rootDir);
  let current = path.resolve(startDir);
  const removed: string[] = [];

  while (!sameDir(current, root) && current.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
    if (!isAutoCreated(current)) break;
    let entries: string[];
    try {
      entries = await fs.promises.readdir(current);
    } catch {
      break;
    }
    if (entries.length > 0) break;
    try {
      await fs.promises.rmdir(current);
      removeMeta(current);
      removed.push(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }

  return removed;
}

export interface SeriesCompletionInfo {
  isComplete: boolean;
  totalEpisodes?: number;
  presentCount: number;
}

/**
 * Inspects a folder to determine whether it contains a final-episode `end` file
 * AND all sequential episodes 1..N are present.
 */
export async function inspectSeriesCompletion(folderPath: string): Promise<SeriesCompletionInfo> {
  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    return { isComplete: false, presentCount: 0 };
  }

  const episodes = new Set<number>();
  let finalEpisode: number | undefined;

  for (const d of dirents) {
    if (!d.isFile()) continue;
    const lower = d.name.toLowerCase();
    if (lower.endsWith('.aria2') || lower.endsWith('.tmp') || lower.endsWith('.part') || lower.endsWith('.crdownload')) {
      continue;
    }
    const info = normalizeTitle(d.name);
    if (info.hasSequenceMarker && typeof info.sequenceIndex === 'number' && info.sequenceIndex >= 1) {
      episodes.add(info.sequenceIndex);
      if (info.isEndEpisode) {
        finalEpisode = Math.max(finalEpisode ?? 0, info.sequenceIndex);
      }
    }
  }

  if (!finalEpisode || finalEpisode < 1) {
    return { isComplete: false, presentCount: episodes.size };
  }

  for (let ep = 1; ep <= finalEpisode; ep++) {
    if (!episodes.has(ep)) {
      return { isComplete: false, totalEpisodes: finalEpisode, presentCount: episodes.size };
    }
  }

  return { isComplete: true, totalEpisodes: finalEpisode, presentCount: episodes.size };
}

const COMPLETED_FOLDER_ALIASES = new Set(['completed', 'مكتمل']);

/**
 * Moves completed series folders (detected via `inspectSeriesCompletion`) in `rootDir`
 * into `<rootDir>/<completedFolderName>` while keeping incomplete folders in `rootDir`.
 */
export async function moveCompletedSeriesFolders(
  rootDir: string,
  completedFolderName = 'Completed',
  onMoved?: (from: string, to: string) => void
): Promise<string[]> {
  const root = path.resolve(rootDir);
  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const existingCompleted = dirents.find(
    (d) => d.isDirectory() && COMPLETED_FOLDER_ALIASES.has(d.name.toLowerCase())
  );
  const targetDirName = existingCompleted ? existingCompleted.name : validateName(completedFolderName);
  const targetDir = resolveInside(root, path.join(root, targetDirName));
  const moved: string[] = [];

  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    if (COMPLETED_FOLDER_ALIASES.has(d.name.toLowerCase())) continue;
    const subPath = path.join(root, d.name);
    const completion = await inspectSeriesCompletion(subPath);
    if (!completion.isComplete) continue;

    await fs.promises.mkdir(targetDir, { recursive: true });
    const [dest] = await moveItems(root, [subPath], targetDir);
    if (dest) {
      moved.push(dest);
      onMoved?.(subPath, dest);
    }
  }

  return moved;
}

/**
 * Groups tagged folders directly inside `rootDir` into `<rootDir>/<tag>` folders.
 */
export async function groupFoldersByTagInRoot(
  rootDir: string,
  getTag: (absPath: string) => string | undefined,
  onMoved?: (from: string, to: string) => void
): Promise<string[]> {
  const root = path.resolve(rootDir);
  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const moved: string[] = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const subPath = path.join(root, d.name);
    const tag = getTag(subPath)?.trim();
    if (!tag) continue;
    let safeTagDirName: string;
    try {
      safeTagDirName = validateName(tag);
    } catch {
      continue;
    }
    if (d.name.toLowerCase() === safeTagDirName.toLowerCase()) continue;
    const targetDir = resolveInside(root, path.join(root, safeTagDirName));
    await fs.promises.mkdir(targetDir, { recursive: true });
    const [dest] = await moveItems(root, [subPath], targetDir);
    if (dest) {
      moved.push(dest);
      onMoved?.(subPath, dest);
    }
  }
  return moved;
}
