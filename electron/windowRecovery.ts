import * as fs from 'node:fs';
import * as path from 'node:path';

const VERSION_FILE = 'last-app-version.txt';
const GPU_CRASH_FILE = 'gpu-crash.flag';
const GPU_CRASH_WINDOW_MS = 5 * 60 * 1000;
const STALE_CACHE_DIRS = [
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
  'Code Cache'
];

export interface GpuCrashRecord {
  count: number;
  lastAt: number;
  reason: string;
}

/**
 * Clears stale Chromium GPU/shader/code caches when the app version changes
 * (e.g., after an NSIS install/update over a previous version) to prevent black-screen rendering.
 */
export function clearStaleCachesOnVersionChange(userDataDir: string, currentVersion: string): boolean {
  if (!userDataDir || !currentVersion) return false;
  const versionFile = path.join(userDataDir, VERSION_FILE);
  let previous = '';
  try {
    if (fs.existsSync(versionFile)) {
      previous = fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch {
    previous = '';
  }

  let cleared = false;
  if (previous && previous !== currentVersion) {
    for (const dirName of STALE_CACHE_DIRS) {
      const target = path.join(userDataDir, dirName);
      try {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
          cleared = true;
        }
      } catch {
        // Ignore locked cache files; Chromium will overwrite or skip them
      }
    }
  }

  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    if (previous !== currentVersion) {
      fs.writeFileSync(versionFile, currentVersion, 'utf8');
    }
  } catch {
    // ignore write failure
  }

  return cleared;
}

/**
 * Checks whether hardware acceleration should be disabled before app.whenReady().
 */
export function shouldDisableHardwareAcceleration(userDataDir: string, argv: string[] = process.argv): boolean {
  if (
    argv.includes('--disable-gpu') ||
    argv.includes('--safe-gpu') ||
    process.env.NBRS_DISABLE_GPU === '1'
  ) {
    return true;
  }
  if (!userDataDir) return false;

  try {
    const settingsFile = path.join(userDataDir, 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as { disableHardwareAcceleration?: boolean };
      if (raw?.disableHardwareAcceleration === true) return true;
    }
  } catch {
    // ignore malformed settings
  }

  try {
    const flagFile = path.join(userDataDir, GPU_CRASH_FILE);
    if (fs.existsSync(flagFile)) {
      const rec = JSON.parse(fs.readFileSync(flagFile, 'utf8')) as Partial<GpuCrashRecord>;
      if (
        typeof rec?.count === 'number' &&
        (rec.count >= 2 || rec.reason === 'launch-failed')
      ) {
        return true;
      }
    }
  } catch {
    // ignore malformed flag
  }

  return false;
}

/**
 * Records a GPU child-process crash so repeated GPU failures automatically fall back to software rendering.
 */
export function markGpuCrash(
  userDataDir: string,
  reason: string,
  now = Date.now()
): { count: number; disabledForNextLaunch: boolean } {
  if (!userDataDir) return { count: 1, disabledForNextLaunch: false };
  const flagFile = path.join(userDataDir, GPU_CRASH_FILE);
  let count = 1;
  try {
    if (fs.existsSync(flagFile)) {
      const prev = JSON.parse(fs.readFileSync(flagFile, 'utf8')) as Partial<GpuCrashRecord>;
      if (typeof prev?.count === 'number' && typeof prev?.lastAt === 'number' && (now - prev.lastAt) <= GPU_CRASH_WINDOW_MS) {
        count = prev.count + 1;
      }
    }
  } catch {
    count = 1;
  }

  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    const payload: GpuCrashRecord = { count, lastAt: now, reason: String(reason || 'unknown') };
    fs.writeFileSync(flagFile, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // ignore
  }

  return {
    count,
    disabledForNextLaunch: count >= 2 || reason === 'launch-failed'
  };
}

/**
 * Clears the automatic GPU crash flag (e.g., when the user re-enables hardware acceleration).
 */
export function clearGpuCrashFlag(userDataDir: string): void {
  if (!userDataDir) return;
  const flagFile = path.join(userDataDir, GPU_CRASH_FILE);
  try {
    if (fs.existsSync(flagFile)) fs.unlinkSync(flagFile);
  } catch {
    // ignore
  }
}

/**
 * Builds a self-contained fallback HTML page so the user never sees a blank black window
 * if the renderer fails to load or crashes repeatedly.
 */
export function buildRecoveryDataUrl(lang: 'ar' | 'en', reason: string): string {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const title = isAr ? 'تعذّر عرض واجهة nbrsflow' : 'nbrsflow Display Recovery';
  const desc = isAr
    ? 'حدث توقف مؤقت في عارض الواجهة أو تسريع الرسوميات. يمكنك إعادة تحميل الواجهة الآن بأمان.'
    : 'The interface renderer or graphics process stopped unexpectedly. You can safely reload the interface now.';
  const btn = isAr ? 'إعادة تحميل الواجهة' : 'Reload Interface';
  const safeReason = String(reason || '').replace(/[<>&"']/g, '');

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center; background:#0B0E13; color:#F2F3F5; font-family:system-ui,-apple-system,sans-serif; }
  .card { max-width:460px; padding:24px; border-radius:14px; background:#171C23; border:1px solid #3B434D; text-align:center; }
  h1 { margin:0 0 10px; font-size:18px; }
  p { margin:0 0 16px; font-size:13px; color:#AEB5BE; line-height:1.6; }
  .reason { margin:0 0 18px; padding:8px 10px; border-radius:8px; background:#0B0E13; color:#D6D9DE; font-size:11px; direction:ltr; word-break:break-word; }
  button { padding:9px 18px; border:0; border-radius:8px; background:#D6D9DE; color:#0B0E13; font-weight:600; font-size:13px; cursor:pointer; }
  button:hover { opacity:0.9; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${desc}</p>
    ${safeReason ? `<div class="reason">${safeReason}</div>` : ''}
    <button onclick="location.reload()">${btn}</button>
  </div>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
