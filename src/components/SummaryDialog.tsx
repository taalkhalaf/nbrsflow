import { useState } from 'react';
import type { Dict } from '../i18n';

interface Props {
  t: Dict;
  name: string;
  initial: string;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function SummaryDialog({ t, name, initial, onSave, onDelete, onClose }: Props) {
  const [v, setV] = useState(initial);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(v); }}
        className="w-[480px] rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <h2 className="mb-1 text-base font-medium text-fg">{t.summaryTitle}</h2>
        <p className="mb-3 truncate text-xs text-muted" dir="auto" title={name}>{name}</p>
        <textarea
          autoFocus rows={7} value={v} dir="auto" maxLength={5000} placeholder={t.summaryPlaceholder}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(v); } }}
          className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-silver"
        />
        <div className="mt-4 flex items-center gap-2">
          {initial && <button type="button" onClick={onDelete} className="rounded-lg px-3 py-1.5 text-sm text-rose-400 hover:bg-panel2">{t.remove}</button>}
          <span className="ms-auto" />
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-1.5 text-sm text-silver hover:bg-panel2">{t.cancel}</button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accentfg hover:opacity-90">{t.save}</button>
        </div>
      </form>
    </div>
  );
}
