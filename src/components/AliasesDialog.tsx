import { useEffect, useState } from 'react';
import type { Dict } from '../i18n';
import type { NbrsAPI } from '../types';

interface Props {
  api: NbrsAPI | undefined;
  t: Dict;
  folderPath: string;
  onChanged: () => void;
  onClose: () => void;
}

export default function AliasesDialog({ api, t, folderPath, onChanged, onClose }: Props) {
  const folderName = folderPath.split('\\').pop() ?? folderPath;
  const [aliases, setAliases] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!api) return;
    api.metadata.getAliases(folderPath).then(setAliases).catch(() => setAliases([]));
    api.metadata.suggestAliases(folderPath).then(setSuggested).catch(() => setSuggested([]));
  }, [api, folderPath]);

  const add = async (val: string) => {
    const clean = val.trim();
    if (!api || !clean) return;
    const next = await api.metadata.addAlias(folderPath, clean);
    setAliases(next);
    setInput('');
    onChanged();
  };

  const remove = async (val: string) => {
    if (!api) return;
    const next = await api.metadata.removeAlias(folderPath, val);
    setAliases(next);
    onChanged();
  };

  const lowerSet = new Set(aliases.map((a) => a.toLowerCase()));
  const remainingSuggested = suggested.filter((s) => !lowerSet.has(s.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        data-testid="aliases-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[460px] rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <h2 className="mb-1 text-base font-medium text-fg">{t.aliasesTitle}</h2>
        <p className="mb-3 truncate text-xs text-muted" dir="auto" title={folderName}>📁 {folderName}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add(input);
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            data-testid="alias-input"
            value={input}
            dir="auto"
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.aliasInputPlaceholder}
            className="flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm text-fg placeholder:text-muted outline-none focus:border-silver"
          />
          <button
            type="submit"
            data-testid="alias-add-btn"
            className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accentfg hover:opacity-90"
          >{t.add}</button>
        </form>

        <div className="mt-3 min-h-[56px] rounded-lg border border-line bg-bg p-2.5">
          {aliases.length === 0 ? (
            <div className="text-xs text-muted">{t.aliasesEmpty}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {aliases.map((a) => (
                <span
                  key={a}
                  data-testid="alias-chip"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs text-fg"
                >
                  <span dir="auto">{a}</span>
                  <button
                    type="button"
                    data-testid="alias-remove-btn"
                    onClick={() => void remove(a)}
                    className="text-muted hover:text-rose-400"
                    title={t.remove}
                  >✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {remainingSuggested.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-xs text-muted">{t.suggestedAliases}:</div>
            <div className="flex flex-wrap gap-1.5">
              {remainingSuggested.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid="alias-suggestion-btn"
                  onClick={() => void add(s)}
                  className="rounded-lg border border-line bg-panel2/60 px-2.5 py-1 text-xs text-silver hover:bg-panel2 hover:text-fg"
                >＋ <span dir="auto">{s}</span></button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-sm text-silver hover:bg-panel2"
          >{t.close}</button>
        </div>
      </div>
    </div>
  );
}
