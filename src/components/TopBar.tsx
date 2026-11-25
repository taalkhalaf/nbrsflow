import type { Dict } from '../i18n';
import type { ViewMode } from '../types';
import {
  IconClipboard,
  IconSearch,
  IconSettings,
  IconSidebar,
  IconUndo
} from './Icons';

interface Props {
  t: Dict;
  version: string;
  search: string;
  searchDownloads: boolean;
  searchFiles: boolean;
  viewMode: ViewMode;
  clipboardMonitor: boolean;
  showSidebar: boolean;
  maximized: boolean;
  canUndo: boolean;
  onSearch: (s: string) => void;
  onToggleSearchDownloads: () => void;
  onToggleSearchFiles: () => void;
  onChangeViewMode: (m: ViewMode) => void;
  onToggleSidebar: () => void;
  onUndo: () => void;
  onClipboardMonitor: () => void;
  onSettings: () => void;
  onWinMinimize: () => void;
  onWinMaximize: () => void;
  onWinClose: () => void;
}

export default function TopBar(p: Props) {
  const { t } = p;
  const btn = 'no-drag inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-silver transition-all duration-150 hover:bg-panel2 hover:text-fg active:scale-[0.97] disabled:opacity-35 disabled:pointer-events-none';
  const activeToggle = 'border-line bg-panel2 text-fg shadow-xs';
  const winBtn = 'no-drag inline-flex h-8 w-8 items-center justify-center rounded-md text-silver transition-colors duration-150 hover:bg-panel2 hover:text-fg active:scale-95';

  return (
    <header data-testid="topbar" dir="ltr" className="drag-region flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-panel px-3">
      <div className="flex shrink-0 items-center gap-2 pe-1" title={`nbrsflow v${p.version} — ${t.subtitle}`}>
        <img
          src="./brand/nbrsflow_32.png"
          alt="nbrsflow"
          data-testid="topbar-brand-icon"
          className="h-7 w-7 rounded-lg object-cover"
        />
        <span className="text-sm font-semibold tracking-tight text-fg">nbrsflow</span>
        <span data-testid="app-version" className="rounded-md border border-line bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted">
          v{p.version}
        </span>
      </div>

      <div className="no-drag relative flex min-w-0 flex-1 max-w-lg items-center gap-1.5">
        <div className="relative flex min-w-0 flex-1 items-center">
          <IconSearch size={14} className="pointer-events-none absolute start-3 text-muted" />
          <input
            data-testid="topbar-search-input"
            dir="auto"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder={t.search}
            className="h-8 w-full rounded-lg border border-line bg-bg ps-8 pe-3 text-xs text-fg placeholder:text-muted outline-none focus:border-silver"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-bg p-0.5 text-[11px]" data-testid="search-scope-group">
          <button
            type="button"
            data-testid="search-scope-downloads"
            onClick={p.onToggleSearchDownloads}
            className={`rounded-md px-2 py-0.5 transition-colors ${p.searchDownloads ? 'bg-panel2 font-medium text-fg' : 'text-muted hover:text-fg'}`}
          >
            {t.searchScopeDownloads}
          </button>
          <button
            type="button"
            data-testid="search-scope-files"
            onClick={p.onToggleSearchFiles}
            className={`rounded-md px-2 py-0.5 transition-colors ${p.searchFiles ? 'bg-panel2 font-medium text-fg' : 'text-muted hover:text-fg'}`}
          >
            {t.searchScopeFiles}
          </button>
        </div>
      </div>

      <div className="ms-auto flex items-center gap-1">
        <div
          data-testid="view-mode-selector"
          title={t.viewModeLabel}
          className="no-drag me-1 flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-bg p-0.5 text-[11px]"
        >
          {([
            ['default', t.viewModeDefault],
            ['downloads', t.viewModeDownloads],
            ['files', t.viewModeFiles]
          ] as [ViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              data-testid={`view-mode-${mode}`}
              onClick={() => p.onChangeViewMode(mode)}
              className={`rounded-md px-2 py-0.5 transition-colors ${
                p.viewMode === mode ? 'bg-panel2 font-medium text-fg shadow-xs' : 'text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button className={`${btn} ${p.showSidebar ? activeToggle : ''}`} onClick={p.onToggleSidebar} title={t.toggleSidebar} data-testid="sidebar-toggle">
          <IconSidebar size={15} />
        </button>

        <button className={btn} onClick={p.onUndo} disabled={!p.canUndo} title={t.undoBtn} data-testid="undo-btn">
          <IconUndo size={15} />
        </button>

        <span className="mx-0.5 h-4 w-px bg-line/60" />

        <button className={`${btn} ${p.clipboardMonitor ? activeToggle : ''}`} onClick={p.onClipboardMonitor} title={t.clipboardMonitorTip} data-testid="clipboard-toggle">
          <IconClipboard size={15} />
        </button>

        <button className={btn} onClick={p.onSettings} title={t.settings} data-testid="settings-btn">
          <IconSettings size={15} />
        </button>

        <div className="ms-1.5 flex items-center gap-0.5 border-s border-line ps-2" data-testid="window-controls">
          <button
            type="button"
            data-testid="win-min-btn"
            title={t.winMinimize}
            aria-label={t.winMinimize}
            onClick={p.onWinMinimize}
            className={winBtn}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="2" y1="6" x2="10" y2="6" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="win-max-btn"
            title={p.maximized ? t.winRestore : t.winMaximize}
            aria-label={p.maximized ? t.winRestore : t.winMaximize}
            onClick={p.onWinMaximize}
            className={winBtn}
          >
            {p.maximized ? (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="2" y="4" width="6" height="6" rx="0.8" />
                <path d="M4 4V2.8A.8.8 0 0 1 4.8 2H9.2a.8.8 0 0 1 .8.8v4.4a.8.8 0 0 1-.8.8H8" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
            )}
          </button>
          <button
            type="button"
            data-testid="win-close-btn"
            title={t.winClose}
            aria-label={t.winClose}
            onClick={p.onWinClose}
            className="no-drag inline-flex h-8 w-8 items-center justify-center rounded-md text-silver transition-colors duration-150 hover:bg-rose-500/85 hover:text-white active:scale-95"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
              <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
