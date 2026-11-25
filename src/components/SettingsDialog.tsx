import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Dict, Lang } from '../i18n';
import { extractAndFilterUrls, type UrlFilterCategory } from '../lib/urlFilter';
import type { AfterExtractAction, ExtensionBridgeStatus, NbrsAPI, UpdateState } from '../types';
import {
  IconDownload,
  IconFolderOpen,
  IconInfo,
  IconPalette,
  IconPuzzle,
  IconSettings,
  IconSparkles,
  IconUndo,
  IconX
} from './Icons';

export type SettingsTab = 'appearance' | 'downloads' | 'system' | 'extension' | 'external' | 'about';

interface Props {
  api?: NbrsAPI;
  t: Dict;
  version: string;
  lang: Lang;
  theme: 'dark' | 'light';
  downloadDir: string;
  showSidebar: boolean;
  dragDropEnabled: boolean;
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  batteryLiteMode: boolean;
  afterDownloadAction: 'notify' | 'open_folder' | 'sleep';
  maxConcurrentDownloads: number;
  maxDownloadSpeedKbps: number;
  extensionEnabled: boolean;
  extensionPort: number;
  onChangeLang: (lang: Lang) => void;
  onChangeTheme: (theme: 'dark' | 'light') => void;
  onChangeDownloadDir: (dir: string) => Promise<void> | void;
  onToggleSidebar: () => void;
  onToggleDragDrop: () => void;
  onToggleStartup: () => void;
  onToggleTray: () => void;
  onToggleBatteryLite: () => void;
  onChangeAfterDownloadAction: (action: 'notify' | 'open_folder' | 'sleep') => void;
  onChangeDownloadSettings: (patch: { maxConcurrentDownloads: number; maxDownloadSpeedKbps: number }) => Promise<void> | void;
  onBatchAddUrls: (urls: string[]) => Promise<number> | number;
  onToggleExtension: () => Promise<void> | void;
  onChangeExtensionPort: (port: number) => Promise<void> | void;
  onOpenExternalFolder: (folderPath: string) => Promise<void> | void;
  onOrganizeExternalFolder: (folderPath: string) => Promise<number> | number;
  onRestoreDefaults: () => Promise<void> | void;
  updateState?: UpdateState | null;
  onCheckForUpdates?: () => Promise<void> | void;
  onUpdateNow?: () => Promise<void> | void;
  onOpenSetupWizard?: () => void;
  dragMergeToCreateFolder?: boolean;
  onToggleDragMerge?: () => void;
  onClose: () => void;
}

