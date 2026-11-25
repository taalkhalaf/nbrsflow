import { useMemo, useState } from 'react';
import type { Dict } from '../i18n';
import type { FileEntry } from '../types';

interface Props {
  t: Dict;
  entries: FileEntry[];
  onApply: (items: { path: string; newName: string }[]) => void;
  onClose: () => void;
}

export default function BatchRenameDialog({ t, entries, onApply, onClose }: Props) {
  const [mode, setMode] = useState<'sequence' | 'replace'>('sequence');
  const [prefix, setPrefix] = useState('Item_');
  const [startNum, setStartNum] = useState(1);
  const [pad, setPad] = useState(2);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  const previews = useMemo(() => {
    return entries.map((e, i) => {
      const dot = !e.isDirectory ? e.name.lastIndexOf('.') : -1;
      const stem = dot > 0 ? e.name.slice(0, dot) : e.name;
      const ext = dot > 0 ? e.name.slice(dot) : '';
      let nextName = e.name;
      if (mode === 'sequence') {
        const num = String(startNum + i).padStart(Math.max(1, pad), '0');
        nextName = `${prefix}${num}${ext}`;
      } else if (findText) {
        nextName = `${stem.split(findText).join(replaceText)}${ext}`;
      }
      return { path: e.path, oldName: e.name, newName: nextName.trim() || e.name };
    });
  }, [entries, mode, prefix, startNum, pad, findText, replaceText]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        data-testid="batch-rename-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[540px] max-w-[95vw] rounded-xl border border-line bg-panel p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-fg">✏️ {t.batchRenameTitle} ({entries.length})</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-silver hover:bg-panel2">✕</button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            data-testid="batch-rename-mode-seq"
            onClick={() => setMode('sequence')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === 'sequence' ? 'border-silver bg-panel2 text-fg' : 'border-line bg-bg text-muted'}`}
          >{t.batchRenameSeqMode}</button>
          <button
            type="button"
            data-testid="batch-rename-mode-replace"
            onClick={() => setMode('replace')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === 'replace' ? 'border-silver bg-panel2 text-fg' : 'border-line bg-bg text-muted'}`}
          >{t.batchRenameReplaceMode}</button>
        </div>

        {mode === 'sequence' ? (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">{t.batchRenamePrefix}</label>
              <input
                data-testid="batch-rename-prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">{t.batchRenameStart}</label>
              <input
                type="number"
                min={0}
                value={startNum}
                onChange={(e) => setStartNum(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">{t.batchRenamePad}</label>
              <input
                type="number"
                min={1}
                max={5}
                value={pad}
                onChange={(e) => setPad(Math.max(1, Math.min(5, Number(e.target.value) || 2)))}
                className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">{t.batchRenameFind}</label>
              <input
                data-testid="batch-rename-find"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">{t.batchRenameReplaceWith}</label>
              <input
                data-testid="batch-rename-replace"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-fg outline-none focus:border-silver"
              />
            </div>
          </div>
        )}

        <div className="max-h-48 overflow-y-auto rounded-lg border border-line bg-bg p-2 text-xs space-y-1">
          {previews.map((p) => (
            <div key={p.path} className="flex items-center justify-between gap-2 truncate px-1 py-0.5">
              <span className="truncate text-muted">{p.oldName}</span>
              <span className="shrink-0 text-muted">→</span>
              <span className="truncate font-medium text-fg">{p.newName}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-1.5 text-sm text-silver hover:bg-panel2">{t.cancel}</button>
          <button
            type="button"
            data-testid="batch-rename-apply"
            onClick={() => onApply(previews.map(({ path, newName }) => ({ path, newName })))}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accentfg hover:opacity-90"
          >{t.rename}</button>
        </div>
      </div>
    </div>
  );
}
