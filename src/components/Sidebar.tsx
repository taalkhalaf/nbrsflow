import { useEffect, useState } from 'react';
import type { CategoryDirKey, DiskSpace, FolderNode, NbrsAPI } from '../types';
import { PRESET_FOLDER_TAGS } from '../types/metadata';
import type { Dict } from '../i18n';
import ContextMenu from './ContextMenu';
import FolderIcon from './FolderIcon';
import { useHoverCard } from './HoverCard';
import { useMeta } from '../lib/meta';
import { colorHex } from '../lib/palette';
import { canDropOn, endDrag, formatBytes, getDragging, hasDrag, readDrag, samePath, type TypeFilter } from '../lib/utils';

interface Props {
  api: NbrsAPI | undefined;
  root: string;
  current: string;
  t: Dict;
  typeFilter: TypeFilter;
  refreshKey: number;
  categoryDirs?: Partial<Record<CategoryDirKey, string>>;
  onTypeFilter: (f: TypeFilter) => void;
  onSetCategoryDir?: (key: CategoryDirKey) => void;
  onResetCategoryDir?: (key: CategoryDirKey) => void;
  onOpenCategoryDir?: (key: CategoryDirKey) => void;
  onNavigate: (p: string) => void;
  onDropItems: (paths: string[], target: string) => void;
}

/** Drop-target handlers + highlight flag for a folder row. */
function useDropTarget(target: string, onDrop: (paths: string[], target: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (!hasDrag(e) || !canDropOn(getDragging(), target)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(false); },
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        if (!hasDrag(e)) return;
        e.preventDefault();
        const paths = readDrag(e); endDrag();
        if (canDropOn(paths, target)) onDrop(paths, target);
      }
    }
  };
}

function TreeNode({ node, depth, p, expandedInit }: { node: FolderNode; depth: number; p: Props; expandedInit?: boolean }) {
  const [open, setOpen] = useState(!!expandedInit);
  const [children, setChildren] = useState<FolderNode[] | undefined>(node.children);

  useEffect(() => { setChildren(node.children); }, [node]);
  useEffect(() => {
    if (open && node.hasChildren && p.api) {
      p.api.files.getFolderTree(node.path, 1).then(setChildren).catch(() => setChildren([]));
    }
  }, [open, p.refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCur = samePath(node.path, p.current);
  const dt = useDropTarget(node.path, p.onDropItems);
  const meta = useMeta();
  const hover = useHoverCard(350);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const m = meta.metaOf(node.path);
  const color = meta.colorOf(node.path);

  useEffect(() => { if (children?.length) meta.requestAuto([node.path, ...children.map((c) => c.path)]); }, [children]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div
        style={{ paddingInlineStart: depth * 14 + 6 }}
        className={`flex cursor-default items-center gap-1 rounded-lg py-1 pe-2 text-sm transition-colors duration-150 ${dt.over ? 'bg-panel2 ring-1 ring-silver' : isCur ? 'bg-panel2 font-medium text-fg' : 'text-silver hover:bg-panel2/70 hover:text-fg'}`}
        onClick={() => p.onNavigate(node.path)}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); hover.onLeave(); setMenu({ x: e.clientX, y: e.clientY }); }}
        onMouseEnter={(e) => hover.onEnter(e, m?.summary ? { name: node.name, summary: m.summary, isDirectory: true } : null)}
        onMouseLeave={hover.onLeave}
        onMouseDown={hover.onLeave}
        {...dt.handlers}
      >
        <button
          className={`w-4 text-xs text-muted rtl:rotate-180 ${node.hasChildren ? '' : 'invisible'}`}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >{open ? <span className="inline-block rotate-90 rtl:-rotate-90">▶</span> : '▶'}</button>
        <FolderIcon color={color} className="h-4 w-4 shrink-0" />
        <span className="truncate" title={node.name}>{node.name}</span>
        {color && <span data-testid="tree-color-badge" className="ms-auto h-2 w-2 shrink-0 rounded-full" style={{ background: colorHex(color) }} />}
        {m?.summary && <span title={p.t.hasSummary} data-testid="tree-note-indicator" className={`text-[11px] leading-none text-silver ${color ? '' : 'ms-auto'}`}>🗒</span>}
      </div>
      {hover.card}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: p.t.open, onClick: () => p.onNavigate(node.path) },
          'sep',
          { kind: 'colors', label: p.t.folderColor, defaultLabel: p.t.colorDefault, autoLabel: p.t.colorAuto, names: p.t.colors, current: m?.color, onPick: (c) => meta.setColor([node.path], c) },
          { kind: 'tags', label: p.t.folderTags, presets: PRESET_FOLDER_TAGS, clearLabel: p.t.tagClear, customPlaceholder: p.t.tagCustomPlaceholder, setLabel: p.t.tagSet, current: m?.tag, onPick: (tag) => meta.setTag([node.path], tag) },
          { label: p.t.editSummary, onClick: () => meta.editSummary(node.path) },
          { label: p.t.manageAliases, onClick: () => meta.editAliases(node.path) }
        ]} />
      )}
      {open && children?.map((c) => <TreeNode key={c.path} node={c} depth={depth + 1} p={p} />)}
    </div>
  );
}

