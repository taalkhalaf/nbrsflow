# Bundled aria2 Binary (`resources/bin/win32/aria2c.exe`)

- **Binary**: `aria2c.exe` (Windows x64)
- **Version**: `1.37.0`
- **Official Source**: https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip
- **License**: GPLv2 (standalone binary invoked over local JSON-RPC via `electron/aria2Manager.ts`)
- **Git status**: Ignored by `.gitignore` (`*.exe`). If `aria2c.exe` is not present on disk, `Aria2Manager` automatically falls back to the built-in `IAria2Engine` Node HTTP/HTTPS range engine (`mode: 'fallback'`) and switches to `aria2c.exe` (`mode: 'aria2'`) immediately once the binary is present.
