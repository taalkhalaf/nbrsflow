import { useEffect, useState } from 'react';
import type { Dict } from '../i18n';
import type { FolderNode, NbrsAPI } from '../types';

interface Props {
  api: NbrsAPI | undefined;
  t: Dict;
  root: string;
  current: string;
  onSubmit: (url: string, targetDir: string, fileName?: string) => void;
  onClose: () => void;
}

function flattenFolders(nodes: FolderNode[], prefix = ''): { label: string; path: string }[] {
  const out: { label: string; path: string }[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ label, path: n.path });
    if (n.children?.length) out.push(...flattenFolders(n.children, label));
  }
  return out;
}

export default function AddDownloadDialog({ api, t, root, current, onSubmit, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [dir, setDir] = useState(current || root);
  const [fileName, setFileName] = useState('');
  const [folders, setFolders] = useState<{ label: string; path: string }[]>([]);

  useEffect(() => {
    if (!api || !root) return;
    api.files.getFolderTree(root, 4)
      .then((tree) => setFolders(flattenFolders(tree)))
      .catch(() => setFolders([]));
  }, [api, root]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <form
        data-testid="add-download-form"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) onSubmit(url.trim(), dir || root, fileName.trim() || undefined);
        }}
        className="w-[460px] rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <h2 className="mb-3 text-base font-medium text-fg">⬇️ {t.addUrl}</h2>

        <label className="mb-1 block text-xs text-muted">{t.urlPrompt}</label>
        <input
          autoFocus
          data-testid="download-url-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          dir="ltr"
          placeholder="https://example.com/file.zip"
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-silver"
        />

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">{t.dlDestination}</label>
            <select
              data-testid="download-dir-select"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-2.5 py-2 text-sm text-fg outline-none focus:border-silver"
            >
              <option value={root}>📁 {t.rootFolder}</option>
              {folders.map((f) => (
                <option key={f.path} value={f.path}>📁 {f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{t.dlFileNameOpt}</label>
            <input
              data-testid="download-filename-input"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              dir="ltr"
              placeholder="auto"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-silver"
            />
          </div>
        </div>

        <p className="mt-2.5 text-xs text-muted">{t.urlHint}</p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-1.5 text-sm text-silver hover:bg-panel2">{t.cancel}</button>
          <button type="submit" data-testid="download-submit-btn" className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accentfg hover:opacity-90">{t.add}</button>
        </div>
      </form>
    </div>
  );
}
