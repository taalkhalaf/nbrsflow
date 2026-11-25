import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dict } from '../i18n';
import type { FolderNode, ItemMeta, NbrsAPI } from '../types';

export interface CommandPaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  api: NbrsAPI | undefined;
  t: Dict;
  root: string;
  metaMap: Record<string, ItemMeta>;
  actions: CommandPaletteAction[];
  onNavigate: (folderPath: string) => void;
  onClose: () => void;
}

interface PaletteEntry {
  id: string;
  kind: 'action' | 'folder';
  label: string;
  sub?: string;
  searchKey: string;
  run: () => void;
}

function flattenFolders(nodes: FolderNode[], out: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flattenFolders(n.children, out);
  }
  return out;
}

export default function CommandPalette({ api, t, root, metaMap, actions, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (!api || !root) return;
    let cancel = false;
    api.files.getFolderTree(root, 2)
      .then((tree) => { if (!cancel) setFolders(flattenFolders(tree)); })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, [api, root]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const list: PaletteEntry[] = [
      ...actions.map((a) => ({
        id: `act:${a.id}`,
        kind: 'action' as const,
        label: a.label,
        sub: a.hint,
        searchKey: `${a.label} ${a.hint ?? ''}`.toLowerCase(),
        run: a.run
      })),
      ...folders.map((f) => {
        const aliases = metaMap[f.path.toLowerCase()]?.aliases ?? [];
        return {
          id: `dir:${f.path}`,
          kind: 'folder' as const,
          label: f.name,
          sub: aliases.length > 0 ? aliases.join(' · ') : undefined,
          searchKey: `${f.name} ${aliases.join(' ')}`.toLowerCase(),
          run: () => onNavigate(f.path)
        };
      })
    ];
    if (!q) return list.slice(0, 30);
    return list.filter((e) => e.searchKey.includes(q)).slice(0, 30);
  }, [actions, folders, metaMap, query, onNavigate]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const execute = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onClose();
    entry.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (entries.length ? (i + 1) % entries.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(entries[activeIdx]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-20" onMouseDown={onClose}>
      <div
        data-testid="command-palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-[540px] max-w-[94vw] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="text-sm text-muted">⌘</span>
          <input
            ref={inputRef}
            data-testid="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.commandPalettePlaceholder}
            className="w-full bg-transparent text-sm text-fg placeholder:text-muted outline-none"
          />
          <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
        </div>

        <div data-testid="command-palette-list" className="max-h-[340px] overflow-auto p-1.5">
          {entries.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">{t.commandPaletteEmpty}</div>
          ) : (
            entries.map((entry, idx) => (
              <button
                key={entry.id}
                type="button"
                data-testid={`command-palette-item-${idx}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => execute(entry)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors ${
                  idx === activeIdx ? 'bg-panel2 text-fg' : 'text-silver hover:bg-panel2/60'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span>{entry.kind === 'folder' ? '📁' : '⚡'}</span>
                  <span className="truncate font-medium">{entry.label}</span>
                  {entry.sub && (
                    <span className="truncate text-xs text-muted">{entry.sub}</span>
                  )}
                </div>
                <span className="shrink-0 rounded border border-line/70 bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                  {entry.kind === 'folder' ? t.commandPaletteFolder : t.commandPaletteAction}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
