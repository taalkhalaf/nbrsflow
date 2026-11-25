import { useEffect, useState } from 'react';
import type { Dict, Lang } from '../i18n';
import type { FilePreviewResult, NbrsAPI } from '../types';
import { formatBytes, formatDate } from '../lib/utils';

interface Props {
  api: NbrsAPI | undefined;
  t: Dict;
  lang: Lang;
  itemPath: string;
  onClose: () => void;
}

export default function QuickPreviewModal({ api, t, lang, itemPath, onClose }: Props) {
  const [preview, setPreview] = useState<FilePreviewResult | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancel = false;
    api?.files.readPreview(itemPath)
      .then((res) => { if (!cancel) setPreview(res); })
      .catch((e: Error) => { if (!cancel) setErr(e.message); });
    return () => { cancel = true; };
  }, [api, itemPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === ' ') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={onClose}>
      <div
        data-testid="quick-preview-modal"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[620px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg">{preview?.name ?? itemPath.split('\\').pop()}</div>
            {preview && (
              <div className="text-[11px] text-muted" dir="ltr">
                {formatBytes(preview.size)} · {formatDate(preview.modifiedMs, lang)}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-silver hover:bg-panel2">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {err && <div className="text-sm text-rose-400">{err}</div>}
          {!err && !preview && <div className="text-sm text-muted">…</div>}
          {preview?.provenance && (
            <div data-testid="quick-preview-provenance" className="mb-3 rounded-lg border border-line bg-bg px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-silver">{t.downloadSource}:</span>
                <span className="text-[11px] text-muted" dir="ltr">
                  {t.downloadedOn}: {formatDate(preview.provenance.downloadedAt, lang)}
                </span>
              </div>
              <div className="mt-1 truncate text-fg select-all" dir="ltr" title={preview.provenance.url}>
                {preview.provenance.url}
              </div>
            </div>
          )}
          {preview?.kind === 'image' && preview.dataUrl && (
            <div className="flex items-center justify-center">
              <img src={preview.dataUrl} alt={preview.name} className="max-h-[65vh] max-w-full rounded-lg object-contain" />
            </div>
          )}
          {preview?.kind === 'text' && (
            <pre
              data-testid="quick-preview-text"
              dir="ltr"
              className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-3 text-xs text-fg"
            >{preview.text}</pre>
          )}
          {preview?.kind === 'archive' && (
            <div data-testid="quick-preview-archive" className="rounded-lg border border-line bg-bg">
              <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-silver">
                <span>{t.archiveContents}</span>
                <span dir="ltr">{preview.archiveTotalCount ?? preview.archiveEntries?.length ?? 0}</span>
              </div>
              {(!preview.archiveEntries || preview.archiveEntries.length === 0) ? (
                <div className="p-3 text-xs text-muted">{t.archiveEmpty}</div>
              ) : (
                <div className="max-h-[55vh] divide-y divide-line/60 overflow-auto">
                  {preview.archiveEntries.map((ent, idx) => (
                    <div key={`${ent.name}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs" dir="ltr">
                      <span className="min-w-0 truncate text-fg">
                        {ent.isDirectory ? '📁 ' : '📄 '}{ent.name}
                      </span>
                      {!ent.isDirectory && (
                        <span className="shrink-0 text-[11px] text-muted">{formatBytes(ent.size)}</span>
                      )}
                    </div>
                  ))}
                  {preview.archiveTotalCount && preview.archiveTotalCount > preview.archiveEntries.length && (
                    <div className="px-3 py-1.5 text-center text-[11px] text-muted" dir="ltr">
                      +{preview.archiveTotalCount - preview.archiveEntries.length} more…
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {preview?.kind === 'info' && (
            <div className="rounded-lg border border-line bg-bg p-4 text-sm text-silver">
              {t.quickPreviewUnsupported} ({preview.extension || 'folder'})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
