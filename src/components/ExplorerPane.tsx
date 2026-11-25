import { useEffect, useMemo, useRef, useState } from 'react';
import type { FileEntry, FolderIndicator, NbrsAPI } from '../types';
import { PRESET_FOLDER_TAGS } from '../types/metadata';
import type { Dict, Lang } from '../i18n';
import {
  breadcrumbs, canDropOn, endDrag, fileIcon, formatBytes, formatDate, getDragging, hasDrag, matchesType, parentOf,
  readDrag, samePath, startDrag, type TypeFilter
} from '../lib/utils';
import { colorHex } from '../lib/palette';
import ContextMenu, { type MenuEntry } from './ContextMenu';
import FolderIcon from './FolderIcon';
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconColumns,
  IconCopyCheck,
  IconFolderPlus,
  IconGrid,
  IconLayers,
  IconList,
  IconMonitor,
  IconPalette,
  IconSparkles
} from './Icons';
import { useHoverCard } from './HoverCard';
import { useMeta } from '../lib/meta';

export type ActionKind = 'open' | 'rename' | 'move' | 'delete' | 'extract' | 'reveal';

interface Props {
  api: NbrsAPI | undefined;
  root: string;
  path: string;
  active: boolean;
  view: 'grid' | 'list';
  search: string;
  typeFilter: TypeFilter;
  lang: Lang;
  t: Dict;
  refreshKey: number;
  canBack: boolean;
  canForward: boolean;
  autoOrganize?: boolean;
  dragDropEnabled?: boolean;
  highlightDuplicates?: boolean;
  dual?: boolean;
  autoColor?: boolean;
  showExplorerToolbar?: boolean;
  otherPaneEntries?: FileEntry[];
  onEntriesLoaded?: (entries: FileEntry[]) => void;
  onQuickPreview?: (filePath: string) => void;
  onBatchRename?: (entries: FileEntry[]) => void;
  onNewFolder?: (targetDir: string) => void;
  onToggleAutoOrganize?: () => void;
  onToggleView?: () => void;
  onToggleDual?: () => void;
  onToggleDuplicates?: () => void;
  onOrganizeNow?: () => void;
  onToggleAutoColor?: () => void;
  onOpenThisPc?: () => void;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onCopyPath: (p: string) => void;
  onActivate: () => void;
  onNavigate: (p: string) => void;
  onStats: (visible: number, selected: number) => void;
  onAction: (kind: ActionKind, paths: string[]) => void;
  onDropItems: (paths: string[], target: string) => void;
}

const PANE = '__pane__';

const folderSizeCache = new Map<string, { size: number; modifiedMs: number }>();
const folderIndicatorCache = new Map<string, { info: FolderIndicator; modifiedMs: number }>();

function invalidateFolderSizeCache(changedPaths?: string[]): void {
  if (!changedPaths) {
    folderSizeCache.clear();
    folderIndicatorCache.clear();
    return;
  }
  if (changedPaths.length === 0) return;
  for (const raw of changedPaths) {
    const cp = raw.toLowerCase();
    for (const key of folderSizeCache.keys()) {
      if (cp === key || cp.startsWith(key + '\\') || cp.startsWith(key + '/')) {
        folderSizeCache.delete(key);
      }
    }
    for (const key of folderIndicatorCache.keys()) {
      if (cp === key || cp.startsWith(key + '\\') || cp.startsWith(key + '/')) {
        folderIndicatorCache.delete(key);
      }
    }
  }
}

