import { useState } from 'react';
import type { DiskSpaceWarning, DownloadItem, DownloadStatus } from '../types';
import type { Dict } from '../i18n';
import { formatBytes } from '../lib/utils';
import ContextMenu, { type MenuEntry } from './ContextMenu';
import {
  IconAlert,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconFolder,
  IconFolderOpen,
  IconPause,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX
} from './Icons';

export type DlTab = 'all' | 'active' | 'paused' | 'completed';

interface Props {
  t: Dict;
  items: DownloadItem[];
  tab: DlTab;
  search?: string;
  collapsed: boolean;
  height: number;
  fillHeight?: boolean;
  diskWarning?: DiskSpaceWarning | null;
  onTab: (t: DlTab) => void;
  onToggle: () => void;
  onAddUrl: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRefreshUrl: (item: DownloadItem) => void;
  onCancel: (id: string) => void;
  onSetNote?: (id: string, note: string) => void;
  onExportList?: () => void;
  onImportList?: (jsonText: string) => void;
  onOpen: (filePath: string) => void;
  onReveal: (filePath: string) => void;
}

const tabMatch: Record<DlTab, (s: DownloadStatus) => boolean> = {
  all: () => true,
  active: (s) => s === 'active' || s === 'queued',
  paused: (s) => s === 'paused' || s === 'error',
  completed: (s) => s === 'completed'
};

