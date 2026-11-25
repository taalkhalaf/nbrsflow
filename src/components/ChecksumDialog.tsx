import { useEffect, useState } from 'react';
import type { Dict } from '../i18n';
import type { FileHashes, NbrsAPI } from '../types';
import { formatBytes } from '../lib/utils';

interface Props {
  api: NbrsAPI | undefined;
  t: Dict;
  filePath: string;
  onClose: () => void;
}

export default function ChecksumDialog({ api, t, filePath, onClose }: Props) {
  const fileName = filePath.split('\\').pop() ?? filePath;
  const [hashes, setHashes] = useState<FileHashes | null>(null);
  const [err, setErr] = useState('');
  const [expected, setExpected] = useState('');
  const [copiedKey, setCopiedKey] = useState<'sha256' | 'md5' | null>(null);

  useEffect(() => {
    let cancel = false;
    setHashes(null);
    setErr('');
    if (!api) return;
    api.files.computeHashes(filePath)
      .then((res) => { if (!cancel) setHashes(res); })
      .catch((e: Error) => { if (!cancel) setErr(e.message); });
    return () => { cancel = true; };
  }, [api, filePath]);

  const copy = (kind: 'sha256' | 'md5', value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopiedKey(kind);
    setTimeout(() => setCopiedKey((k) => (k === kind ? null : k)), 1500);
  };

  const cleanExpected = expected.trim().toLowerCase().replace(/\s+/g, '');
  const matchStatus = !hashes || !cleanExpected
    ? null
    : (cleanExpected === hashes.sha256.toLowerCase() || cleanExpected === hashes.md5.toLowerCase())
      ? 'match'
      : 'mismatch';

  const hashRow = (label: string, kind: 'sha256' | 'md5', val: string) => (
    <div className="rounded-lg border border-line bg-bg p-2.5">
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <button
          type="button"
          data-testid={`copy-${kind}`}
          onClick={() => copy(kind, val)}
          className="rounded px-2 py-0.5 text-silver hover:bg-panel2 hover:text-fg"
        >
          {copiedKey === kind ? t.copied : t.copy}
        </button>
      </div>
      <code data-testid={`hash-${kind}`} dir="ltr" className="block break-all text-xs text-fg select-all">{val}</code>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        data-testid="checksum-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[520px] rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-fg">🛡️ {t.checksumTitle}</h2>
          {hashes && <span className="text-xs text-muted" dir="ltr">{formatBytes(hashes.size)}</span>}
        </div>
        <p className="mb-4 truncate text-xs text-muted" dir="auto" title={fileName}>{fileName}</p>

        {!hashes && !err && (
          <div className="rounded-lg border border-line bg-bg p-4 text-center text-sm text-muted">
            {t.computingHashes}
          </div>
        )}

        {err && (
          <div className="rounded-lg bg-rose-500/15 p-3 text-sm text-rose-400">
            {t.error}: {err}
          </div>
        )}

        {hashes && (
          <div className="space-y-3">
            {hashRow('SHA-256', 'sha256', hashes.sha256)}
            {hashRow('MD5', 'md5', hashes.md5)}

            <div className="pt-1">
              <label className="mb-1 block text-xs text-muted">{t.expectedHash}</label>
              <input
                data-testid="expected-hash-input"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                dir="ltr"
                placeholder="SHA-256 / MD5…"
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-fg placeholder:text-muted outline-none focus:border-silver"
              />
              {matchStatus && (
                <div
                  data-testid="hash-compare-result"
                  className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    matchStatus === 'match'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {matchStatus === 'match' ? t.hashMatch : t.hashMismatch}
                </div>
              )}
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
