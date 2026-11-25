# AGENT_HANDOFF.md — nbrsflow

وثيقة المتابعة والتسليم المستمر. (ملفات التوثيق ومشروع التطبيق موجودة في `D:\Ai\antigravity\p1\nbrsflow`).

## 1. الحالة الحالية (Current Status)
- **الإصدار الحالي:** `v0.2.11` (تم رفعه في `package.json` و`extension/manifest.json` ويظهر ديناميكياً في الشريط العلوي وشريط الحالة وقائمة "حول" ومخرجات التغليف).
- **نتيجة التغليف النهائي (`npm run dist`):**
  - المثبّت القياسي لنظام ويندوز (NSIS): `D:\Ai\antigravity\p1\nbrsflow\release\nbrsflow-setup-0.2.11.exe`
  - النسخة التنفيذية غير المثبّتة: `D:\Ai\antigravity\p1\nbrsflow\release\win-unpacked\nbrsflow.exe`
  - أصول الهوية المضمّنة: `D:\Ai\antigravity\p1\nbrsflow\release\win-unpacked\resources\brand` و`D:\Ai\antigravity\p1\nbrsflow\public\brand`.
  - مجلد إضافة المتصفح المضمّن داخل النسخة المغلّفة: `D:\Ai\antigravity\p1\nbrsflow\release\win-unpacked\resources\extension`.
- `npm run typecheck` و`npm run build` ينجحان بصفر أخطاء.
- جميع حزم الاختبارات الآلية ناجحة بصفر أخطاء (**166 فحصاً إجمالياً**):
  - `npm run test:meta`: 31 فحصاً ناجحاً (شاملة اختبارات `AppUpdater` والتاغات و`windowRecovery`).
  - `npm run test:fs`: 30 فحصاً ناجحاً.
  - `npm run test:aria2`: 24 فحصاً ناجحاً.
  - `npm run test:seq`: 25 فحصاً ناجحاً (شاملة رصد لاحقة `end` واكتمال السلاسل `1..N` ونقل المكتمل وتجميع المجلدات حسب التاغ).
  - `npm run test:ext`: 11 فحصاً ناجحاً.
  - `node scripts/e2e.js`: 45 فحصاً ناجحاً على نافذة Electron الحقيقية (شاملة شارات المجلدات النصية `مكتمل` و`محدّث` وزوال `محدّث` بعد الفتح، وزر التحقق من التحديثات في قائمة "حول").
- **جاهزية وحالة GitHub:** تم رفع الإصدار `v0.2.11` بنجاح إلى `https://github.com/taalkhalaf/nbrsflow.git` على فرع `origin/main` (الالتزام الأساسي `8233070 Release v0.2.11`).
- تم إغلاق جميع العمليات الخلفية الخاصة بالتطوير والاختبار (`0` عمليات متبقية من بيئة التطوير)، ومجلد `D:\Ai\antigravity\nbrsflow_downloads_test` نظيف من أي مخلفات اختبار، و`nbrsflow-dev.bat` جاهز للتشغيل المباشر.

## 2. ما تم إنجازه في هذا الإصدار (`v0.2.11`)
- **رفع رقم الإصدار إلى `0.2.11` (`package.json` و`extension/manifest.json`).**
- **شارات نصية واضحة للمجلدات (`src/components/ExplorerPane.tsx`, `src/i18n/index.ts`):**
  - استبدال النقطة الخضراء الصغيرة بشارة نصية صريحة **`محدّث` / `Updated`** (`folder-updated-badge`) بأسلوب شارة `جديد` عند وجود ملفات جديدة غير مفتوحة داخل المجلد، وتختفي تلقائياً فور فتح الملف.
  - إبقاء شارة **`مكتمل` / `Complete`** (`folder-complete-badge`) النصية الواضحة للمجلدات المكتملة من `1..N` مع لاحقة `end`، وشارة **`!`** للمكررات مع سبب التكرار في التلميح.
- **إعادة تصميم أيقونة المجلد (`src/components/FolderIcon.tsx`):**
  - تصميم عصري وأنيق متعدد الطبقات بتدرجات لونية وإضاءة حواف زجاجية وظل خفيف، مع الحفاظ الكامل على دعم ألوان المجلدات المخصصة وعرض نص التاغ بوضوح على واجهة المجلد.
- **آلية التنبيه بالتحديثات والتحديث التلقائي من داخل البرنامج (`electron/appUpdater.ts`, `electron/main.ts`, `electron/preload.ts`, `src/components/TopBar.tsx`, `src/components/SettingsDialog.tsx`, `src/App.tsx`):**
  - التحقق التلقائي الهادئ والدوري واليدوي من إصدارات `taalkhalaf/nbrsflow` عبر GitHub Releases API.
  - إظهار شريط تنبيه واضح وشارة في الشريط العلوي عند توفر إصدار أحدث، مع زر **"تحديث الآن"** لتنزيل المثبّت وتشغيله تلقائياً (مع تنبيه لطيف في حال وجود تحميلات نشطة).

## 3. الملفات التي تم إنشاؤها أو تعديلها (Files Created/Modified)
- جديد: `electron/appUpdater.ts`
- معدّل: `package.json`, `extension/manifest.json`, `CHANGELOG.md`, `TASKS.md`, `AGENT_HANDOFF.md`, `src/types/index.ts`, `src/i18n/index.ts`, `src/components/FolderIcon.tsx`, `src/components/ExplorerPane.tsx`, `src/components/TopBar.tsx`, `src/components/SettingsDialog.tsx`, `src/App.tsx`, `electron/preload.ts`, `electron/main.ts`, `scripts/test-metadata.js`, `scripts/e2e.js`
- مخرجات بناء (متجاهلة في `.gitignore`): `release/nbrsflow-setup-0.2.11.exe`, `release/win-unpacked/nbrsflow.exe`

## 4. المشاكل أو التحذيرات (Issues/Warnings)
- لا توجد مشاكل أو تحذيرات وظيفية.