export default function ExplorerPane(p: Props) {
  const { api, root, path, view, search, typeFilter, lang, t, refreshKey } = p;
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [folderIndicators, setFolderIndicators] = useState<Record<string, FolderIndicator>>({});
  const [err, setErr] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; targets: FileEntry[] } | null>(null);
  const meta = useMeta();
  const hover = useHoverCard(350);
  const scrollRef = useRef<HTMLDivElement>(null);
  const justFinishedMarqueeRef = useRef(false);
  const typeJumpRef = useRef<{ ch: string; idx: number; ts: number }>({ ch: '', idx: -1, ts: 0 });
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ width: 720, height: 520 });

  useEffect(() => {
    setSelected(new Set());
    setSizes({});
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [path]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateSize = () => {
      setViewport((prev) => (prev.width === el.clientWidth && prev.height === el.clientHeight
        ? prev
        : { width: el.clientWidth, height: el.clientHeight }));
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancel = false;
    if (!api || !path) { setEntries([]); return; }
    api.files.listDirectory(path)
      .then((e) => {
        if (cancel) return;
        setEntries(e); setErr('');
        p.onEntriesLoaded?.(e);
        const names = new Set(e.map((x) => x.path));
        setSelected((prev) => { const n = new Set([...prev].filter((x) => names.has(x))); return n.size === prev.size ? prev : n; });
      })
      .catch((e: Error) => {
        if (cancel) return;
        setEntries([]); setErr(e.message);
        if (root && !samePath(path, root)) p.onNavigate(parentOf(path)); // current folder vanished
      });
    return () => { cancel = true; };
  }, [api, path, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api) return;
    return api.files.onChanged((changedPaths) => {
      invalidateFolderSizeCache(changedPaths);
    });
  }, [api]);

  // Real folder sizes, computed in the background with selective cache invalidation.
  useEffect(() => {
    if (!api) return;
    let cancel = false;
    const dirs = entries.filter((x) => x.isDirectory);
    const cachedSizes: Record<string, number> = {};
    const toCompute: FileEntry[] = [];
    for (const f of dirs) {
      const cached = folderSizeCache.get(f.path.toLowerCase());
      if (cached && cached.modifiedMs === f.modifiedMs) {
        cachedSizes[f.path] = cached.size;
      } else {
        toCompute.push(f);
      }
    }
    if (Object.keys(cachedSizes).length > 0) {
      setSizes((prev) => ({ ...prev, ...cachedSizes }));
    }
    if (toCompute.length === 0) return;
    (async () => {
      for (const f of toCompute) {
        try {
          const s = await api.files.calculateFolderSize(f.path);
          if (cancel) return;
          folderSizeCache.set(f.path.toLowerCase(), { size: s, modifiedMs: f.modifiedMs });
          setSizes((prev) => (prev[f.path] === s ? prev : { ...prev, [f.path]: s }));
        } catch { /* ignore */ }
      }
    })();
    return () => { cancel = true; };
  }, [api, entries]);

  // Folder duplicate indicators, computed in background with selective cache.
  useEffect(() => {
    if (!api?.files.inspectFolderIndicators) return;
    let cancel = false;
    const dirs = entries.filter((x) => x.isDirectory);
    if (dirs.length === 0) { setFolderIndicators({}); return; }
    const cached: Record<string, FolderIndicator> = {};
    const toScan: string[] = [];
    const dirMap = new Map<string, FileEntry>();
    for (const d of dirs) {
      const k = d.path.toLowerCase();
      dirMap.set(k, d);
      const c = folderIndicatorCache.get(k);
      if (c && c.modifiedMs === d.modifiedMs) cached[k] = c.info;
      else toScan.push(d.path);
    }
    if (Object.keys(cached).length > 0) setFolderIndicators(cached);
    if (toScan.length === 0) return;
    api.files.inspectFolderIndicators(toScan)
      .then((res) => {
        if (cancel) return;
        for (const [k, info] of Object.entries(res)) {
          const d = dirMap.get(k);
          if (d) folderIndicatorCache.set(k, { info, modifiedMs: d.modifiedMs });
        }
        setFolderIndicators((prev) => ({ ...prev, ...res }));
      })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, [api, entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) =>
        matchesType(e, typeFilter) &&
        (!q ||
          e.name.toLowerCase().includes(q) ||
          (meta.metaOf(e.path)?.summary ?? '').toLowerCase().includes(q) ||
          (meta.metaOf(e.path)?.aliases ?? []).some((a) => a.toLowerCase().includes(q)))
      )
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [entries, search, typeFilter, meta]);

  // Ask for content-based color suggestions for the folders shown (only does work when auto-color is on).
  useEffect(() => { meta.requestAuto(entries.filter((x) => x.isDirectory).map((x) => x.path)); }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (p.active) p.onStats(visible.length, selected.size); }, [p.active, visible.length, selected.size]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEntries = () => visible.filter((f) => selected.has(f.path));

  const click = (e: React.MouseEvent, f: FileEntry) => {
    p.onActivate();
    setSelected((prev) => {
      const next = new Set(e.ctrlKey || e.metaKey ? prev : []);
      if (e.ctrlKey || e.metaKey) { if (next.has(f.path)) next.delete(f.path); else next.add(f.path); }
      else next.add(f.path);
      return next;
    });
  };
  const open = (f: FileEntry) => { if (f.isDirectory) p.onNavigate(f.path); else p.onAction('open', [f.path]); };

  const startMarquee = (e: React.MouseEvent) => {
    if (e.button !== 0 || !scrollRef.current) return;
    if ((e.target as HTMLElement).closest('[data-explorer-item="true"], button, input, a, thead')) return;
    p.onActivate();
    const container = scrollRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    const additive = e.ctrlKey || e.metaKey;
    const baseSel = additive ? new Set(selected) : new Set<string>();
    let active = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!active && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      active = true;
      const rect = container.getBoundingClientRect();
      const vx1 = Math.min(startX, ev.clientX);
      const vy1 = Math.min(startY, ev.clientY);
      const vx2 = Math.max(startX, ev.clientX);
      const vy2 = Math.max(startY, ev.clientY);
      setMarquee({
        left: vx1 - rect.left + container.scrollLeft,
        top: vy1 - rect.top + container.scrollTop,
        width: vx2 - vx1,
        height: vy2 - vy1
      });
      const next = new Set(baseSel);
      const els = container.querySelectorAll<HTMLElement>('[data-explorer-item="true"]');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.right >= vx1 && r.left <= vx2 && r.bottom >= vy1 && r.top <= vy2) {
          const itemPath = el.dataset.itemPath;
          if (itemPath) next.add(itemPath);
        }
      }
      setSelected(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (active) {
        justFinishedMarqueeRef.current = true;
        setMarquee(null);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
    const sel = selectedEntries();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(visible.map((f) => f.path))); }
    else if (e.key === 'F2' && sel.length === 1) { e.preventDefault(); p.onAction('rename', [sel[0].path]); }
    else if (e.key === ' ' && sel.length === 1 && !sel[0].isDirectory) { e.preventDefault(); p.onQuickPreview?.(sel[0].path); }
    else if (e.key === 'Delete' && sel.length) { e.preventDefault(); p.onAction('delete', sel.map((f) => f.path)); }
    else if (e.key === 'Enter' && sel.length === 1) { e.preventDefault(); open(sel[0]); }
    else if (e.key === 'Backspace') { e.preventDefault(); p.onUp(); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); if (p.canBack) p.onBack(); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); if (p.canForward) p.onForward(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ' && visible.length > 0) {
      const normFirst = (s: string) => s.trim().charAt(0).toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
      const ch = normFirst(e.key);
      if (!ch || !/[\p{L}\p{N}]/u.test(ch)) return;
      const matches = visible
        .map((f, idx) => ({ f, idx }))
        .filter(({ f }) => normFirst(f.name) === ch);
      if (matches.length === 0) return;
      e.preventDefault();
      const now = Date.now();
      const curSelIdx = sel.length === 1 ? visible.findIndex((x) => x.path === sel[0].path) : -1;
      let nextMatch = matches[0];
      if (typeJumpRef.current.ch === ch && now - typeJumpRef.current.ts < 3000) {
        const anchor = curSelIdx >= 0 ? curSelIdx : typeJumpRef.current.idx;
        nextMatch = matches.find((m) => m.idx > anchor) ?? matches[0];
      }
      typeJumpRef.current = { ch, idx: nextMatch.idx, ts: now };
      setSelected(new Set([nextMatch.f.path]));
      scrollRef.current?.querySelector<HTMLElement>(`[data-item-path="${CSS.escape(nextMatch.f.path)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  const onContext = (e: React.MouseEvent, f: FileEntry) => {
    e.preventDefault(); e.stopPropagation();
    p.onActivate();
    let targets = selectedEntries();
    if (!selected.has(f.path)) { targets = [f]; setSelected(new Set([f.path])); }
    setMenu({ x: e.clientX, y: e.clientY, targets });
  };

  const menuItems = (targets: FileEntry[]): MenuEntry[] => {
    const one = targets.length === 1 ? targets[0] : null;
    const paths = targets.map((x) => x.path);
    const items: MenuEntry[] = [];
    if (one) items.push({ label: t.open, hint: 'Enter', onClick: () => open(one) });
    if (one && !one.isDirectory && p.onQuickPreview) {
      items.push({ label: t.quickPreview, hint: 'Space', onClick: () => p.onQuickPreview?.(one.path) });
    }
    items.push({ label: t.moveTo, onClick: () => p.onAction('move', paths) });
    if (one) items.push({ label: t.rename, hint: 'F2', onClick: () => p.onAction('rename', paths) });
    if (targets.length >= 2 && p.onBatchRename) {
      items.push({ label: t.batchRenameTitle, onClick: () => p.onBatchRename?.(targets) });
    }
    if (one && one.extension === '.zip') items.push({ label: t.extractHere, onClick: () => p.onAction('extract', paths) });
    if (one) items.push({ label: t.reveal, onClick: () => p.onAction('reveal', paths) });
    if (targets.every((x) => x.isDirectory)) {
      items.push('sep', {
        kind: 'colors', label: t.folderColor, defaultLabel: t.colorDefault, autoLabel: t.colorAuto, names: t.colors,
        current: one ? meta.metaOf(one.path)?.color : undefined,
        onPick: (c) => meta.setColor(paths, c)
      }, {
        kind: 'tags',
        label: t.folderTags,
        presets: PRESET_FOLDER_TAGS,
        clearLabel: t.tagClear,
        customPlaceholder: t.tagCustomPlaceholder,
        setLabel: t.tagSet,
        current: one ? meta.metaOf(one.path)?.tag : undefined,
        onPick: (tag) => meta.setTag(paths, tag)
      });
    }
    if (one) items.push({ label: t.editSummary, onClick: () => meta.editSummary(one.path) });
    if (one && one.isDirectory) items.push({ label: t.manageAliases, onClick: () => meta.editAliases(one.path) });
    if (one && !one.isDirectory) {
      const m = meta.metaOf(one.path);
      items.push(
        { label: t.verifyChecksum, onClick: () => meta.verifyChecksum(one.path) },
        m?.openedAt
          ? { label: t.resetAsNew, onClick: () => meta.resetAsNew(one.path) }
          : { label: t.markWatched, onClick: () => meta.markOpened(one.path) }
      );
    }
    items.push('sep', { label: t.deleteToTrash, hint: 'Delete', danger: true, onClick: () => p.onAction('delete', paths) });
    return items;
  };

  // ---- drag & drop ----
  const dragStart = (e: React.DragEvent, f: FileEntry) => {
    const paths = selected.has(f.path) ? selectedEntries().map((x) => x.path) : [f.path];
    if (!selected.has(f.path)) setSelected(new Set([f.path]));
    startDrag(e, paths);
  };
  const dragOverTarget = (e: React.DragEvent, target: string, key: string) => {
    if (!hasDrag(e)) return;
    if (!canDropOn(getDragging(), target)) { setDropTarget((d) => (d === key ? null : d)); return; }
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(key);
  };
  const dragLeave = (e: React.DragEvent, key: string) => {
    if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setDropTarget((d) => (d === key ? null : d));
  };
  const drop = (e: React.DragEvent, target: string) => {
    if (!hasDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    setDropTarget(null);
    const paths = readDrag(e);
    endDrag();
    if (canDropOn(paths, target)) p.onDropItems(paths, target);
  };

  const hoverProps = (f: FileEntry) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      const s = meta.metaOf(f.path)?.summary;
      hover.onEnter(e, s ? { name: f.name, summary: s, isDirectory: f.isDirectory, size: sizeText(f), modified: formatDate(f.modifiedMs, lang) } : null);
    },
    onMouseLeave: hover.onLeave,
    onMouseDown: hover.onLeave
  });
  const icon = (f: FileEntry, cls: string) => f.isDirectory
    ? <FolderIcon color={meta.colorOf(f.path)} tag={cls.includes('h-10') ? meta.metaOf(f.path)?.tag : undefined} className={cls} />
    : <span className={cls === 'h-10 w-10' ? 'text-4xl' : ''}>{fileIcon(f)}</span>;
  const noteDot = (f: FileEntry) => meta.metaOf(f.path)?.summary
    ? <span title={t.hasSummary} data-testid="note-indicator" className="text-[11px] leading-none text-silver">🗒</span> : null;
  const colorDot = (f: FileEntry) => { const c = f.isDirectory ? meta.colorOf(f.path) : undefined; return c ? <span data-testid="color-badge" className="h-2 w-2 rounded-full" style={{ background: colorHex(c) }} /> : null; };

  const lastOpenedRel = meta.metaOf(path)?.lastOpenedChildRelPath;
  const lastOpenedAbs = lastOpenedRel && root ? `${root.replace(/[\\/]+$/, '')}\\${lastOpenedRel}`.toLowerCase() : '';
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const duplicatePaths = useMemo(() => {
    const dups = new Set<string>();
    if (!p.highlightDuplicates) return dups;
    const all = [...entries, ...(p.otherPaneEntries ?? [])];
    const byName = new Map<string, string[]>();
    const bySize = new Map<number, string[]>();
    for (const item of all) {
      const nameKey = item.name.toLowerCase();
      const arrN = byName.get(nameKey) ?? [];
      if (!arrN.includes(item.path)) arrN.push(item.path);
      byName.set(nameKey, arrN);
      if (!item.isDirectory && item.size > 0) {
        const arrS = bySize.get(item.size) ?? [];
        if (!arrS.includes(item.path)) arrS.push(item.path);
        bySize.set(item.size, arrS);
      }
    }
    for (const list of byName.values()) { if (list.length > 1) list.forEach((x) => dups.add(x)); }
    for (const list of bySize.values()) { if (list.length > 1) list.forEach((x) => dups.add(x)); }
    return dups;
  }, [p.highlightDuplicates, entries, p.otherPaneEntries]);

  const statusBadge = (f: FileEntry) => {
    if (duplicatePaths.has(f.path)) {
      return (
        <span data-testid="duplicate-badge" className="rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
          ♊ {t.duplicateBadge}
        </span>
      );
    }
    if (f.isDirectory) {
      const ind = folderIndicators[f.path.toLowerCase()];
      const hasDup = !!ind?.hasDuplicates;
      const isComplete = !!ind?.isComplete;
      const hasNew = (meta.metaOf(f.path)?.unopenedFiles?.length ?? 0) > 0;
      if (!hasDup && !hasNew && !isComplete) return null;
      return (
        <span className="inline-flex flex-wrap items-center justify-center gap-1">
          {isComplete && (
            <span
              data-testid="folder-complete-badge"
              title={ind?.totalEpisodes ? `${t.seriesCompleteTip} (${ind.totalEpisodes})` : t.seriesCompleteTip}
              className="rounded-md border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-300"
            >{t.seriesCompleteBadge}</span>
          )}
          {hasNew && (
            <span
              data-testid="folder-updated-badge"
              title={t.folderHasNewFileTip}
              className="rounded-md border border-sky-500/45 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-300"
            >{t.folderUpdatedBadge}</span>
          )}
          {hasDup && (
            <span
              data-testid="folder-duplicate-badge"
              title={ind?.duplicateReason ? `${t.folderHasDuplicatesTip}: ${ind.duplicateReason}` : t.folderHasDuplicatesTip}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-500/60 bg-amber-500/20 text-[10px] font-bold leading-none text-amber-300"
            >!</span>
          )}
        </span>
      );
    }
    const m = meta.metaOf(f.path);
    if (lastOpenedAbs && f.path.toLowerCase() === lastOpenedAbs) {
      return (
        <span data-testid="badge-last-opened" className="rounded-md border border-silver/40 bg-panel2 px-1.5 py-0.5 text-[10px] font-medium text-fg">
          {t.badgeLastOpened}
        </span>
      );
    }
    if (!m?.openedAt && Date.now() - f.modifiedMs < SEVEN_DAYS) {
      return (
        <span data-testid="badge-new" className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-silver">
          {t.badgeNew}
        </span>
      );
    }
    return null;
  };

  const itemCls = (f: FileEntry) =>
    dropTarget === f.path ? 'bg-panel2 ring-1 ring-silver'
    : selected.has(f.path) ? 'bg-panel2 ring-1 ring-silver/60' : 'hover:bg-panel';
  const dragEnabled = p.dragDropEnabled !== false;
  const dnd = (f: FileEntry) => dragEnabled ? ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { hover.onLeave(); dragStart(e, f); },
    onDragEnd: () => { endDrag(); setDropTarget(null); },
    ...(f.isDirectory ? {
      onDragOver: (e: React.DragEvent) => dragOverTarget(e, f.path, f.path),
      onDragLeave: (e: React.DragEvent) => dragLeave(e, f.path),
      onDrop: (e: React.DragEvent) => drop(e, f.path)
    } : {})
  }) : {};
  const sizeText = (f: FileEntry) => f.isDirectory ? (sizes[f.path] === undefined ? '…' : formatBytes(sizes[f.path])) : formatBytes(f.size);

  const crumbs = breadcrumbs(root, path);
  const canUp = Boolean(root && path && !samePath(path, root));
  const navBtn = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs text-silver hover:bg-panel2 hover:text-fg disabled:opacity-30 disabled:pointer-events-none';

  const VIRTUALIZE_THRESHOLD = 60;
  const isVirtualized = visible.length > VIRTUALIZE_THRESHOLD;
  const LIST_ROW_H = 34;
  const GRID_ROW_H = 122;
  const gridCols = Math.max(1, Math.floor((Math.max(240, viewport.width) - 24 + 8) / (110 + 8)));

  let gridStartIdx = 0;
  let gridEndIdx = visible.length;
  let gridPadTop = 0;
  let gridPadBottom = 0;
  if (isVirtualized && view === 'grid') {
    const totalRows = Math.ceil(visible.length / gridCols);
    const startRow = Math.max(0, Math.floor(scrollTop / GRID_ROW_H) - 3);
    const visRows = Math.ceil(Math.max(200, viewport.height) / GRID_ROW_H) + 6;
    const endRow = Math.min(totalRows, startRow + visRows);
    gridStartIdx = startRow * gridCols;
    gridEndIdx = Math.min(visible.length, endRow * gridCols);
    gridPadTop = startRow * GRID_ROW_H;
    gridPadBottom = Math.max(0, (totalRows - endRow) * GRID_ROW_H);
  }

  let listStartIdx = 0;
  let listEndIdx = visible.length;
  let listPadTop = 0;
  let listPadBottom = 0;
  if (isVirtualized && view === 'list') {
    listStartIdx = Math.max(0, Math.floor(scrollTop / LIST_ROW_H) - 8);
    const visCount = Math.ceil(Math.max(200, viewport.height) / LIST_ROW_H) + 16;
    listEndIdx = Math.min(visible.length, listStartIdx + visCount);
    listPadTop = listStartIdx * LIST_ROW_H;
    listPadBottom = Math.max(0, (visible.length - listEndIdx) * LIST_ROW_H);
  }

  const renderedGridItems = isVirtualized && view === 'grid' ? visible.slice(gridStartIdx, gridEndIdx) : visible;
  const renderedListItems = isVirtualized && view === 'list' ? visible.slice(listStartIdx, listEndIdx) : visible;

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={p.onActivate}
      onMouseUp={(e) => {
        if (e.button === 3 && p.canBack) { e.preventDefault(); p.onBack(); }
        else if (e.button === 4 && p.canForward) { e.preventDefault(); p.onForward(); }
      }}
      onDragOver={(e) => dragOverTarget(e, path, PANE)}
      onDragLeave={(e) => dragLeave(e, PANE)}
      onDrop={(e) => drop(e, path)}
      className={`relative flex h-full min-w-0 flex-1 flex-col bg-bg outline-none ${p.active ? 'ring-1 ring-inset ring-line' : ''} ${dropTarget === PANE ? 'ring-1 ring-inset ring-silver' : ''}`}
    >
      <div data-testid="pane-nav" className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
        <button data-testid="pane-back" disabled={!p.canBack} onClick={p.onBack} title={t.navBack} className={navBtn}>
          <IconArrowLeft size={14} className="rtl:rotate-180" />
        </button>
        <button data-testid="pane-forward" disabled={!p.canForward} onClick={p.onForward} title={t.navForward} className={navBtn}>
          <IconArrowRight size={14} className="rtl:rotate-180" />
        </button>
        <button data-testid="pane-up" disabled={!canUp} onClick={p.onUp} title={t.navUp} className={navBtn}>
          <IconArrowUp size={14} />
        </button>

        {p.onNewFolder && (
          <button
            type="button"
            data-testid="pane-new-folder-btn"
            onClick={() => p.onNewFolder?.(path)}
            title={t.newFolder}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-transparent px-2 text-xs text-silver transition-colors hover:bg-panel2 hover:text-fg"
          >
            <IconFolderPlus size={14} />
            <span className="hidden xl:inline">{t.newFolder}</span>
          </button>
        )}

        {p.onToggleAutoOrganize && (
          <button
            type="button"
            data-testid="autoorganize-toggle"
            onClick={p.onToggleAutoOrganize}
            title={t.autoOrganizeTip}
            className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
              p.autoOrganize
                ? 'border-line bg-panel2 font-medium text-fg'
                : 'border-transparent text-silver hover:bg-panel2 hover:text-fg'
            }`}
          >
            <IconLayers size={14} />
            <span className="hidden xl:inline">{t.autoOrganize}</span>
          </button>
        )}

        <nav data-testid="pane-breadcrumb" className="mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-md border border-line bg-bg px-2 py-0.5 text-xs" dir="ltr">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span className="text-muted">/</span>}
              <button
                onClick={() => p.onNavigate(c.path)}
                className={`truncate rounded px-1 py-0.5 hover:bg-panel2 ${i === crumbs.length - 1 ? 'font-medium text-fg' : 'text-muted'}`}
              >
                {i === 0 ? `⬇️ ${c.name || t.downloads}` : c.name}
              </button>
            </span>
          ))}
        </nav>

        <button data-testid="pane-copy-path" onClick={() => p.onCopyPath(path)} title={t.copyPath} className={navBtn}>⎘</button>

        {p.showExplorerToolbar && (
          <div data-testid="explorer-tools" className="ms-1 flex shrink-0 items-center gap-0.5 border-s border-line ps-1.5">
            {p.onOpenThisPc && (
              <button
                type="button"
                data-testid="this-pc-btn"
                onClick={p.onOpenThisPc}
                title={t.thisPcTip}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-transparent px-2 text-xs text-silver transition-colors hover:bg-panel2 hover:text-fg"
              >
                <IconMonitor size={14} />
                <span className="hidden lg:inline">{t.thisPc}</span>
              </button>
            )}
            {p.onToggleAutoColor && (
              <button
                type="button"
                data-testid="autocolor-toggle"
                onClick={p.onToggleAutoColor}
                title={t.autoColorTip}
                className={`${navBtn} ${p.autoColor ? 'bg-panel2 text-fg ring-1 ring-line' : ''}`}
              >
                <IconPalette size={14} />
              </button>
            )}
            {p.onOrganizeNow && (
              <button
                type="button"
                data-testid="organize-now-btn"
                onClick={p.onOrganizeNow}
                title={t.organizeNowTip}
                className={navBtn}
              >
                <IconSparkles size={14} />
              </button>
            )}
            {p.onToggleDuplicates && (
              <button
                type="button"
                data-testid="compare-duplicates-btn"
                onClick={p.onToggleDuplicates}
                title={t.compareDuplicates}
                className={`${navBtn} ${p.highlightDuplicates ? 'bg-panel2 text-fg ring-1 ring-line' : ''}`}
              >
                <IconCopyCheck size={14} />
              </button>
            )}
            {p.onToggleDual && (
              <button
                type="button"
                data-testid="dual-pane-toggle"
                onClick={p.onToggleDual}
                title={t.dualPane}
                className={`${navBtn} ${p.dual ? 'bg-panel2 text-fg ring-1 ring-line' : ''}`}
              >
                <IconColumns size={14} />
              </button>
            )}
            {p.onToggleView && (
              <button
                type="button"
                data-testid="view-toggle-btn"
                onClick={p.onToggleView}
                title={view === 'grid' ? t.listView : t.gridView}
                className={navBtn}
              >
                {view === 'grid' ? <IconList size={14} /> : <IconGrid size={14} />}
              </button>
            )}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        data-testid="pane-items"
        data-virtualized={isVirtualized ? 'true' : 'false'}
        data-total-count={visible.length}
        onMouseDown={startMarquee}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="relative flex min-h-0 flex-1 flex-col overflow-auto select-none"
        onClick={(e) => {
          if (justFinishedMarqueeRef.current) { justFinishedMarqueeRef.current = false; return; }
          if (e.target === e.currentTarget) setSelected(new Set());
        }}
      >
      {marquee && (
        <div
          data-testid="marquee-box"
          className="pointer-events-none absolute z-20 rounded-sm border border-silver/80 bg-silver/15"
          style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
        />
      )}
      {dropTarget === PANE && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full border border-line bg-panel2 px-4 py-1 text-xs text-fg shadow-lg">{t.dropHere}</div>
      )}
      {err && <div className="m-3 rounded-lg bg-rose-500/15 p-3 text-sm text-rose-400">{t.error}: {err}</div>}
      {!err && visible.length === 0 && (
        <div className="m-auto text-sm text-muted">{entries.length === 0 ? t.emptyFolder : t.noMatches}</div>
      )}

      {visible.length > 0 && view === 'grid' && (
        <div
          className="grid gap-2 p-3"
          style={{
            gridTemplateColumns: isVirtualized ? `repeat(${gridCols}, minmax(110px, 1fr))` : 'repeat(auto-fill, minmax(110px, 1fr))',
            paddingTop: `${12 + gridPadTop}px`,
            paddingBottom: `${12 + gridPadBottom}px`
          }}
          onClick={(e) => {
            if (justFinishedMarqueeRef.current) { justFinishedMarqueeRef.current = false; return; }
            if (e.target === e.currentTarget) setSelected(new Set());
          }}
        >
          {renderedGridItems.map((f) => (
            <button key={f.path} data-explorer-item="true" data-item-path={f.path} title={f.name} onClick={(e) => click(e, f)} onDoubleClick={() => open(f)} onContextMenu={(e) => onContext(e, f)}
              {...dnd(f)} {...hoverProps(f)} className={`relative flex flex-col items-center gap-1 rounded-xl p-3 text-center ${itemCls(f)}`}>
              <span className="absolute end-2 top-2 flex items-center gap-1">{colorDot(f)}{noteDot(f)}</span>
              <span className="absolute start-2 top-2">{statusBadge(f)}</span>
              {icon(f, 'h-10 w-10')}
              <span className="line-clamp-2 w-full break-words text-xs">{f.name}</span>
              <span className="text-[10px] text-muted">{sizeText(f)}</span>
            </button>
          ))}
        </div>
      )}

      {visible.length > 0 && view === 'list' && (
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-panel text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t.name}</th>
              <th className="w-24 px-3 py-2 text-start font-medium">{t.size}</th>
              <th className="w-40 px-3 py-2 text-start font-medium">{t.modified}</th>
            </tr>
          </thead>
          <tbody>
            {listPadTop > 0 && <tr aria-hidden="true"><td colSpan={3} style={{ height: `${listPadTop}px`, padding: 0 }} /></tr>}
            {renderedListItems.map((f) => (
              <tr key={f.path} data-explorer-item="true" data-item-path={f.path} onClick={(e) => click(e, f)} onDoubleClick={() => open(f)} onContextMenu={(e) => onContext(e, f)}
                {...dnd(f)} {...hoverProps(f)} className={`cursor-default ${itemCls(f)}`}>
                <td className="px-3 py-1.5"><span className="me-2 inline-flex items-center align-middle">{icon(f, 'h-5 w-5')}</span>{f.name}<span className="ms-2 inline-flex items-center gap-1 align-middle">{statusBadge(f)}{colorDot(f)}{noteDot(f)}</span></td>
                <td className="px-3 py-1.5 text-muted">{sizeText(f)}</td>
                <td className="px-3 py-1.5 text-muted">{formatDate(f.modifiedMs, lang)}</td>
              </tr>
            ))}
            {listPadBottom > 0 && <tr aria-hidden="true"><td colSpan={3} style={{ height: `${listPadBottom}px`, padding: 0 }} /></tr>}
          </tbody>
        </table>
      )}

      {hover.card}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.targets)} onClose={() => setMenu(null)} />}
      </div>
    </div>
  );
}
