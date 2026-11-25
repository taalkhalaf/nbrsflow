import { useState } from 'react';
import type { Dict } from '../i18n';

interface Props {
  t: Dict;
  title: string;
  label: string;
  hint?: string;
  confirm: string;
  ltrInput?: boolean;
  initial?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export default function PromptDialog({ t, title, label, hint, confirm, ltrInput, initial, onSubmit, onClose }: Props) {
  const [v, setV] = useState(initial ?? '');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }}
        className="w-[420px] rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <h2 className="mb-3 text-base font-medium text-fg">{title}</h2>
        <label className="mb-1 block text-xs text-muted">{label}</label>
        <input autoFocus onFocus={(e) => { const dot = (initial ?? '').lastIndexOf('.'); e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length); }} value={v} onChange={(e) => setV(e.target.value)} dir={ltrInput ? 'ltr' : undefined}
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-silver" />
        {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-1.5 text-sm text-silver hover:bg-panel2">{t.cancel}</button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accentfg hover:opacity-90">{confirm}</button>
        </div>
      </form>
    </div>
  );
}
