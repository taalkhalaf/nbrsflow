# nbrsflow — Project Blueprint | وثيقة المخطط الهندسي للمشروع

---

## 1. Overview & Vision | نظرة عامة ورؤية المشروع

### English
**nbrsflow** is a modern, high-performance Windows desktop application designed to bridge the gap between an **advanced download manager** and a **smart, interactive file explorer**. Built specifically for power users, content collectors, and developers, it is slated for public open-source release on GitHub under the developer identity **nbrs**.

Rather than treating downloading and local file management as disconnected phases, `nbrsflow` creates a unified workspace where active network streams and storage contents collaborate seamlessly.

### العربية
**nbrsflow** هو تطبيق سطح مكتب متقدم لنظام ويندوز يهدف إلى سد الفجوة بين **مدير تحميلات فائق الأداء** و**مستعرض ملفات ذكي وتفاعلي**. صُمم خصيصاً للمستخدمين المحترفين وهواة تنظيم وتجميع المحتوى، ومخصص للنشر كبرمجية مفتوحة المصدر على منصة GitHub تحت هوية المطور **nbrs**.

بدلاً من التعامل مع عمليات التحميل وإدارة الملفات المحلية كمرحلتين منفصلتين، يبتكر `nbrsflow` بيئة عمل موحدة تتكامل فيها تدفقات الشبكة الحية مع محتويات وسائط التخزين بسلاسة مطلقة.

---

## 2. Key Distinctive Features | الميزات التنافسية الرئيسية

### 1. Interactive Dual-Engine Explorer (مستكشف الملفات التفاعلي المزدوج)
- High-efficiency local file browser with dual/split views and intuitive navigation.
- Real-time directory watching and instant synchronization with download queues.

### 2. High-Speed aria2 Download Core (محرك التحميل فائق السرعة عبر aria2)
- Bundled standalone `aria2` binary controlled through local JSON-RPC over WebSocket/IPC.
- Multi-connection segmenting, pause/resume, speed throttling, and resilient network error recovery.

### 3. Automatic Sequence File Grouping (التجميع التلقائي للملفات المتسلسلة)
- Automatic detection and dynamic aggregation of numbered files, media episodes (e.g., `S01E01`, `001..100`), split archives (`.part1.rar`, `.z01`), and multi-part downloads into clean, collapsible stacks without moving files on disk.

### 4. Folder Coloring & Visual Tagging (تلوين المجلدات والوسم البصري)
- Visual folder categorization using distinct color palettes, tags, and customizable badges for rapid identification in deep directory trees.

### 5. Hover Previews & Quick Summaries (الملخصات السريعة والمعاينة عند التمرير)
- Instant floating preview cards displaying metadata, archive contents (ZIP/RAR), media dimensions/bitrates, and download provenance when hovering over files.

### 6. Smart Shortcuts & Acronym Matching (مطابقة الاختصارات والبحث الذكي)
- Command palette and fast filter engine supporting acronym matching (e.g., typing `fn` matches `Full Name`, `pr` matches `Project Report`).

---

## 3. Technical Architecture & Stack | البنية التقنية المعتمدة

```
+-------------------------------------------------------------------+
|                        nbrsflow Application                       |
+-------------------------------------------------------------------+
|  [ Renderer Process ]                                             |
|  - React 18 / TypeScript                                         |
|  - Tailwind CSS + Lucide Icons + Radix UI Primitives              |
|  - State Management (Zustand / TanStack Query)                    |
|  - Virtualized Lists for deep directories and massive queues      |
+---------------------------------+---------------------------------+
                                  | ContextBridge / Typed IPC
+---------------------------------v---------------------------------+
|  [ Main Process (Node.js & Electron runtime) ]                     |
|  - Windows Frameless Window Management & Native Shell Integrations|
|  - Local File System Driver (chokidar / fs/promises)             |
|  - Local Storage / Persistence (SQLite via better-sqlite3 / JSON) |
+---------------------------------+---------------------------------+
                                  | Local JSON-RPC (WebSocket / TCP)
+---------------------------------v---------------------------------+
|  [ Download Engine ]                                              |
|  - Standalone bundled aria2c binary                               |
|  - Managed lifecycle (spawn, monitor, auto-respawn, graceful stop)|
+-------------------------------------------------------------------+
```

