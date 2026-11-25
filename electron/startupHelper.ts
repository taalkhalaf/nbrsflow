import { execFile } from 'node:child_process';
import * as path from 'node:path';

export interface LoginItemOptionsInput {
  isPackaged: boolean;
  execPath: string;
  appPath: string;
  openAtLogin: boolean;
  startHidden?: boolean;
}

export interface LoginItemOptionsResult {
  openAtLogin: boolean;
  path: string;
  args: string[];
}

/**
 * Builds consistent `app.setLoginItemSettings` / `app.getLoginItemSettings` options
 * so dev-mode startup always passes the app path (preventing the default Electron welcome screen)
 * while packaged mode launches the bundled executable directly.
 */
export function buildLoginItemOptions(input: LoginItemOptionsInput): LoginItemOptionsResult {
  const hiddenArgs = input.startHidden ? ['--startup'] : [];
  if (input.isPackaged) {
    return {
      openAtLogin: !!input.openAtLogin,
      path: input.execPath,
      args: hiddenArgs
    };
  }
  return {
    openAtLogin: !!input.openAtLogin,
    path: input.execPath,
    args: [path.resolve(input.appPath), ...hiddenArgs]
  };
}

/**
 * Returns true if a Windows Run registry command points to `node_modules\electron\dist\electron.exe`
 * without an application directory argument (which would open Electron's default welcome screen).
 */
export function isStaleElectronRunCommand(command: string): boolean {
  const raw = String(command ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (!lower.includes('node_modules\\electron\\dist\\electron.exe') && !lower.includes('node_modules/electron/dist/electron.exe')) {
    return false;
  }
  // Extract anything after electron.exe" or electron.exe
  const m = raw.match(/electron\.exe["']?\s*(.*)$/i);
  const rest = (m?.[1] ?? '').trim();
  // If nothing follows, or only flags like --startup follow without an app path, it's stale.
  if (!rest) return true;
  const tokens = rest.match(/(?:"[^"]+"|\S+)/g) ?? [];
  const hasAppArg = tokens.some((tok) => !tok.startsWith('-'));
  return !hasAppArg;
}

function runReg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', args, { windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout ?? '');
    });
  });
}

/**
 * Scans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` and removes stale
 * `nbrsflow` / `Electron` entries pointing to `node_modules\electron\dist\electron.exe` without app args.
 */
export async function sanitizeWindowsRunRegistry(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  let output = '';
  try {
    output = await runReg(['query', key]);
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s{2,}(.+?)\s{2,}REG_(?:SZ|EXPAND_SZ)\s{2,}(.+)$/);
    if (!m) continue;
    const name = m[1].trim();
    const cmd = m[2].trim();
    const nameLower = name.toLowerCase();
    if ((nameLower.includes('nbrsflow') || nameLower.includes('electron')) && isStaleElectronRunCommand(cmd)) {
      try {
        await runReg(['delete', key, '/v', name, '/f']);
        removed.push(name);
      } catch {
        // ignore delete errors
      }
    }
  }
  return removed;
}
