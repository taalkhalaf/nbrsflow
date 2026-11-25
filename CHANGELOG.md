# Changelog

All notable changes to **nbrsflow** are documented in this file.

## [0.2.10] - 2026-11-25
### Added
- **TopBar View Mode Selector:** Instant switching between **Default**, **Downloads** (Download Manager only), and **Files** (File Manager only) modes with persistent settings and full AR/EN RTL/LTR support.
- **Series Completion Detection (`end` Suffix):** Detects final-episode markers (`E12end`, `12 end`, `الحلقة 12 end`), verifies full `1..N` episode sequences, displays a `Complete` / `مكتمل` badge on completed folders, and adds an opt-in Settings toggle (`autoMoveCompletedSeries`, off by default) to move completed series into a dedicated folder.
- **Windows-Style Folder Icons & Folder Tags:** Upgraded `FolderIcon` to a layered Windows-style design with custom color support, added a **Tags** section in the folder context menu (presets: `أنمي`, `كرتون`, `مسلسل`, `فيلم`, `فيلم أنمي` + custom tags + clear), rendered the active tag directly on the folder icon, and added an opt-in Settings toggle (`groupFoldersByTag`, off by default) to group folders by tag.
- **GitHub Repository Readiness:** Added `CHANGELOG.md`, updated `README.md` (with third-party `aria2` GPLv2 notice), and cleaned temporary artifacts.

## [0.2.9] - 2026-11-23
### Added & Fixed
- **Black-Screen Prevention & Recovery:** Automatic stale Chromium GPU/Shader/Code cache cleanup on version upgrades, `render-process-gone` / `child-process-gone` (GPU) / `did-fail-load` auto-recovery with an inline fallback page, `ready-to-show` visibility safety timer, React `ErrorBoundary`, and Safe Graphics Mode (`disableHardwareAcceleration`) in Settings.
- **Browser Extension Stability:** Added `chrome.alarms` keepalive (`syncBridgeConnection`), auto-port sync, and popup auto-refresh polling.
- **Smart Folder Indicators & Navigation:** Added `!` duplicate indicator, new/unopened file dot indicator, First-Letter Cycling in Explorer, bidirectional title synonym unification (`تايم جولد` ↔ `تي جي`), and `allowOpenDownloadsOutsideRoot` setting.

## [0.2.0 - 0.2.8] - 2026-11
- Embedded `aria2c.exe` JSON-RPC engine with Node HTTP/HTTPS Range fallback, Disk Space Guard, Clipboard Monitor, Manifest V3 Browser Extension, Dual-Pane Explorer, Virtualized lists/grid, Command Palette (`Ctrl+K`), Sequence Organizer, Folder Coloring & Aliases, Checksum Verification, and NSIS Windows Installer.
