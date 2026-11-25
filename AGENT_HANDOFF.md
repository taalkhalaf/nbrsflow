# AGENT_HANDOFF.md — nbrsflow

وثيقة المتابعة والتسليم المستمر. (ملفات التوثيق ومشروع التطبيق موجودة في `D:\Ai\antigravity\p1\nbrsflow`).

## 1. الحالة الحالية (Current Status)
- **الإصدار الحالي:** `v0.2.12` (تم رفعه في `package.json` و`extension/manifest.json` ويظهر ديناميكياً في الشريط العلوي وشريط الحالة وقائمة "حول" ومخرجات التغليف).
- **نتيجة التغليف النهائي (`npm run dist`):**
  - المثبّت القياسي لنظام ويندوز (NSIS): `D:\Ai\antigravity\p1\nbrsflow\release\nbrsflow-setup-0.2.12.exe` (`129,272,123` بايت)
  - النسخة التنفيذية غير المثبّتة: `D:\Ai\antigravity\p1\nbrsflow\release\win-unpacked\nbrsflow.exe`
  - أصول الهوية المضمّنة: `D:\Ai\antigravity\p1\nbrsflow\release\win-unpacked\resources\brand` و`D:\Ai\antigravity\p1\nbrsflow\public\brand`.
  - مجلد إضافة المتصفح المضمّن داخل النسخة المغلّفة: `D:\Ai\antigravity\p1\nbrsflow\release\win-unpacked\resources\extension`.
- `npm run typecheck` و`npm run build` ينجحان بصفر أخطاء.
- جميع حزم الاختبارات الآلية ناجحة بصفر أخطاء (**171 فحصاً إجمالياً**):
  - `npm run test:meta`: 31 فحصاً ناجحاً.
  - `npm run test:fs`: 32 فحصاً ناجحاً (شاملة فك الضغط المباشر `mode='here'` وتوليد المصغّرات `getThumbnail` للملفات والمجلدات).
  - `npm run test:aria2`: 24 فحصاً ناجحاً.
  - `npm run test:seq`: 26 فحصاً ناجحاً (شاملة المجلدات النوعية الموحّدة للمستندات والتنفيذيات والصوتيات والصور وحفظ الأرشيفات).
  - `npm run test:ext`: 11 فحصاً ناجحاً.
  - `npm run test:e2e`: 47 فحصاً ناجحاً على نافذة Electron الحقيقية (شاملة معالج الإعداد الأولي، والتصنيفات الحرة بدون قوائم جاهزة، وعرض المحتوى، وشريط الإجراءات السريعة، والفرز والتجميع، وخيار دمج السحب).
- **جاهزية وحالة GitHub:** تم رفع الإصدار `v0.2.12` إلى `https://github.com/taalkhalaf/nbrsflow.git` على فرع `origin/main` والوسم `v0.2.12`، ونشر GitHub Release رسمياً مع ملف المثبّت (`nbrsflow-setup-0.2.12.exe`):
  - صفحة الإصدار: `https://github.com/taalkhalaf/nbrsflow/releases/tag/v0.2.12` (و`https://github.com/taalkhalaf/nbrsflow/releases/latest`)
  - رابط التحميل المباشر: `https://github.com/taalkhalaf/nbrsflow/releases/latest/download/nbrsflow-setup-0.2.12.exe`
- تم إغلاق جميع العمليات الخلفية الخاصة بالتطوير والاختبار (`0` عمليات متبقية من بيئة التطوير)، ومجلد `D:\Ai\antigravity\nbrsflow_downloads_test` نظيف من أي مخلفات اختبار، و`nbrsflow-dev.bat` جاهز للتشغيل المباشر.

## 2. ما تم إنجازه في هذا الإصدار (`v0.2.12`)
- **رفع رقم الإصدار إلى `0.2.12` (`package.json` و`extension/manifest.json`).**
- **معالج الإعداد الأولي (`SetupWizardModal.tsx`):** يظهر تلقائياً عند أول تشغيل بعد التثبيت (ويمكن إعادة فتحه من الإعدادات -> النظام) لاختيار وتهيئة المجلد الرئيسي، ووضع الواجهة الافتراضي (`default` / `downloads` / `files`)، واللغة، ومراقبة الحافظة، والتنظيم التلقائي، والتحديث التلقائي.
- **تصنيفات حرة يكتبها المستخدم:** إزالة جميع القوائم الجاهزة المسبقة (`PRESET_FOLDER_TAGS`) واعتماد كتابة المستخدم للتصنيف الذي يريده مع تجميع تصنيفاته تلقائياً لإعادة استخدامها.
- **تجميع نوعي موحّد للمستندات والتنفيذيات والصوتيات (`electron/sequenceOrganizer.ts`):** توجيه الملفات التنفيذية (`.exe` وغيرها) والمستندات والصوتيات والصور إلى مجلدات نوعية موحّدة (`البرامج`/`Executables`, `المستندات`/`Documents`, `الصوتيات`/`Audio`, `الصور`/`Images`) ومنع إنشاء مجلد مستقل باسم الملف، مع إبقاء الأرشيفات ظاهرة وعدم استبعادها.
- **دعم الأرشيفات الشامل في مدير الملفات (`electron/fsOps.ts`, `ExplorerPane.tsx`, `SettingsDialog.tsx`):** عرض المحتويات وفك الضغط المباشر (`zip`, `rar`, `7z`, `tar`, `gz`, `bz2`, `xz`, `tgz`) إلى مجلد أو في المجلد الحالي، مع خيار الإبقاء أو النقل إلى السلة أو مجلد الأرشيف بعد فك الضغط، وفحص `SHA-256` / `MD5`.
- **تحسينات مدير الملفات بأسلوب ويندوز:** إضافة عرض **المحتوى** (`content`) مع سطر معلوماتي مختصر، ومصغّرات الصور والمجلدات (من أول صورة بداخل المجلد) بتحميل كسول آمن، وخيارات الفرز والتجميع، وشريط إجراءات سريعة عند التحديد.
- **دمج السحب فوق عنصر لإنشاء مجلد (`dragMergeToCreateFolder`):** خيار اختياري معطّل افتراضياً في الإعدادات لإنشاء مجلد جديد عند سحب عنصر فوق ملف آخر مع تمييز بصري واضح والحفاظ على الميتاداتا والتراجع (`Ctrl+Z`).

## 3. الملفات التي تم إنشاؤها أو تعديلها (Files Created/Modified)
- جديد: `src/components/SetupWizardModal.tsx`
- معدّل: `package.json`, `extension/manifest.json`, `CHANGELOG.md`, `README.md`, `TASKS.md`, `AGENT_HANDOFF.md`, `src/types/metadata.ts`, `src/types/index.ts`, `src/i18n/index.ts`, `src/lib/meta.tsx`, `src/lib/utils.ts`, `src/components/ContextMenu.tsx`, `src/components/FolderIcon.tsx`, `src/components/ExplorerPane.tsx`, `src/components/Sidebar.tsx`, `src/components/SettingsDialog.tsx`, `src/App.tsx`, `electron/preload.ts`, `electron/main.ts`, `electron/fsOps.ts`, `electron/sequenceOrganizer.ts`, `scripts/test-fsops.js`, `scripts/test-sequence.js`, `scripts/e2e.js`
- مخرجات بناء (متجاهلة في `.gitignore`): `release/nbrsflow-setup-0.2.12.exe`, `release/win-unpacked/nbrsflow.exe`

## 4. المشاكل أو التحذيرات (Issues/Warnings)
- لا توجد مشاكل أو تحذيرات وظيفية.
