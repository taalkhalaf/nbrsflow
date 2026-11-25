import { useEffect, useState } from 'react';
import type { FolderNode, NbrsAPI } from '../types';
import type { Dict } from '../i18n';
import { canDropOn } from '../lib/utils';

interface Props {
  api: NbrsAPI | undefined;
  t: Dict;
  root: string;
  sources: string[];
  onPick: (target: string) => void;
  onClose: () => void;
}

export default function MoveDialog({ api, t, root, sources, onPick, onClose }: Props) {
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [picked, setPicked] = useState<string>('');

  useEffect(() => { api?.files.getFolderTree(root, 4).then(setTree).catch(() => setTree([])); }, [api, root]);

  const row = (name: string, path: string, depth: number) => {
    const allowed = canDropOn(sources, path);
    return (
      <div key={path}
        onClick={() => allowed && setPicked(path)}
        style={{ paddingInlineStart: 8 + depth * 16 }}
        className={`rounded-md py-1 pe-2 text-sm ${!allowed ? 'cursor-not-allowed opacity-40' : picked === path ? 'bg-accent/30' : 'cursor-default hover:bg-panel2'}`}>
        📁 {name}
      </div>
    );
  };
  const walk = (nodes: FolderNode[], depth: number): React.ReactNode =>
    nodes.map((n) => <div key={n.path}>{row(n.name, n.path, depth)}{n.children && walk(n.children, depth + 1)}</div>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[70vh] w-[440px] flex-col rounded-xl border border-line bg-panel p-5 shadow-2xl">
        <h2 className="mb-3 text-base font-medium text-fg">{t.moveTitle}</h2>
        <div className="min-h-[160px] flex-1 overflow-auto rounded-lg border border-line bg-bg p-1">
          {row(t.rootFolder, root, 0)}
          {walk(tree, 1)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-1.5 text-sm text-silver hover:bg-panel2">{t.cancel}</button>
          <button disabled={!picked} onClick={() => onPick(picked)} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accentfg hover:opacity-90 disabled:opacity-40">{t.move}</button>
        </div>
      </div>
    </div>
  );
}
