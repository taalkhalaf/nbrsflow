import type { Dict } from '../i18n';
import type { Aria2EngineState, DiskSpaceWarning } from '../types';
import { formatBytes } from '../lib/utils';

interface Props {
  t: Dict;
  version?: string;
  count: number;
  selected: number;
  bridge: boolean;
  engine?: Aria2EngineState;
  diskWarning?: DiskSpaceWarning | null;
}

export default function StatusBar({ t, version, count, selected, bridge, engine, diskWarning }: Props) {
  const isAria2 = engine?.mode === 'aria2' && engine.connected;
  const isFallback = engine?.mode === 'fallback' && engine.connected;
  const dotCls = isAria2 ? 'bg-emerald-400' : isFallback ? 'bg-sky-400' : 'bg-amber-400';
  const label = isAria2
    ? `${t.aria2Connected}${engine.version ? ` (v${engine.version})` : ''}`
    : isFallback
      ? t.aria2Fallback
      : t.aria2Pending;
  const showDiskWarn = diskWarning && (diskWarning.lowSpace || diskWarning.insufficientForFile);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-5 border-t border-line bg-panel px-4 text-xs text-muted">
      <span>{count} {t.items}</span>
      <span>{selected} {t.selected}</span>
      {showDiskWarn && (
        <span data-testid="disk-warning-badge" className="flex items-center gap-1.5 text-amber-300">
          ⚠️ {diskWarning.insufficientForFile ? t.insufficientDiskWarning : t.lowDiskWarning} ({formatBytes(diskWarning.freeBytes)})
        </span>
      )}
      <span data-testid="engine-status" className="ms-auto flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dotCls}`} />{label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${bridge ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        {t.bridge} (window.nbrsAPI): {bridge ? t.connected : t.disconnected}
      </span>
      {version && <span dir="ltr" className="text-muted/80">v{version}</span>}
    </footer>
  );
}
