import { useEffect, useRef, useState } from 'react';

export interface HoverInfo { name: string; summary: string; size?: string; modified?: string; isDirectory?: boolean; }

/** Floating summary card. Never intercepts the mouse, so clicking/dragging underneath still works. */
export function HoverCard({ info, x, y }: { info: HoverInfo; x: number; y: number }) {
  const w = 320;
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 8));
  const top = Math.max(8, Math.min(y + 18, window.innerHeight - 200));
  return (
    <div data-testid="hover-card" style={{ left, top, width: w }}
      className="pointer-events-none fixed z-[60] rounded-xl border border-line bg-panel p-3 text-sm shadow-2xl">
      <div className="mb-1.5 flex items-center gap-2 font-medium text-fg">
        <span>{info.isDirectory ? '📁' : '📄'}</span>
        <span className="truncate" title={info.name}>{info.name}</span>
      </div>
      <p dir="auto" className="max-h-40 overflow-hidden whitespace-pre-wrap break-words text-fg/90">{info.summary}</p>
      {(info.size || info.modified) && (
        <div className="mt-2 flex justify-between gap-3 border-t border-line pt-2 text-xs text-muted">
          <span>{info.size}</span><span>{info.modified}</span>
        </div>
      )}
    </div>
  );
}

/** Shows the card after a short hover delay (350ms by default). */
export function useHoverCard(delay = 350) {
  const [state, setState] = useState<{ info: HoverInfo; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setState(null); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return {
    onEnter: (e: React.MouseEvent, info: HoverInfo | null) => {
      if (timer.current) clearTimeout(timer.current);
      if (!info) { setState(null); return; }
      const x = e.clientX, y = e.clientY;
      timer.current = setTimeout(() => setState({ info, x, y }), delay);
    },
    onLeave: clear,
    card: state ? <HoverCard {...state} /> : null
  };
}
