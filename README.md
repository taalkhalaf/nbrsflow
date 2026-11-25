# nbrsflow

> **Windows Desktop Download Manager (`aria2`) & Dual-Pane File Explorer**  
> **تطبيق سطح مكتب لويندوز يجمع بين مدير تحميلات مبني على `aria2` ومستكشف ملفات مزدوج اللوحة.**

[![Version](https://img.shields.io/badge/Version-0.2.12-D6D9DE.svg?labelColor=171C23&color=3B434D)](https://github.com/taalkhalaf/nbrsflow/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-0078D6.svg)]()
[![Author](https://img.shields.io/badge/Author-nbrs-green.svg)]()

---

## Download | التحميل المباشر (Windows x64)

- **التحميل المباشر لآخر إصدار (`v0.2.12`):** [**nbrsflow-setup-0.2.12.exe**](https://github.com/taalkhalaf/nbrsflow/releases/latest/download/nbrsflow-setup-0.2.12.exe)
- **صفحة الإصدارات الرسمية:** [GitHub Releases (Latest)](https://github.com/taalkhalaf/nbrsflow/releases/latest)
- **Direct Download (`v0.2.12` Installer):** [**nbrsflow-setup-0.2.12.exe**](https://github.com/taalkhalaf/nbrsflow/releases/latest/download/nbrsflow-setup-0.2.12.exe) | [All Releases](https://github.com/taalkhalaf/nbrsflow/releases/latest)

---

## Overview | نظرة عامة

### English
**nbrsflow** is a Windows desktop application built with Electron, React, TypeScript, Tailwind CSS, and an embedded `aria2` engine. It combines a segmented download manager with a dual-pane file explorer in a single workspace supporting Arabic (`RTL`) and English (`LTR`), dark/light themes, and configurable workspace layouts (`Default`, `Downloads`, and `Files`).

### العربية
**nbrsflow** هو تطبيق سطح مكتب لنظام ويندوز مبني باستخدام Electron وReact وTypeScript وTailwind CSS ومحرك التحميل `aria2`. يجمع التطبيق بين مدير تحميلات متعدد الاتصالات ومستكشف ملفات مزدوج اللوحة في مساحة عمل واحدة تدعم اللغتين العربية (`RTL`) والإنجليزية (`LTR`)، والمظهر الداكن والفاتح، وأوضاع عرض قابلة للتخصيص (`الافتراضي`، `التحميلات`، و`الملفات`).

---

## Core Capabilities | المزايا الرئيسية

- **Embedded `aria2` Download Engine (`IAria2Engine`)**  
  Segmented HTTP/HTTPS downloads via local authenticated JSON-RPC (`aria2c.exe v1.37.0`), automatic crash recovery, Pause/Resume/Cancel controls, speed and concurrency limits, persistent download history, and a Node HTTP/HTTPS Range fallback engine.
- **Dual-Pane File Explorer**  
  Real-time directory watching (`fs.watch`), **Grid**, **List**, and **Content** views, lazy-loaded thumbnails for images and folders, sorting and grouping controls, contextual quick actions for selected items, Dual-Pane mode, Recycle Bin deletion (`shell.trashItem`), optional drag-to-merge folder creation, and per-pane navigation history (`Back` / `Forward` / `Up`, `Alt+Left`/`Alt+Right`, interactive Breadcrumb).
- **Multi-Format Archive Inspection & Extraction**  
  Preview contents and extract `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.xz`, and `.tgz` archives directly to a subfolder or the current directory, with configurable post-extraction handling (`keep`, `trash`, or `move_to_archive`).
- **Rule-Based File & Sequence Organization**  
  Normalizes English and Arabic release names to group sequential media into shared folders, tracks `end` episode completion (`1..N`), and routes non-sequential Documents, Executables, Audio, and Images into unified type folders.
- **User-Defined Tags, Aliases, Colors & Hover Summaries**  
  Free-form user-created folder tags (reusable across folders with no hardcoded presets), Arabic/English acronym and alias matching, 7-color folder tagging, multi-line hover summaries, and New / Last-opened / Updated indicators.
- **Checksum Verification & Disk Space Guard**  
  Non-blocking streaming `SHA-256` and `MD5` computation with reference comparison, plus configurable free-space thresholds (`2 GB` default) and clipboard URL monitoring.
- **First-Run Setup Wizard & In-App Updater**  
  Guides initial configuration of the main downloads folder, default interface mode, and core automation options, alongside quiet GitHub Releases update checks.
- **Browser Extension (`Manifest V3`) & Stability Recovery**  
  Local authenticated HTTP bridge (`127.0.0.1`) for Chrome/Edge/Brave download interception, automatic stale GPU cache cleanup, and Safe Graphics Mode fallback.

---

## Getting Started | التشغيل والتطوير

### Prerequisites | المتطلبات
- **OS:** Windows 10 / Windows 11 (x64)
- **Runtime:** Node.js (v20+ recommended) & npm

### Run in Development Mode | التشغيل للتطوير
Launch on Windows using **`nbrsflow-dev.bat`**, or run:
```bash
npm install
npm run dev
```
*(The `predev` script verifies/downloads the Electron binary if missing.)*

### Run Automated Tests | تشغيل الاختبارات الآلية
```bash
npm run typecheck    # TypeScript check (renderer + main/preload)
npm run test:meta    # MetadataStore, aliases, tags, windowRecovery, auto-color
npm run test:fs      # Safe FS ops, archive extract, thumbnails, SHA-256/MD5
npm run test:aria2   # aria2c.exe JSON-RPC, fallback, Disk Space Guard, clipboard
npm run test:seq     # Sequence normalization, unified type folders, EN/AR acronyms
npm run test:ext     # Manifest V3 browser extension & local bridge server
npm run test:e2e     # End-to-end Electron UI verification via CDP
```

### Build & Package for Windows | البناء والتغليف
```bash
npm run build        # Build renderer (dist/) and Electron main/preload (dist-electron/)
npm run dist         # Package Windows x64 installer & unpacked app into release/
```
Generated artifacts in `release/` (git-ignored):
- `release/nbrsflow-setup-0.2.12.exe` (NSIS Windows installer)
- `release/win-unpacked/nbrsflow.exe` (Unpacked executable with bundled `resources/bin/win32/aria2c.exe`)

---

## Intellectual Property & Brand Protection | حقوق الملكية وحماية العلامة

- **Copyright & Scope:** **nbrsflow** (source code, user interface, and documentation) is copyright (c) 2026 **nbrs** and is distributed under the [MIT License](LICENSE).
- **Third-Party Component (`aria2`):** The bundled standalone binary `resources/bin/win32/aria2c.exe` (v1.37.0) is an external third-party component licensed under **GPLv2** and invoked over local JSON-RPC. See [resources/bin/win32/README.md](resources/bin/win32/README.md) for source and licensing details.
- **Brand & Attribution:** The name **nbrsflow**, its logo, and its visual brand assets (`public/brand/`, `resources/brand/`) remain the intellectual property of the author. Any fork or redistribution must preserve original copyright/license notices and must not impersonate the official project, claim official endorsement, or distribute modified binaries under misleading branding.

## Disclaimer | إخلاء المسؤولية

### English
This software is provided **"AS IS"**, without warranty of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, and non-infringement. The user is solely responsible for verifying the safety, integrity, copyright status, and legality of all URLs, downloads, archives, and files processed with the application. In no event shall the author or copyright holders be liable for any data loss, system issues, or direct, indirect, incidental, or consequential damages arising from the use, misuse, or inability to use this software or any external third-party sources.

### العربية
يُقدَّم هذا البرنامج **"كما هو" (`AS IS`)** دون أي ضمانات صريحة أو ضمنية، بما في ذلك على سبيل المثال لا الحصر ضمانات القابلية للتسويق أو الملاءمة لغرض معين أو عدم الانتهاك. يتحمّل المستخدم وحده كامل المسؤولية عن التحقق من سلامة الروابط والملفات والأرشيفات وحقوق الملكية الفكرية ومشروعية أي مواد يتم تحميلها أو إدارتها عبر التطبيق. لا يتحمّل المطوّر أو أصحاب حقوق الملكية أي مسؤولية قانونية أو مادية عن أي فقدان للبيانات أو أعطال أو أضرار مباشرة أو غير مباشرة ناتجة عن استخدام البرنامج أو سوء استخدامه أو عن أي مصادر خارجية.

---

## Project Documentation | وثائق المشروع

- [docs/PROJECT_BLUEPRINT.md](docs/PROJECT_BLUEPRINT.md) — Architecture and technical design reference.
- [docs/TASKS.md](docs/TASKS.md) — Implementation roadmap and phase checklist.
- [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) — Release verification and handoff log.
- [CHANGELOG.md](CHANGELOG.md) — Version history and release notes.
