# Changelog

All notable changes to **nbrsflow** are documented in this file.

## [0.2.12] - 2026-11-25
### Added & Improved
- **First-Run Setup Wizard (`SetupWizardModal.tsx`):** Guides new users through selecting/initializing the main downloads & files folder, default interface mode (`default`, `downloads`, `files`), language, clipboard monitor, auto-organize, and automatic update checks, and can be reopened anytime from Settings -> System.
- **Free-Form User-Created Folder Tags:** Removed all hardcoded preset tag lists; users now type their own custom tags directly (e.g. `مسلسل`, `فيلم`, `أنمي`, or any text) and reuse previously created tags effortlessly.
- **Unified Type Folders (`sequenceOrganizer.ts`):** Documents (`.pdf`, `.doc`, `.docx`, etc.), Executables (`.exe`, `.msi`, etc.), Audio (`.mp3`, `.flac`, etc.), and Images are now routed and collected into unified type folders (`المستندات`/`Documents`, `البرامج`/`Executables`, `الصوتيات`/`Audio`, `الصور`/`Images`) instead of creating per-file folders or leaving them in root, while keeping archives visible and unhidden.
- **Multi-Format Archive Support (`zip`, `rar`, `7z`, `tar`, `gz`, `bz2`, `xz`, `tgz`):** Preview archive contents in Quick Preview, extract directly to a folder or current directory from the File Explorer context menu / quick bar, and configure post-extraction archive handling (`keep`, `trash`, or `move_to_archive`).
- **Windows-Style File Explorer Enhancements:** Added **Content** view mode alongside Grid & List, lazy-loaded image & folder thumbnails (first image inside folder) preserving colors/tags/badges, Sort & Group controls (`name`, `modified`, `size`, `type`; `none`, `type`, `tag`), and a contextual Quick Selection Action Bar.
- **Optional Drag-to-Merge Folder Creation (`dragMergeToCreateFolder`):** Opt-in setting (off by default) to create a new folder when dragging an item onto another file, with clear amber visual highlight and full metadata/undo preservation.

## [0.2.11] - 2026-11-25
### Added & Improved
- **Textual Folder Badges (`مكتمل` & `محدّث`):** Replaced the small dot indicator with clear textual badges matching the `جديد`/`New` style: **`محدّث` / `Updated`** when a folder has newly added unopened files (clears automatically when opened) and **`مكتمل` / `Complete`** for completed `1..N` series, alongside the `!` duplicate indicator with descriptive reason tooltips.
- **Redesigned Modern Folder Icon:** Rebuilt `FolderIcon.tsx` with layered SVG gradients, glass edge highlights, subtle ambient shadow, custom color support, and crisp embedded tag pills.
- **In-App GitHub Update Checker & Auto-Updater:** Added `electron/appUpdater.ts` checking `taalkhalaf/nbrsflow` GitHub Releases on startup/periodically and on-demand from Settings -> About, with an in-app update banner, TopBar indicator, active-download warning, and one-click **"Update Now"** installer download & launch.

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
