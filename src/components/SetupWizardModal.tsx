import { useState } from 'react';
import type { Dict, Lang } from '../i18n';
import type { AppSettings, NbrsAPI, ViewMode } from '../types';

interface Props {
  api: NbrsAPI | undefined;
  t: Dict;
  lang: Lang;
  initialSettings: {
    downloadDir: string;
    viewMode: ViewMode;
    clipboardMonitor: boolean;
    autoOrganizeEnabled: boolean;
    autoCheckUpdates: boolean;
  };
  canDismiss?: boolean;
  onChangeLang: (lang: Lang) => void;
  onComplete: (patch: Partial<AppSettings>) => Promise<void>;
  onClose?: () => void;
}

export default function SetupWizardModal({
  api,
  t,
  lang,
  initialSettings,
  canDismiss,
  onChangeLang,
  onComplete,
  onClose
}: Props) {
  const [downloadDir, setDownloadDir] = useState(initialSettings.downloadDir);
  const [viewMode, setViewMode] = useState<ViewMode>(initialSettings.viewMode);
  const [clipboardMonitor, setClipboardMonitor] = useState(initialSettings.clipboardMonitor);
  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(initialSettings.autoOrganizeEnabled);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(initialSettings.autoCheckUpdates);
  const [saving, setSaving] = useState(false);

  const pickFolder = async () => {
    const picked = await api?.files.pickFolder();
    if (picked) setDownloadDir(picked);
  };

  const finish = async () => {
    setSaving(true);
    try {
      await onComplete({
        language: lang,
        downloadDir: downloadDir.trim() || initialSettings.downloadDir,
        viewMode,
        clipboardMonitor,
        autoOrganizeEnabled,
        autoCheckUpdates,
        setupCompleted: true
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="setup-wizard-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-[580px] max-w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-panel2/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src="./brand/nbrsflow_32.png" alt="nbrsflow" className="h-8 w-8 rounded-lg" />
            <div>
              <h2 className="text-base font-semibold text-fg">{t.setupWizardTitle}</h2>
              <p className="text-xs text-muted">{t.setupWizardDesc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="setup-lang-toggle"
              onClick={() => onChangeLang(lang === 'ar' ? 'en' : 'ar')}
              className="rounded-lg border border-line bg-bg px-2.5 py-1 text-xs text-silver hover:border-silver hover:text-fg"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            {canDismiss && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-xs text-silver hover:bg-panel2"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-auto p-5">
          {/* 1. Main Folder */}
          <section className="space-y-2 rounded-xl border border-line bg-bg p-4">
            <div className="text-sm font-medium text-fg">{t.setupMainFolder}</div>
            <p className="text-xs text-muted">{t.setupMainFolderHint}</p>
            <div className="flex items-center gap-2 pt-1">
              <input
                data-testid="setup-download-dir-input"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
                dir="ltr"
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg outline-none focus:border-silver"
              />
              <button
                type="button"
                data-testid="setup-browse-dir-btn"
                onClick={() => void pickFolder()}
                className="shrink-0 rounded-lg border border-line bg-panel2 px-3 py-2 text-xs font-medium text-fg hover:border-silver"
              >
                {t.browseFolder}
              </button>
            </div>
          </section>

          {/* 2. Default Interface Mode */}
          <section className="space-y-2.5 rounded-xl border border-line bg-bg p-4">
            <div className="text-sm font-medium text-fg">{t.setupViewMode}</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'default', label: t.viewModeDefault, icon: '⚡' },
                  { id: 'downloads', label: t.viewModeDownloads, icon: '⬇️' },
                  { id: 'files', label: t.viewModeFiles, icon: '📁' }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`setup-viewmode-${opt.id}`}
                  onClick={() => setViewMode(opt.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs transition-colors ${
                    viewMode === opt.id
                      ? 'border-silver bg-panel2 font-semibold text-fg'
                      : 'border-line bg-panel text-silver hover:border-silver/60 hover:text-fg'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 3. Core Options */}
          <section className="space-y-3 rounded-xl border border-line bg-bg p-4">
            <div className="text-sm font-medium text-fg">{t.setupCoreOptions}</div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line/60 bg-panel px-3 py-2.5">
              <div>
                <div className="text-xs font-medium text-fg">{t.clipboardMonitorTip}</div>
                <div className="text-[11px] text-muted">{t.clipboardDetected}</div>
              </div>
              <input
                type="checkbox"
                data-testid="setup-clipboard-toggle"
                checked={clipboardMonitor}
                onChange={(e) => setClipboardMonitor(e.target.checked)}
                className="h-4 w-4 accent-silver"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line/60 bg-panel px-3 py-2.5">
              <div>
                <div className="text-xs font-medium text-fg">{t.autoOrganize}</div>
                <div className="text-[11px] text-muted">{t.autoOrganizeTip}</div>
              </div>
              <input
                type="checkbox"
                data-testid="setup-autoorganize-toggle"
                checked={autoOrganizeEnabled}
                onChange={(e) => setAutoOrganizeEnabled(e.target.checked)}
                className="h-4 w-4 accent-silver"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line/60 bg-panel px-3 py-2.5">
              <div>
                <div className="text-xs font-medium text-fg">{t.setupAutoCheckUpdates}</div>
                <div className="text-[11px] text-muted">{t.setupAutoCheckUpdatesDesc}</div>
              </div>
              <input
                type="checkbox"
                data-testid="setup-autoupdate-toggle"
                checked={autoCheckUpdates}
                onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                className="h-4 w-4 accent-silver"
              />
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-line bg-panel2/40 px-5 py-3">
          {canDismiss && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line bg-bg px-4 py-2 text-xs text-silver hover:text-fg"
            >
              {t.cancel}
            </button>
          )}
          <button
            type="button"
            data-testid="setup-wizard-finish"
            disabled={saving}
            onClick={() => void finish()}
            className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-accentfg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '…' : t.setupFinish}
          </button>
        </div>
      </div>
    </div>
  );
}
