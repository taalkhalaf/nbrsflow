import { useEffect, useRef, useState } from 'react';
import { PALETTE, PALETTE_IDS } from '../lib/palette';
import type { ColorId } from '../types';

export interface MenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}

/** A row of color swatches (plus "default" and "suggest by content"). */
export interface ColorRow {
  kind: 'colors';
  label: string;
  defaultLabel: string;
  autoLabel: string;
  names: Record<string, string>;
  current?: string;
  onPick: (c: ColorId | null | 'auto') => void;
}

/** A row of user-created free-form folder tags (no hardcoded presets). */
export interface TagRow {
  kind: 'tags';
  label: string;
  userTags: string[];
  emptyHint?: string;
  clearLabel: string;
  customPlaceholder: string;
  setLabel: string;
  current?: string;
  onPick: (tag: string | null) => void;
}

export type MenuEntry = MenuItem | ColorRow | TagRow | 'sep';

interface Props { x: number; y: number; items: MenuEntry[]; onClose: () => void; }

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [customTag, setCustomTag] = useState('');

  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);

  // keep inside the window
  const w = 264;
  const h = items.reduce((n, it) => n + (typeof it === 'object' && 'kind' in it ? (it.kind === 'tags' ? 105 : 70) : 32), 12);
  const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - h - 4));

  return (
    <div ref={ref} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: w }}
      className="fixed z-50 rounded-xl border border-line bg-panel p-1.5 text-sm shadow-2xl">
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="my-1 h-px bg-line" />;
        if ('kind' in it && it.kind === 'colors') {
          const pick = (c: ColorId | null | 'auto') => { onClose(); it.onPick(c); };
          return (
            <div key={i} className="px-3 py-1.5" data-testid="color-row">
              <div className="mb-1.5 text-xs text-muted">{it.label}</div>
              <div className="flex items-center gap-1.5">
                <button title={it.defaultLabel} data-color="default" onClick={() => pick(null)}
                  className={`flex h-5 w-5 items-center justify-center rounded-full border border-line text-[10px] text-muted hover:scale-110 ${!it.current ? 'ring-2 ring-silver' : ''}`}>✕</button>
                {PALETTE_IDS.map((id) => (
                  <button key={id} title={it.names[id]} data-color={id} onClick={() => pick(id)} style={{ background: PALETTE[id] }}
                    className={`h-5 w-5 rounded-full hover:scale-110 ${it.current === id ? 'ring-2 ring-silver ring-offset-1 ring-offset-panel' : ''}`} />
                ))}
                <button title={it.autoLabel} data-color="auto" onClick={() => pick('auto')}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[11px] hover:scale-110">✨</button>
              </div>
            </div>
          );
        }
        if ('kind' in it && it.kind === 'tags') {
          const pickTag = (tag: string | null) => { onClose(); it.onPick(tag); };
          return (
            <div key={i} className="px-3 py-1.5" data-testid="tag-row">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span>{it.label}</span>
                {it.current && (
                  <button
                    type="button"
                    data-testid="tag-clear-btn"
                    onClick={() => pickTag(null)}
                    className="text-[11px] text-rose-400 hover:underline"
                  >{it.clearLabel}</button>
                )}
              </div>
              {it.userTags.length > 0 ? (
                <div className="flex flex-wrap gap-1" data-testid="user-tags-list">
                  {it.userTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      data-tag={tag}
                      onClick={() => pickTag(tag)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                        it.current === tag
                          ? 'border-silver bg-panel2 font-medium text-fg'
                          : 'border-line bg-bg text-silver hover:border-silver hover:text-fg'
                      }`}
                    >{tag}</button>
                  ))}
                </div>
              ) : it.emptyHint ? (
                <div className="text-[11px] text-muted" data-testid="user-tags-empty-hint">{it.emptyHint}</div>
              ) : null}
              <div className="mt-1.5 flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                <input
                  data-testid="custom-tag-input"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && customTag.trim()) pickTag(customTag.trim());
                  }}
                  placeholder={it.customPlaceholder}
                  className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-[11px] text-fg placeholder:text-muted outline-none focus:border-silver"
                />
                <button
                  type="button"
                  data-testid="custom-tag-submit"
                  disabled={!customTag.trim()}
                  onClick={() => { if (customTag.trim()) pickTag(customTag.trim()); }}
                  className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accentfg disabled:opacity-40"
                >{it.setLabel}</button>
              </div>
            </div>
          );
        }
        return (
          <button key={i} onClick={() => { onClose(); it.onClick(); }}
            className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-1.5 text-start hover:bg-panel2 ${it.danger ? 'text-rose-400' : ''}`}>
            <span>{it.label}</span>
            {it.hint && <span className="text-xs text-muted" dir="ltr">{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
