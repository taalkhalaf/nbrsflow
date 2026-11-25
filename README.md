# nbrsflow

> **Modern Windows Download Manager & Intelligent File Explorer**  
> **تطبيق سطح مكتب لويندوز يجمع بين مدير التحميلات عالي السرعة (`aria2`) ومستعرض الملفات الذكي.**

[![Version](https://img.shields.io/badge/Version-0.2.11-D6D9DE.svg?labelColor=171C23&color=3B434D)](https://github.com/taalkhalaf/nbrsflow/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-0078D6.svg)]()
[![Author](https://img.shields.io/badge/Author-nbrs-green.svg)]()

---

## Download | التحميل المباشر (Windows x64)

- **التحميل المباشر لآخر إصدار (`v0.2.11`):** [**nbrsflow-setup-0.2.11.exe**](https://github.com/taalkhalaf/nbrsflow/releases/latest/download/nbrsflow-setup-0.2.11.exe)
- **صفحة الإصدارات الرسمية:** [GitHub Releases (Latest)](https://github.com/taalkhalaf/nbrsflow/releases/latest)
- **Direct Download (`v0.2.11` Installer):** [**nbrsflow-setup-0.2.11.exe**](https://github.com/taalkhalaf/nbrsflow/releases/latest/download/nbrsflow-setup-0.2.11.exe) | [All Releases](https://github.com/taalkhalaf/nbrsflow/releases/latest)

---

## Overview | نظرة عامة

### English
**nbrsflow** is an open-source Windows desktop application built with Electron, React, TypeScript, Tailwind CSS, and an embedded `aria2` engine. It unifies active network downloads and local file management into a single calm, charcoal-and-silver workspace with full Arabic (RTL) and English (LTR) support.

### العربية
**nbrsflow** هو تطبيق سطح مكتب مفتوح المصدر لنظام ويندوز مبني باستخدام Electron وReact وTypeScript وTailwind CSS ومحرك التحميل `aria2`. يدمج التطبيق إدارة التحميلات النشطة مع مستكشف ملفات ذكي في واجهة واحدة هادئة بالهوية الفحمية والفضية مع دعم كامل للغتين العربية (`RTL`) والإنجليزية (`LTR`).

---

## Implemented Features | الميزات المنجزة

- **Embedded `aria2` Download Engine (`IAria2Engine`)**  
  High-speed segmented downloads via local authenticated JSON-RPC (`aria2c.exe v1.37.0`), automatic crash recovery, Pause/Resume/Cancel controls, persistent download history, and an automatic Node HTTP/HTTPS range fallback engine if the binary is absent.
- **Interactive Dual-Pane File Explorer**  
  Real-time directory watching (`fs.watch`), Grid/List views, Dual-Pane side-by-side mode, Drag & Drop to tree folders and between panes, Recycle Bin deletion (`shell.trashItem`), smart `.zip` extraction, real folder size calculation, and independent per-pane navigation bars (`Back` / `Forward` / `Up`, `Alt+Left`/`Alt+Right`, interactive Breadcrumb, and Copy Path).
- **Automatic & Retroactive Sequence Grouping**  
  Normalizes English & Arabic release names (stripping `1080p`, `WEB-DL`, `x265`, brackets, etc.) and detects sequence markers (`S01E01`, `Ep.01`, `Part 1`, `الحلقة 1`, `الحلقة الأولى`, `الجزء 1`, `.part1.rar`, `- 01`). Automatically routes sequential downloads into normalized folders and retroactively moves prior matching files along with their metadata.
- **Arabic & English Acronym / Alias Matching**  
  Matches abbreviations and custom aliases to folders (e.g. `GT` → `Golden Time`, `جي تي` / `ج ت` / `جت` → `جولد تايم`) with Arabic hamza/taa-marbuta normalization and a dedicated "Manage aliases / shortcuts" dialog.
- **Folder Coloring & Quick Hover Summaries**  
  7-color visual folder tagging + optional content-based auto-coloring (`autoColor`), multi-line AR/EN summaries synced across renames/moves, and a non-intrusive 350ms hover summary card.
- **New / Last Opened Resume Markers**  
  Tracks unopened recent files (`New` / `جديد`) and the most recently opened file inside each folder (`Last opened` / `آخر ما فُتح`) for effortless series continuation.
- **Streaming Checksum Verification**  
  Computes `SHA-256` and `MD5` via non-blocking streams with quick copy and automatic reference hash comparison (`Matched ✅` / `Mismatch ❌`).
- **TopBar View Mode Selector**  
  Instant switching between **Default** (Downloads + Explorer), **Downloads** (Download Manager only), and **Files** (File Manager only) modes with persistent state.
- **Series Completion Detection (`end` Suffix) & Auto-Move**  
  Detects final-episode `end` markers (`E12end`, `12 end`, `الحلقة 12 end`), verifies full `1..N` episode presence, displays a `Complete` / `مكتمل` badge on completed folders, and optionally moves completed series into a dedicated folder.
- **Windows-Style Folder Icons, Tags & Tag Grouping**  
  Modern Windows-style layered folder icons with custom colors, preset/custom category tags (`أنمي`, `كرتون`, `مسلسل`, `فيلم`, `فيلم أنمي`) rendered directly on the folder icon, and optional automatic grouping by tag.
- **Browser Extension (`Manifest V3`) & Black-Screen Recovery**  
  Chrome/Edge/Brave extension with `chrome.alarms` keepalive, domain exclusions, header forwarding, plus automatic stale GPU cache cleanup and Safe Graphics Mode recovery.
- **Disk Space Guard & Clipboard Monitor**  
  Configurable free-space guard (`2 GB` default) with live warnings before/during downloads, plus toggleable clipboard monitoring for direct download links.

---

## Getting Started | التشغيل والتطوير

### Prerequisites | المتطلبات
- **OS:** Windows 10 / Windows 11 (x64)
- **Runtime:** Node.js (v20+ recommended) & npm

### Run in Development Mode | التشغيل للتطوير
You can launch the app in one click on Windows using:
- Double-click **`nbrsflow-dev.bat`**, or run:
```bash
npm install
npm run dev
```
*(The `predev` script automatically verifies/downloads the Electron binary if missing.)*

### Run Automated Tests | تشغيل الاختبارات الآلية
```bash
npm run typecheck    # TypeScript check (renderer + main/preload)
npm run test:meta    # MetadataStore, aliases, tags, windowRecovery, auto-color
npm run test:fs      # Safe FS ops, smart zip extract, streaming SHA-256/MD5, indicators
npm run test:aria2   # aria2c.exe JSON-RPC, fallback, Disk Space Guard, clipboard
npm run test:seq     # Sequence normalization, end-episode completion, EN/AR acronyms
npm run test:ext     # Manifest V3 browser extension & local bridge server
npm run test:e2e     # End-to-end Electron UI verification via CDP
```

### Build & Package for Windows | البناء والتغليف النهائي
```bash
npm run build        # Build renderer (dist/) and Electron main/preload (dist-electron/)
npm run dist         # Package Windows x64 installer & unpacked app into release/
```
Generated artifacts in `release/` (git-ignored):
- `release/nbrsflow-setup-0.2.11.exe` (NSIS Windows installer)
- `release/win-unpacked/nbrsflow.exe` (Portable unpacked executable with bundled `resources/bin/win32/aria2c.exe`)

### Third-Party Licenses | تراخيص الطرف الثالث
- **nbrsflow** is licensed under the [MIT License](LICENSE).
- **aria2** (`resources/bin/win32/aria2c.exe` v1.37.0) is distributed as a standalone external binary licensed under **GPLv2** and invoked over local JSON-RPC. See [resources/bin/win32/README.md](resources/bin/win32/README.md) for source and details.

---

## Documentation | التوثيق

- [PROJECT_BLUEPRINT.md](PROJECT_BLUEPRINT.md) — Architecture, stack, and post-v1.0 three-mode vision.
- [TASKS.md](TASKS.md) — 12-phase implementation roadmap and completion status.
- [AGENT_HANDOFF.md](AGENT_HANDOFF.md) — Continuous technical handoff and verification log.

---

## License | الترخيص

Distributed under the [MIT License](LICENSE) (2026) — Developed by **nbrs**.