### Core Technologies
- **Desktop Runtime**: [Electron](https://www.electronjs.org/) (Windows 10/11 optimized, frameless Mica/Acrylic aesthetics).
- **Frontend Framework**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/).
- **Styling & UI**: [Tailwind CSS](https://tailwindcss.com/) with a sleek, minimalist dark-first theme.
- **Download Daemon**: Bundled standalone [aria2](https://aria2.github.io/) binary operated via local authenticated JSON-RPC.
- **Persistence Layer**: Local SQLite database (`better-sqlite3`) with structured JSON configuration fallbacks.
- **File System Utilities**: Native Node.js `fs/promises` alongside reactive file-watching.

---

## 4. Environment & Development Paths | مسارات التطوير والبيئة

| Parameter | Configuration Value |
| :--- | :--- |
| **Project Workspace** | `D:\Ai\antigravity\p1\nbrsflow` |
| **Development Test Downloads Directory** | `D:\Ai\antigravity\nbrsflow_downloads_test` |
| **Target Platform** | Windows 10 / Windows 11 (x64) |
| **Author / Developer Identity** | `nbrs` |
| **License** | MIT License (2026) |
| **Distribution Target** | GitHub Releases (Portable `.zip` / `.exe` installer) |

---

## 5. Security & Stability Guarantees | معايير الأمان والاستقرار

1. **Strict Context Isolation**: Full isolation (`contextIsolation: true`, `nodeIntegration: false`) between Renderer and Main processes via strictly typed IPC channels.
2. **Local Loopback Communication**: aria2 RPC is bound strictly to `127.0.0.1` using a generated one-time secret token per session.
3. **Safe File Operations**: File manipulations (renaming, grouping, folder tags) strictly validate paths to prevent traversal and avoid destructive modifications.
4. **Resilient Download Resumption**: Unfinished downloads persist state atomically to allow instant recovery across app or OS reboots.

---

## 6. الرؤية المستقبلية (ما بعد النسخة الكاملة v1.0) | Future Vision (Post v1.0)

### العربية
بعد استقرار النسخة الكاملة `v1.0`، يخطط المشروع للتوسع نحو بنية مرنة تعتمد على **ثلاثة أوضاع عمل قابلة للتبديل الفوري من الشريط العلوي** لتناسب احتياجات المستخدم في كل لحظة:

1. **وضع التحميل فقط (الأساسي):** واجهة خفيفة ومركّزة مخصصة لإدارة التحميلات والروابط والسرعات فقط دون عرض مستعرض الملفات.
2. **وضع التحميل + مستكشف الملفات الذكي:** الدمج الحالي بين محرك التحميل (`aria2`) ومستكشف الملفات التفاعلي وتنظيم المسلسلات والملفات المتسلسلة والألوان والملخصات والاختصارات.
3. **وضع التحميل + المستكشف + متصفح ويب مدمج:** إضافة متصفح ويب مدمج داخل التطبيق لتصفح المواقع المعتادة والتقاط روابط التحميل والوسائط مباشرة وإرسالها إلى قائمة التحميل دون مغادرة التطبيق.

### English
Following the stable `v1.0` release, `nbrsflow` is planned to evolve into a flexible workspace offering **three instantly switchable operating modes from the top bar**:

1. **Download-Only Mode (Basic):** A lightweight, distraction-free interface dedicated purely to managing downloads, queues, and speeds.
2. **Download + Smart File Explorer Mode:** The unified workspace combining the `aria2` download engine with the interactive file explorer, automatic sequence grouping, folder coloring, hover summaries, and alias matching.
3. **Download + Explorer + Built-in Web Browser Mode:** An integrated in-app web browser allowing users to browse their usual sites and capture direct download/media links seamlessly without leaving the application.