function formatEta(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function DownloadsPanel({
  t, items, tab, search = '', collapsed, height, fillHeight, diskWarning, onTab, onToggle, onAddUrl, onResizeStart,
  onPause, onResume, onRefreshUrl, onCancel, onSetNote, onExportList, onImportList, onOpen, onReveal
}: Props) {
  const tabs: [DlTab, string][] = [['all', t.tabAll], ['active', t.tabActive], ['paused', t.tabPaused], ['completed', t.tabDone]];
  const q = search.trim().toLowerCase();
  const shown = items.filter((i) =>
    tabMatch[tab](i.status) &&
    (!q ||
      i.fileName.toLowerCase().includes(q) ||
      (i.autoGroupedFolder ?? '').toLowerCase().includes(q) ||
      (i.matchedAlias ?? '').toLowerCase().includes(q) ||
      (i.note ?? '').toLowerCase().includes(q))
  );
  const showDiskWarn = diskWarning && (diskWarning.lowSpace || diskWarning.insufficientForFile);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: DownloadItem } | null>(null);
  const [detailsItem, setDetailsItem] = useState<DownloadItem | null>(null);
  const [noteEditItem, setNoteEditItem] = useState<DownloadItem | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const buildRowMenu = (d: DownloadItem): MenuEntry[] => {
    const targetPath = d.filePath || `${d.destination}\\${d.fileName}`;
    const isRunning = d.status === 'active' || d.status === 'queued';
    const canResume = d.status === 'paused' || d.status === 'error';
    const entries: MenuEntry[] = [];
    if (d.status === 'completed') {
      entries.push(
        { label: t.dlOpen, onClick: () => onOpen(targetPath) },
        { label: t.dlReveal, onClick: () => onReveal(targetPath) },
        'sep'
      );
    }
    if (isRunning) entries.push({ label: t.dlPause, onClick: () => onPause(d.id) });
    if (canResume) entries.push({ label: t.dlResume, onClick: () => onResume(d.id) });
    if (d.status !== 'completed' && d.status !== 'removed') {
      entries.push({ label: t.refreshUrl, onClick: () => onRefreshUrl(d) });
    }
    if (entries.length > 0 && entries[entries.length - 1] !== 'sep') entries.push('sep');
    entries.push(
      { label: t.copyDownloadUrl, onClick: () => { void navigator.clipboard?.writeText(d.url); } },
      ...(onSetNote ? [{ label: t.dlNoteEdit, onClick: () => { setNoteEditItem(d); setNoteDraft(d.note || ''); } }] : []),
      { label: t.dlDetails, onClick: () => setDetailsItem(d) },
      'sep',
      { label: t.dlCancel, danger: true, onClick: () => onCancel(d.id) }
    );
    return entries;
  };

  return (
    <section
      data-testid="downloads-panel"
      className={`flex flex-col bg-panel ${fillHeight ? 'min-h-0 flex-1' : 'shrink-0 border-b border-line'}`}
      style={fillHeight ? undefined : { height: collapsed ? 40 : height }}
    >
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <span className="me-2 inline-flex items-center gap-1.5 text-sm font-medium text-fg">
          <IconDownload size={15} className="text-silver" />
          <span>{t.downloadsPanel}</span>
        </span>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => onTab(k)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${tab === k ? 'border-line bg-panel2 font-medium text-fg' : 'border-transparent text-muted hover:bg-panel2/70 hover:text-fg'}`}>
            {label} <span className="opacity-70">{items.filter((i) => tabMatch[k](i.status)).length}</span>
          </button>
        ))}
        <button
          type="button"
          data-testid="dl-add-url-btn"
          onClick={onAddUrl}
          className="ms-1.5 inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-medium text-accentfg transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
        >
          <IconPlus size={13} />
          <span>{t.addUrl}</span>
        </button>
        {onExportList && (
          <button
            type="button"
            data-testid="dl-export-btn"
            onClick={onExportList}
            title={t.dlExport}
            className="inline-flex h-7 items-center rounded-lg border border-line bg-panel2 px-2 text-[11px] text-silver hover:border-silver hover:text-fg"
          >{t.dlExport}</button>
        )}
        {onImportList && (
          <label
            data-testid="dl-import-btn"
            title={t.dlImport}
            className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-line bg-panel2 px-2 text-[11px] text-silver hover:border-silver hover:text-fg"
          >
            {t.dlImport}
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                void file.text().then((txt) => onImportList(txt));
              }}
            />
          </label>
        )}
        <button onClick={onToggle} className="ms-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-panel2 hover:text-fg">
          {collapsed ? <><IconChevronDown size={13} /><span>{t.expand}</span></> : <><IconChevronUp size={13} /><span>{t.collapse}</span></>}
        </button>
      </div>

      {!collapsed && showDiskWarn && (
        <div data-testid="downloads-disk-warning" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-300">
          <IconAlert size={14} />
          <span>
            {diskWarning.insufficientForFile ? t.insufficientDiskWarning : t.lowDiskWarning}
            {diskWarning.fileName ? ` — ${diskWarning.fileName}` : ''} ({formatBytes(diskWarning.freeBytes)})
          </span>
        </div>
      )}

      {!collapsed && (
        <div className="flex-1 overflow-auto">
          {shown.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">{t.noDownloads}</div>
          ) : shown.map((d) => {
            const pct = d.status === 'completed'
              ? 100
              : d.totalBytes > 0
                ? Math.min(100, Math.round((d.completedBytes / d.totalBytes) * 100))
                : 0;
            const targetPath = d.filePath || `${d.destination}\\${d.fileName}`;
            const isRunning = d.status === 'active' || d.status === 'queued';
            const canResume = d.status === 'paused' || d.status === 'error';
            const hasWarning = d.status === 'completed' && !!(d.warningCode || d.warningMessage);
            const warningText = d.warningCode === 'html_error_page'
              ? t.suspiciousHtmlFile
              : d.warningCode === 'small_file'
                ? t.suspiciousSmallFile
                : d.warningMessage;

            return (
              <div key={d.id} data-testid="download-row" data-status={d.status} data-selected={selectedId === d.id ? 'true' : undefined} data-warning={hasWarning ? 'true' : undefined}
                onClick={() => setSelectedId(d.id)}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  if (d.status === 'completed') onOpen(targetPath);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedId(d.id);
                  setMenu({ x: e.clientX, y: e.clientY, item: d });
                }}
                className={`flex cursor-default items-center gap-3 border-b border-line/60 px-4 py-2 text-sm transition-colors ${selectedId === d.id ? 'bg-panel2 ring-1 ring-inset ring-silver/60' : 'hover:bg-panel2/40'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium" title={targetPath}>{d.fileName}</span>
                    {d.autoGroupedFolder && (
                      <span
                        data-testid="auto-group-badge"
                        title={`${t.autoGroupedTo}: ${d.autoGroupedFolder}${d.matchedAlias ? ` (${t.matchedViaAlias}: ${d.matchedAlias})` : ''}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-panel2 px-1.5 py-0.5 text-[11px] text-silver"
                      ><IconFolder size={11} />{d.autoGroupedFolder}{d.matchedAlias ? ` (${d.matchedAlias})` : ''}</span>
                    )}
                    <span className="text-xs text-muted" dir="ltr">{pct}%</span>
                  </div>
                  {d.note && (
                    <div data-testid="dl-note-badge" className="mt-0.5 truncate text-[11px] text-silver" title={d.note}>
                      🗒 {d.note}
                    </div>
                  )}
                  {hasWarning && warningText && (
                    <div data-testid="download-warning" className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-amber-300" title={warningText}>
                      <IconAlert size={12} className="shrink-0" />
                      <span className="truncate">{warningText}</span>
                    </div>
                  )}
                  {d.status === 'error' && d.errorMessage && (
                    <div data-testid="download-error" className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-rose-400" title={d.errorMessage}>
                      <IconX size={12} className="shrink-0" />
                      <span className="truncate">{d.errorMessage}</span>
                    </div>
                  )}
                </div>

                <div className="flex w-44 flex-col gap-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
                    <div
                      className={`h-full transition-all duration-150 ${hasWarning ? 'bg-amber-500' : d.status === 'completed' ? 'bg-emerald-500' : d.status === 'error' ? 'bg-rose-500' : d.status === 'paused' ? 'bg-amber-400' : 'bg-silver'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted" dir="ltr">
                    <span>{formatBytes(d.completedBytes)}{d.totalBytes > 0 ? ` / ${formatBytes(d.totalBytes)}` : ''}</span>
                    <span>{isRunning ? `${formatBytes(d.speedBps)}/s` : ''}</span>
                  </div>
                </div>

                <div className="w-20 text-center text-xs text-muted" dir="ltr" title={t.dlEta}>
                  {isRunning ? formatEta(d.etaSeconds) : '—'}
                </div>

                <span
                  title={hasWarning ? warningText : (d.errorMessage || '')}
                  className={`w-24 text-end text-xs font-medium ${hasWarning ? 'text-amber-300' : d.status === 'completed' ? 'text-emerald-400' : d.status === 'error' ? 'text-rose-400' : d.status === 'paused' ? 'text-amber-300' : 'text-muted'}`}
                >
                  {hasWarning ? `⚠️ ${t.status[d.status]}` : t.status[d.status]}
                </span>

                <div className="flex items-center gap-1">
                  {isRunning && (
                    <button
                      data-testid="dl-pause-btn"
                      title={t.dlPause}
                      onClick={() => onPause(d.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-silver hover:bg-panel2 hover:text-fg"
                    ><IconPause size={13} /></button>
                  )}
                  {canResume && (
                    <button
                      data-testid="dl-resume-btn"
                      title={t.dlResume}
                      onClick={() => onResume(d.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-silver hover:bg-panel2 hover:text-fg"
                    ><IconPlay size={13} /></button>
                  )}
                  {d.status !== 'completed' && d.status !== 'removed' && (
                    <button
                      data-testid="dl-refresh-url-btn"
                      title={t.refreshUrl}
                      onClick={() => onRefreshUrl(d)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-silver hover:bg-panel2 hover:text-fg"
                    ><IconRefresh size={13} /></button>
                  )}
                  {d.status === 'completed' && (
                    <>
                      <button
                        data-testid="dl-open-btn"
                        title={t.dlOpen}
                        onClick={() => onOpen(targetPath)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-silver hover:bg-panel2 hover:text-fg"
                      ><IconFolderOpen size={13} /></button>
                      <button
                        data-testid="dl-reveal-btn"
                        title={t.dlReveal}
                        onClick={() => onReveal(targetPath)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-silver hover:bg-panel2 hover:text-fg"
                      ><IconSearch size={13} /></button>
                    </>
                  )}
                  <button
                    data-testid="dl-cancel-btn"
                    title={t.dlCancel}
                    onClick={() => onCancel(d.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-400 hover:bg-panel2"
                  ><IconX size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!collapsed && <div onMouseDown={onResizeStart} className="h-1 shrink-0 cursor-row-resize bg-line/60 hover:bg-accent" />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildRowMenu(menu.item)} onClose={() => setMenu(null)} />}
      {detailsItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onMouseDown={() => setDetailsItem(null)}>
          <div
            data-testid="download-details-dialog"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[460px] max-w-[95vw] rounded-xl border border-line bg-panel p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-medium text-fg">{detailsItem.fileName}</h2>
              <button type="button" onClick={() => setDetailsItem(null)} className="rounded-lg px-2 py-1 text-xs text-silver hover:bg-panel2">✕</button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-line bg-bg p-2.5">
                <div className="text-muted">{t.downloadSource}</div>
                <div className="mt-1 break-all font-mono text-fg select-all" dir="ltr">{detailsItem.url}</div>
              </div>
              <div className="rounded-lg border border-line bg-bg p-2.5">
                <div className="text-muted">{t.dlDestination}</div>
                <div className="mt-1 break-all font-mono text-fg select-all" dir="ltr">
                  {detailsItem.filePath || `${detailsItem.destination}\\${detailsItem.fileName}`}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(detailsItem.url); }}
                className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs text-fg hover:border-silver"
              >{t.copyDownloadUrl}</button>
              <button
                type="button"
                onClick={() => setDetailsItem(null)}
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-accentfg hover:opacity-90"
              >{t.close}</button>
            </div>
          </div>
        </div>
      )}
      {noteEditItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onMouseDown={() => setNoteEditItem(null)}>
          <div
            data-testid="dl-note-dialog"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[420px] max-w-[95vw] rounded-xl border border-line bg-panel p-4 shadow-2xl space-y-3"
          >
            <div className="text-sm font-medium text-fg">{t.dlNote}: {noteEditItem.fileName}</div>
            <input
              data-testid="dl-note-input"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSetNote?.(noteEditItem.id, noteDraft);
                  setNoteEditItem(null);
                }
              }}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-fg outline-none focus:border-silver"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNoteEditItem(null)} className="rounded-lg px-3 py-1.5 text-xs text-silver hover:bg-panel2">{t.cancel}</button>
              <button
                type="button"
                data-testid="dl-note-save"
                onClick={() => { onSetNote?.(noteEditItem.id, noteDraft); setNoteEditItem(null); }}
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-accentfg hover:opacity-90"
              >{t.save}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
