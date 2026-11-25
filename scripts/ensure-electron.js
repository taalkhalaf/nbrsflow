// Makes sure the Electron binary is present (npm sometimes skips its download).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const exe = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(exe)) {
  console.log('[nbrsflow] Electron binary missing, downloading…');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'node_modules', 'electron', 'install.js')], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('[nbrsflow] Electron download failed'); process.exit(1); }
}