export default function SettingsDialog({
  api,
  t,
  version,
  lang,
  theme,
  downloadDir,
  showSidebar,
  dragDropEnabled,
  launchAtStartup,
  minimizeToTray,
  batteryLiteMode,
  afterDownloadAction,
  maxConcurrentDownloads,
  maxDownloadSpeedKbps,
  extensionEnabled,
  extensionPort,
  onChangeLang,
  onChangeTheme,
  onChangeDownloadDir,
  onToggleSidebar,
  onToggleDragDrop,
  onToggleStartup,
  onToggleTray,
  onToggleBatteryLite,
  onChangeAfterDownloadAction,
  onChangeDownloadSettings,
  onBatchAddUrls,
  onToggleExtension,
  onChangeExtensionPort,
  onOpenExternalFolder,
  onOrganizeExternalFolder,
  onRestoreDefaults,
  updateState,
  onCheckForUpdates,
  onUpdateNow,
  onOpenSetupWizard,
  dragMergeToCreateFolder,
  onToggleDragMerge,
  onClose
}: Props) {
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [extStatus, setExtStatus] = useState<ExtensionBridgeStatus | null>(null);
  const [portInput, setPortInput] = useState(String(extensionPort));
  const [copied, setCopied] = useState(false);

  const [dirInput, setDirInput] = useState(downloadDir);
  const [concurrentInput, setConcurrentInput] = useState(String(maxConcurrentDownloads));
  const [speedInput, setSpeedInput] = useState(String(maxDownloadSpeedKbps));
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [schedStart, setSchedStart] = useState('01:00');
  const [schedEnd, setSchedEnd] = useState('07:00');
  const [schedSpeed, setSchedSpeed] = useState('0');
  const [allowOpenOutside, setAllowOpenOutside] = useState(true);
  const [autoMoveCompleted, setAutoMoveCompleted] = useState(false);
  const [groupByTag, setGroupByTag] = useState(false);
  const [disableGpu, setDisableGpu] = useState(false);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [afterExtractAction, setAfterExtractAction] = useState<AfterExtractAction>('keep');
  const [dlSaved, setDlSaved] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  const [batchText, setBatchText] = useState('');
  const [batchCategory, setBatchCategory] = useState<UrlFilterCategory>('all');
  const [batchCustomExt, setBatchCustomExt] = useState('');
  const [batchStatus, setBatchStatus] = useState<string | null>(null);

  const [extFolderInput, setExtFolderInput] = useState('');
  const [extFolderMsg, setExtFolderMsg] = useState<string | null>(null);

  const filteredUrls = useMemo(
    () => extractAndFilterUrls(batchText, batchCategory, batchCustomExt),
    [batchText, batchCategory, batchCustomExt]
  );

  const refreshExtStatus = () => {
    api?.extension.getStatus().then((st) => {
      setExtStatus(st);
      setPortInput(String(st.port));
    }).catch(() => undefined);
  };

  useEffect(() => {
    refreshExtStatus();
  }, [extensionEnabled, extensionPort]);

  useEffect(() => { setDirInput(downloadDir); }, [downloadDir]);
  useEffect(() => {
    setConcurrentInput(String(maxConcurrentDownloads));
    setSpeedInput(String(maxDownloadSpeedKbps));
    api?.settings.get().then((s) => {
      setSchedEnabled(!!s.scheduleEnabled);
      if (s.scheduleStartTime) setSchedStart(s.scheduleStartTime);
      if (s.scheduleEndTime) setSchedEnd(s.scheduleEndTime);
      setSchedSpeed(String(s.scheduleSpeedKbps ?? 0));
      setAllowOpenOutside(s.allowOpenDownloadsOutsideRoot !== false);
      setAutoMoveCompleted(!!s.autoMoveCompletedSeries);
      setGroupByTag(!!s.groupFoldersByTag);
      setDisableGpu(!!s.disableHardwareAcceleration);
      setAutoCheckUpdates(s.autoCheckUpdates !== false);
      setAfterExtractAction(s.afterExtractAction ?? 'keep');
    }).catch(() => undefined);
  }, [api, maxConcurrentDownloads, maxDownloadSpeedKbps]);

  const dirty =
    dirInput.trim() !== downloadDir.trim() ||
    Number(concurrentInput) !== maxConcurrentDownloads ||
    Number(speedInput) !== maxDownloadSpeedKbps ||
    Number(portInput) !== extensionPort;

  const switchRow = (
    testId: string,
    title: string,
    desc: string,
    checked: boolean,
    onToggle: () => void
  ) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-bg p-3.5 hover:bg-panel2/40">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-xs text-muted">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 ${
          checked ? 'border-silver bg-accent' : 'border-line bg-panel2'
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full transition-transform duration-150 ${
            checked
              ? 'translate-x-5 rtl:-translate-x-5 bg-accentfg'
              : 'translate-x-1 rtl:-translate-x-1 bg-silver'
          }`}
        />
      </button>
    </label>
  );

  const handleCopyPath = () => {
    if (!extStatus?.extensionPath) return;
    void navigator.clipboard.writeText(extStatus.extensionPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleApplyPort = async () => {
    const parsed = Number(portInput);
    if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) return;
    await onChangeExtensionPort(parsed);
    refreshExtStatus();
  };

  const handleApplyDownloadSettings = async () => {
    const parsedConc = Number(concurrentInput);
    const conc = Number.isFinite(parsedConc) ? Math.max(0, Math.min(100, Math.round(parsedConc))) : 0;
    const speed = Math.max(0, Math.round(Number(speedInput) || 0));
    setConcurrentInput(String(conc));
    setSpeedInput(String(speed));
    await onChangeDownloadSettings({ maxConcurrentDownloads: conc, maxDownloadSpeedKbps: speed });
    await api?.settings.set({
      scheduleEnabled: schedEnabled,
      scheduleStartTime: schedStart,
      scheduleEndTime: schedEnd,
      scheduleSpeedKbps: Math.max(0, Math.round(Number(schedSpeed) || 0)),
      allowOpenDownloadsOutsideRoot: allowOpenOutside
    });
    if (dirInput.trim() && dirInput.trim() !== downloadDir.trim()) {
      await onChangeDownloadDir(dirInput.trim());
    }
    setDlSaved(true);
    setTimeout(() => setDlSaved(false), 1500);
  };

  const handleSaveAll = async () => {
    await handleApplyDownloadSettings();
    const parsedPort = Number(portInput);
    if (Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535 && parsedPort !== extensionPort) {
      await onChangeExtensionPort(parsedPort);
      refreshExtStatus();
    }
    setSaveBanner(`✓ ${t.savedStatus}`);
    setTimeout(() => setSaveBanner(null), 2000);
  };

  const handleBrowseDownloadDir = async () => {
    const picked = await api?.files.pickFolder();
    if (picked) {
      setDirInput(picked);
      await onChangeDownloadDir(picked);
      setSaveBanner(`✓ ${t.savedStatus}`);
      setTimeout(() => setSaveBanner(null), 2000);
    }
  };

  const handleBrowseExternalFolder = async () => {
    const picked = await api?.files.pickFolder();
    if (picked) setExtFolderInput(picked);
  };

  const handleSendBatchUrls = async () => {
    if (filteredUrls.length === 0) return;
    const count = await onBatchAddUrls(filteredUrls);
    setBatchText('');
    setBatchStatus(`${t.batchUrlsSent}: ${count}`);
    setTimeout(() => setBatchStatus(null), 2500);
  };

  const navItems: { id: SettingsTab; icon: ReactNode; label: string; desc: string }[] = [
    { id: 'appearance', icon: <IconPalette size={15} />, label: t.settingsTabs.appearance, desc: t.sectionDescAppearance },
    { id: 'downloads', icon: <IconDownload size={15} />, label: t.settingsTabs.downloads, desc: t.sectionDescDownloads },
    { id: 'system', icon: <IconSettings size={15} />, label: t.settingsTabs.system, desc: t.sectionDescSystem },
    { id: 'extension', icon: <IconPuzzle size={15} />, label: t.settingsTabs.extension, desc: t.sectionDescExtension },
    { id: 'external', icon: <IconFolderOpen size={15} />, label: t.settingsTabs.external, desc: t.sectionDescExternal },
    { id: 'about', icon: <IconInfo size={15} />, label: t.settingsTabs.about, desc: t.sectionDescAbout }
  ];

  const activeSection = navItems.find((n) => n.id === tab) ?? navItems[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onMouseDown={onClose}>
      <div
        data-testid="settings-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[580px] max-h-[92vh] w-[760px] max-w-[96vw] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line bg-panel px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <IconSettings size={15} className="text-silver" />
            <span>{t.settingsTitlePrefix}</span>
            <span className="text-muted">/</span>
            <span className="text-silver">nbrsflow</span>
          </div>
          <button
            type="button"
            data-testid="settings-close-btn"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-silver hover:bg-panel2 hover:text-fg"
          ><IconX size={14} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-52 shrink-0 flex-col justify-between border-e border-line bg-bg/50 p-3">
            <nav className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`settings-tab-${item.id}`}
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm ${
                    tab === item.id
                      ? 'border border-line bg-panel2 font-medium text-fg'
                      : 'border border-transparent text-silver hover:bg-panel2/60 hover:text-fg'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>

            <button
              type="button"
              data-testid="settings-restore-defaults"
              onClick={() => {
                void Promise.resolve(onRestoreDefaults()).then(() => {
                  setSaveBanner(`✓ ${t.defaultsRestored}`);
                  setTimeout(() => setSaveBanner(null), 2000);
                });
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-silver hover:border-silver hover:text-fg"
            >
              <span><IconUndo size={13} /></span>
              <span>{t.restoreDefaults}</span>
            </button>
          </aside>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-4 border-b border-line/60 pb-3">
              <h3 className="flex items-center gap-2 text-base font-semibold text-fg">{activeSection.icon} <span>{activeSection.label}</span></h3>
              <p className="mt-0.5 text-xs text-muted">{activeSection.desc}</p>
            </div>

            {tab === 'appearance' && (
              <div data-testid="settings-panel-appearance" className="space-y-3">
                <div className="rounded-xl border border-line bg-bg p-3.5">
                  <div className="mb-2 text-sm font-medium text-fg">{t.appearanceTheme}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="settings-theme-dark"
                      onClick={() => onChangeTheme('dark')}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        theme === 'dark' ? 'border-silver bg-panel2 text-fg' : 'border-line bg-panel text-muted hover:text-fg'
                      }`}
                    >🌙 {t.appearanceThemeDark}</button>
                    <button
                      type="button"
                      data-testid="settings-theme-light"
                      onClick={() => onChangeTheme('light')}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        theme === 'light' ? 'border-silver bg-panel2 text-fg' : 'border-line bg-panel text-muted hover:text-fg'
                      }`}
                    >☀️ {t.appearanceThemeLight}</button>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-bg p-3.5">
                  <div className="mb-2 text-sm font-medium text-fg">{t.appearanceLang}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="settings-lang-ar"
                      onClick={() => onChangeLang('ar')}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        lang === 'ar' ? 'border-silver bg-panel2 text-fg' : 'border-line bg-panel text-muted hover:text-fg'
                      }`}
                    >العربية (RTL)</button>
                    <button
                      type="button"
                      data-testid="settings-lang-en"
                      onClick={() => onChangeLang('en')}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        lang === 'en' ? 'border-silver bg-panel2 text-fg' : 'border-line bg-panel text-muted hover:text-fg'
                      }`}
                    >English (LTR)</button>
                  </div>
                </div>

                {switchRow('toggle-sidebar', t.showSidebar, t.showSidebarDesc, showSidebar, onToggleSidebar)}
                {switchRow('toggle-drag-drop', t.dragDropSetting, t.dragDropSettingDesc, dragDropEnabled, onToggleDragDrop)}
              </div>
            )}

            {tab === 'downloads' && (
              <div data-testid="settings-panel-downloads" className="space-y-4">
                <div className="rounded-xl border border-line bg-bg p-3.5 space-y-2">
                  <div>
                    <div className="text-sm font-medium text-fg">{t.defaultDownloadDir}</div>
                    <div className="text-xs text-muted">{t.defaultDownloadDirDesc}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      data-testid="default-download-dir-input"
                      dir="ltr"
                      value={dirInput}
                      onChange={(e) => setDirInput(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-fg outline-none focus:border-silver"
                    />
                    <button
                      type="button"
                      data-testid="browse-download-dir-btn"
                      onClick={() => { void handleBrowseDownloadDir(); }}
                      className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs text-fg hover:border-silver"
                    >📁 {t.browseFolder}</button>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-bg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-fg">{t.batchUrlsLabel}</div>
                    <span className="text-[11px] text-silver">{t.batchExtractedCount}: {filteredUrls.length}</span>
                  </div>
                  <textarea
                    data-testid="batch-urls-input"
                    rows={3}
                    dir="ltr"
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                    placeholder={t.batchUrlsPlaceholder}
                    className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg placeholder:text-muted outline-none focus:border-silver"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {([
                      ['all', t.batchFilterAll],
                      ['video', t.batchFilterVideo],
                      ['audio', t.batchFilterAudio],
                      ['archive', t.batchFilterArchive],
                      ['docs', t.batchFilterDocs],
                      ['apps', t.batchFilterApps]
                    ] as [UrlFilterCategory, string][]).map(([cat, label]) => (
                      <button
                        key={cat}
                        type="button"
                        data-testid={`batch-filter-${cat}`}
                        onClick={() => setBatchCategory(cat)}
                        className={`rounded-md border px-2 py-0.5 text-[11px] ${
                          batchCategory === cat ? 'border-silver bg-panel2 text-fg' : 'border-line bg-panel text-muted hover:text-fg'
                        }`}
                      >{label}</button>
                    ))}
                    <input
                      data-testid="batch-filter-ext"
                      value={batchCustomExt}
                      onChange={(e) => setBatchCustomExt(e.target.value)}
                      dir="ltr"
                      placeholder={t.batchFilterExtPlaceholder}
                      className="ms-auto w-24 rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-fg placeholder:text-muted outline-none focus:border-silver"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-emerald-400">{batchStatus ?? ''}</span>
                    <button
                      type="button"
                      data-testid="batch-urls-send"
                      disabled={filteredUrls.length === 0}
                      onClick={() => { void handleSendBatchUrls(); }}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accentfg hover:opacity-90 disabled:opacity-40"
                    >⬇️ {t.batchUrlsSend} ({filteredUrls.length})</button>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-bg p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{t.maxConcurrentDownloads}</div>
                      <div className="text-xs text-muted">{t.maxConcurrentDownloadsDesc}</div>
                    </div>
                    <input
                      data-testid="max-concurrent-input"
                      type="number"
                      min={0}
                      max={100}
                      dir="ltr"
                      value={concurrentInput}
                      onChange={(e) => setConcurrentInput(e.target.value)}
                      className="w-20 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{t.maxDownloadSpeed}</div>
                      <div className="text-xs text-muted">{t.maxDownloadSpeedDesc}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        data-testid="max-speed-input"
                        type="number"
                        min={0}
                        step={128}
                        dir="ltr"
                        value={speedInput}
                        onChange={(e) => setSpeedInput(e.target.value)}
                        className="w-24 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
                      />
                      <span className="text-[11px] text-muted" dir="ltr">KB/s</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-3">
                    <div className="text-sm font-medium text-fg">{t.afterDownloadAction}</div>
                    <select
                      data-testid="after-download-select"
                      value={afterDownloadAction}
                      onChange={(e) => onChangeAfterDownloadAction(e.target.value as 'notify' | 'open_folder' | 'sleep')}
                      className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
                    >
                      <option value="notify">{t.afterDownloadNotify}</option>
                      <option value="open_folder">{t.afterDownloadOpenFolder}</option>
                      <option value="sleep">{t.afterDownloadSleep}</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex gap-1.5">
                      {[0, 512, 1024, 5120].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSpeedInput(String(preset))}
                          className="rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-silver hover:border-silver"
                        >
                          {preset === 0 ? t.speedUnlimited : preset >= 1024 ? `${preset / 1024} MB/s` : `${preset} KB/s`}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      data-testid="apply-download-settings"
                      onClick={() => { void handleApplyDownloadSettings(); }}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accentfg hover:opacity-90"
                    >{dlSaved ? '✓' : t.applyDownloadSettings}</button>
                  </div>
                </div>

                <div data-testid="schedule-settings-card" className="rounded-xl border border-line bg-bg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-fg">{t.scheduleTitle}</div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={schedEnabled}
                      data-testid="toggle-schedule"
                      onClick={() => setSchedEnabled((v) => !v)}
                      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${schedEnabled ? 'border-accent bg-accent' : 'border-line bg-panel2'}`}
                    >
                      <span className={`block h-3.5 w-3.5 rounded-full transition-transform ${schedEnabled ? 'translate-x-4 rtl:-translate-x-4 bg-accentfg' : 'translate-x-0.5 rtl:-translate-x-0.5 bg-silver'}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <label className="space-y-1">
                      <span className="text-muted">{t.scheduleStart}</span>
                      <input data-testid="schedule-start-input" type="time" dir="ltr" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} className="w-full rounded-md border border-line bg-panel px-2 py-1 text-fg" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-muted">{t.scheduleEnd}</span>
                      <input data-testid="schedule-end-input" type="time" dir="ltr" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)} className="w-full rounded-md border border-line bg-panel px-2 py-1 text-fg" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-muted">{t.scheduleSpeed}</span>
                      <input data-testid="schedule-speed-input" type="number" min={0} step={128} dir="ltr" value={schedSpeed} onChange={(e) => setSchedSpeed(e.target.value)} className="w-full rounded-md border border-line bg-panel px-2 py-1 text-fg" />
                    </label>
                  </div>
                </div>

                {switchRow(
                  'toggle-open-outside-root',
                  t.allowOpenOutsideRoot,
                  t.allowOpenOutsideRootDesc,
                  allowOpenOutside,
                  () => {
                    const next = !allowOpenOutside;
                    setAllowOpenOutside(next);
                    void api?.settings.set({ allowOpenDownloadsOutsideRoot: next });
                  }
                )}

                {switchRow(
                  'toggle-auto-move-completed',
                  t.autoMoveCompleted,
                  t.autoMoveCompletedDesc,
                  autoMoveCompleted,
                  () => {
                    const next = !autoMoveCompleted;
                    setAutoMoveCompleted(next);
                    void api?.settings.set({ autoMoveCompletedSeries: next });
                  }
                )}

                {switchRow(
                  'toggle-group-by-tag',
                  t.groupByTag,
                  t.groupByTagDesc,
                  groupByTag,
                  () => {
                    const next = !groupByTag;
                    setGroupByTag(next);
                    void api?.settings.set({ groupFoldersByTag: next });
                  }
                )}

                {onToggleDragMerge && switchRow(
                  'toggle-drag-merge',
                  t.dragMergeSetting,
                  t.dragMergeSettingDesc,
                  !!dragMergeToCreateFolder,
                  onToggleDragMerge
                )}

                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg p-3.5">
                  <label htmlFor="after-extract-select" className="text-sm font-medium text-fg">
                    {t.afterExtractLabel}
                  </label>
                  <select
                    id="after-extract-select"
                    data-testid="after-extract-select"
                    value={afterExtractAction}
                    onChange={(e) => {
                      const val = e.target.value as AfterExtractAction;
                      setAfterExtractAction(val);
                      void api?.settings.set({ afterExtractAction: val });
                    }}
                    className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
                  >
                    <option value="keep">{t.afterExtractKeep}</option>
                    <option value="trash">{t.afterExtractTrash}</option>
                    <option value="move_to_archive">{t.afterExtractMove}</option>
                  </select>
                </div>
              </div>
            )}

            {tab === 'system' && (
              <div data-testid="settings-panel-system" className="space-y-3">
                {switchRow('toggle-startup', t.launchAtStartup, t.launchAtStartupDesc, launchAtStartup, onToggleStartup)}
                {switchRow('toggle-tray', t.closeToTrayTitle, t.closeToTrayDesc, minimizeToTray, onToggleTray)}
                {switchRow('toggle-battery-lite', t.batteryLiteMode, t.batteryLiteModeDesc, batteryLiteMode, onToggleBatteryLite)}
                {switchRow(
                  'toggle-auto-updates',
                  t.setupAutoCheckUpdates,
                  t.setupAutoCheckUpdatesDesc,
                  autoCheckUpdates,
                  () => {
                    const next = !autoCheckUpdates;
                    setAutoCheckUpdates(next);
                    void api?.settings.set({ autoCheckUpdates: next });
                  }
                )}
                {switchRow(
                  'toggle-disable-gpu',
                  t.disableHardwareAccel,
                  t.disableHardwareAccelDesc,
                  disableGpu,
                  () => {
                    const next = !disableGpu;
                    setDisableGpu(next);
                    void api?.settings.set({ disableHardwareAcceleration: next });
                  }
                )}
                {onOpenSetupWizard && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg p-3.5">
                    <div>
                      <div className="text-sm font-medium text-fg">{t.setupReopen}</div>
                      <div className="mt-0.5 text-xs text-muted">{t.setupWizardDesc}</div>
                    </div>
                    <button
                      type="button"
                      data-testid="reopen-setup-wizard-btn"
                      onClick={() => { onClose(); onOpenSetupWizard(); }}
                      className="shrink-0 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-medium text-fg hover:border-silver"
                    >
                      {t.setupReopen}
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab === 'extension' && (
              <div data-testid="settings-panel-extension" className="space-y-3">
                <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-bg p-3.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-silver">
                    🧩 {t.browserExtension}
                  </span>
                  <span
                    data-testid="extension-status"
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      extStatus?.listening
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-panel2 text-muted'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${extStatus?.listening ? 'bg-emerald-400' : 'bg-muted'}`} />
                    {extStatus?.listening
                      ? `${t.extensionListening} ${extStatus.host}:${extStatus.port}`
                      : t.extensionStopped}
                  </span>
                </div>

                {switchRow(
                  'toggle-extension',
                  t.extensionBridge,
                  t.extensionBridgeDesc,
                  extensionEnabled,
                  () => { void onToggleExtension(); }
                )}

                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg p-3.5">
                  <label htmlFor="extension-port-input" className="text-xs text-silver">
                    {t.extensionPort}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="extension-port-input"
                      data-testid="extension-port-input"
                      type="number"
                      min={1024}
                      max={65535}
                      dir="ltr"
                      value={portInput}
                      onChange={(e) => setPortInput(e.target.value)}
                      className="w-24 rounded-md border border-line bg-panel px-2 py-1 text-xs text-fg outline-none focus:border-silver"
                    />
                    <button
                      type="button"
                      data-testid="extension-port-save"
                      onClick={() => { void handleApplyPort(); }}
                      className="rounded-md border border-line bg-panel2 px-2.5 py-1 text-xs text-fg hover:border-silver"
                    >
                      {t.extensionPortSave}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-xl border border-line bg-bg p-3.5">
                  <div className="text-xs text-silver">{t.extensionFolderPath}</div>
                  <div className="flex items-center gap-2">
                    <code
                      data-testid="extension-path"
                      dir="ltr"
                      className="min-w-0 flex-1 truncate rounded-md border border-line bg-panel px-2.5 py-1.5 text-[11px] text-fg"
                      title={extStatus?.extensionPath ?? ''}
                    >
                      {extStatus?.extensionPath || 'extension/'}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyPath}
                      className="rounded-md border border-line bg-panel2 px-2.5 py-1 text-xs text-fg hover:border-silver"
                    >
                      {copied ? t.copied : t.copyPath}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void api?.extension.openFolder(); }}
                      className="rounded-md border border-line bg-panel2 px-2.5 py-1 text-xs text-fg hover:border-silver"
                    >
                      {t.extensionOpenFolder}
                    </button>
                  </div>
                  <div className="text-[11px] text-muted">{t.extensionInstallHint}</div>
                </div>
              </div>
            )}

            {tab === 'external' && (
              <div data-testid="settings-panel-external" className="space-y-3">
                <div className="rounded-xl border border-line bg-bg p-4 space-y-3">
                  <div className="text-sm font-medium text-fg">{t.externalFolderInputLabel}</div>
                  <div className="flex items-center gap-2">
                    <input
                      data-testid="external-folder-input"
                      dir="ltr"
                      value={extFolderInput}
                      onChange={(e) => setExtFolderInput(e.target.value)}
                      placeholder={t.externalFolderPlaceholder}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg placeholder:text-muted outline-none focus:border-silver"
                    />
                    <button
                      type="button"
                      data-testid="browse-external-folder-btn"
                      onClick={() => { void handleBrowseExternalFolder(); }}
                      className="rounded-lg border border-line bg-panel2 px-3 py-2 text-xs text-fg hover:border-silver"
                    >📁 {t.browseFolder}</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="open-external-folder-btn"
                      disabled={!extFolderInput.trim()}
                      onClick={() => {
                        void Promise.resolve(onOpenExternalFolder(extFolderInput.trim())).then(() => {
                          setExtFolderMsg(`✓ ${t.externalFolderOpened}`);
                        });
                      }}
                      className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs font-medium text-fg hover:border-silver disabled:opacity-40"
                    >📂 {t.externalFolderOpen}</button>
                    <button
                      type="button"
                      data-testid="organize-external-folder-btn"
                      disabled={!extFolderInput.trim()}
                      onClick={() => {
                        void Promise.resolve(onOrganizeExternalFolder(extFolderInput.trim())).then((n) => {
                          setExtFolderMsg(`✓ ${t.externalFolderOrganized}: ${n}`);
                        });
                      }}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accentfg hover:opacity-90 disabled:opacity-40"
                    >✨ {t.externalFolderOrganize}</button>
                  </div>
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-200">
                    ⚠️ {t.thisPcNoticeBody}
                  </div>
                  {extFolderMsg && (
                    <div data-testid="external-folder-status" className="text-xs text-emerald-400">{extFolderMsg}</div>
                  )}
                </div>
              </div>
            )}

            {tab === 'about' && (
              <div data-testid="settings-panel-about" className="space-y-4">
                <div className="flex items-center gap-4 rounded-xl border border-line bg-bg p-4">
                  <div
                    data-testid="about-logo-slot"
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel p-1"
                  >
                    <img
                      src="./brand/nbrsflow_128.png"
                      alt="nbrsflow"
                      data-testid="about-brand-logo"
                      className="h-full w-full rounded-lg object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-tight text-fg">nbrsflow</div>
                    <div className="text-xs text-muted">{t.subtitle}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <div className="inline-block rounded-md border border-line bg-panel px-2 py-0.5 text-xs font-medium text-silver" dir="ltr">
                        {t.aboutVersion}: v{version}
                      </div>
                      <button
                        type="button"
                        data-testid="check-updates-btn"
                        disabled={updateState?.status === 'checking' || updateState?.status === 'downloading'}
                        onClick={() => { void onCheckForUpdates?.(); }}
                        className="rounded-md border border-line bg-panel2 px-2.5 py-0.5 text-xs text-fg hover:border-silver disabled:opacity-50"
                      >
                        {updateState?.status === 'checking' ? t.checkingUpdates : t.checkForUpdates}
                      </button>
                      {updateState?.status === 'available' && (
                        <button
                          type="button"
                          data-testid="settings-update-now-btn"
                          onClick={() => { void onUpdateNow?.(); }}
                          className="rounded-md bg-emerald-500 px-2.5 py-0.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
                        >
                          ⬆ {t.updateNow} (v{updateState.latestVersion})
                        </button>
                      )}
                    </div>
                    {updateState && updateState.status !== 'idle' && (
                      <div data-testid="settings-update-status" className="mt-1.5 text-[11px] text-silver">
                        {updateState.status === 'checking' && t.checkingUpdates}
                        {updateState.status === 'up-to-date' && `✓ ${t.upToDate}`}
                        {updateState.status === 'available' && `✨ ${t.updateAvailable}: v${updateState.latestVersion}`}
                        {updateState.status === 'downloading' && `${t.downloadingUpdate} ${updateState.downloadProgress ?? 0}%`}
                        {updateState.status === 'ready' && `✓ ${t.updateReadyLaunching}`}
                        {updateState.status === 'error' && `${t.updateError}${updateState.error ? `: ${updateState.error}` : ''}`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-bg p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">{t.aboutDeveloper}</span>
                    <span className="font-medium text-fg" dir="ltr">NBRS VibeCoding</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2">
                    <span className="text-muted">{t.aboutEmail}</span>
                    <a
                      href="mailto:nbrs.vibecoding@gmail.com"
                      dir="ltr"
                      className="font-medium text-silver hover:text-fg"
                    >nbrs.vibecoding@gmail.com</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line bg-panel px-5 py-3">
          <div data-testid="settings-save-status" className="text-xs text-muted">
            {saveBanner ? <span className="text-emerald-400">{saveBanner}</span> : (dirty ? t.unsavedStatus : '')}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3.5 py-1.5 text-xs text-silver hover:bg-panel2 hover:text-fg"
            >{t.close}</button>
            <button
              type="button"
              data-testid="settings-save-btn"
              onClick={() => { void handleSaveAll(); }}
              className="rounded-lg border border-line bg-panel2 px-3.5 py-1.5 text-xs font-medium text-fg hover:border-silver"
            >{t.saveBtn}</button>
            <button
              type="button"
              data-testid="settings-save-close-btn"
              onClick={() => { void handleSaveAll().then(onClose); }}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-accentfg hover:opacity-90"
            >{t.saveAndCloseBtn}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