export default function Sidebar(p: Props) {
  const { api, root, t } = p;
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [disk, setDisk] = useState<DiskSpace | null>(null);
  const [catMenu, setCatMenu] = useState<{ x: number; y: number; key: CategoryDirKey } | null>(null);

  useEffect(() => {
    if (!api || !root) return;
    api.files.getFolderTree(root, 2).then(setTree).catch(() => setTree([]));
    api.files.getDiskSpace(root).then(setDisk).catch(() => setDisk(null));
  }, [api, root, p.refreshKey]);

  const rootDrop = useDropTarget(root, p.onDropItems);
  const types: [TypeFilter, string, string][] = [
    ['all', t.typeAll, '🗂️'], ['video', t.typeVideo, '🎬'], ['audio', t.typeAudio, '🎵'],
    ['docs', t.typeDocs, '📄'], ['archives', t.typeArchives, '🗜️'], ['apps', t.typeApps, '⚙️']
  ];
  const openCatMenu = (e: React.MouseEvent, key: CategoryDirKey) => {
    e.preventDefault();
    e.stopPropagation();
    setCatMenu({ x: e.clientX, y: e.clientY, key });
  };
  const used = disk && disk.totalBytes > 0 ? Math.min(1, Math.max(0, 1 - disk.freeBytes / disk.totalBytes)) : 0;
  const driveLabel = disk?.path ? (/^[A-Za-z]:/.test(disk.path) ? disk.path.slice(0, 2).toUpperCase() : disk.path) : '—';

  return (
    <aside className="flex w-64 shrink-0 flex-col border-e border-line bg-panel">
      <div className="flex-1 overflow-auto p-2">
        <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{t.quickAccess}</div>
        <div
          data-testid="quick-access-downloads"
          onClick={() => p.onNavigate(root)}
          onContextMenu={(e) => openCatMenu(e, 'downloads')}
          {...rootDrop.handlers}
          title={p.categoryDirs?.downloads || root}
          className={`flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ${rootDrop.over ? 'bg-panel2 ring-1 ring-silver' : samePath(root, p.current) ? 'bg-panel2 font-medium text-fg' : 'text-silver hover:bg-panel2/70 hover:text-fg'}`}
        >
          <span>⬇️ {t.downloads}</span>
          {p.categoryDirs?.downloads && <span data-testid="custom-cat-badge" className="ms-auto h-1.5 w-1.5 rounded-full bg-silver" />}
        </div>
        {types.map(([k, label, icon]) => (
          <div key={k} data-testid={`quick-access-${k}`} onClick={() => p.onTypeFilter(k)} onContextMenu={(e) => openCatMenu(e, k)}
            title={p.categoryDirs?.[k] || label}
            className={`flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ${p.typeFilter === k ? 'bg-panel2 font-medium text-fg' : 'text-silver hover:bg-panel2/70 hover:text-fg'}`}>
            <span>{icon} {label}</span>
            {p.categoryDirs?.[k] && <span data-testid="custom-cat-badge" className="ms-auto h-1.5 w-1.5 rounded-full bg-silver" />}
          </div>
        ))}

        <button
          type="button"
          data-testid="sidebar-folders-home"
          onClick={() => p.onNavigate(root)}
          title={t.downloads}
          className="mt-3 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-start text-[11px] font-medium uppercase tracking-wide text-muted transition-colors hover:bg-panel2/70 hover:text-fg"
        >
          <span>📁</span>
          <span>{t.folders}</span>
        </button>
        {tree.map((n) => <TreeNode key={n.path} node={n} depth={0} p={p} />)}
      </div>

      <div data-testid="sidebar-disk-space" className="border-t border-line p-3 text-xs">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-muted">
          <bdi dir="ltr" className="font-medium text-silver">{driveLabel}</bdi>
          <span className="truncate">
            {disk ? (
              <>
                <bdi dir="ltr">{formatBytes(disk.freeBytes)}</bdi>
                {' '}{t.free}{' '}
                <bdi dir="ltr">{formatBytes(disk.totalBytes)}</bdi>
              </>
            ) : '—'}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg">
          <div className={`h-full rounded-full ${used > 0.9 ? 'bg-rose-500' : 'bg-silver'}`} style={{ width: `${Math.round(used * 100)}%` }} />
        </div>
      </div>
      {catMenu && (
        <ContextMenu
          x={catMenu.x}
          y={catMenu.y}
          onClose={() => setCatMenu(null)}
          items={[
            { label: t.setCategoryFolder, onClick: () => p.onSetCategoryDir?.(catMenu.key) },
            ...(p.categoryDirs?.[catMenu.key]
              ? [{ label: t.resetCategoryFolder, onClick: () => p.onResetCategoryDir?.(catMenu.key) }]
              : []),
            'sep',
            { label: t.openCategoryFolder, onClick: () => p.onOpenCategoryDir?.(catMenu.key) }
          ]}
        />
      )}
    </aside>
  );
}
