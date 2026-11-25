import { useId } from 'react';
import { colorHex } from '../lib/palette';

interface FolderIconProps {
  color?: string;
  tag?: string;
  className?: string;
}

/**
 * Sleek, modern layered folder icon with SVG gradients, glass edge highlights,
 * full custom color support, and optional embedded tag pill.
 */
export default function FolderIcon({ color, tag, className = 'h-10 w-10' }: FolderIconProps) {
  const base = colorHex(color);
  const uid = useId().replace(/:/g, '');
  const backGradId = `fb-${uid}`;
  const frontGradId = `ff-${uid}`;
  const sheenGradId = `fs-${uid}`;

  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 48 48"
        className="h-full w-full drop-shadow-sm"
        aria-hidden="true"
        data-color={color ?? 'default'}
      >
        <defs>
          <linearGradient id={backGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={base} stopOpacity="0.82" />
            <stop offset="100%" stopColor={base} stopOpacity="0.58" />
          </linearGradient>
          <linearGradient id={frontGradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={base} stopOpacity="1" />
            <stop offset="100%" stopColor={base} stopOpacity="0.86" />
          </linearGradient>
          <linearGradient id={sheenGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.38" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {/* Soft ambient shadow */}
        <ellipse cx="24" cy="41.5" rx="17" ry="2.2" fill="#000000" fillOpacity="0.22" />

        {/* Back folder tab & shell */}
        <path
          d="M5 12.5a4.5 4.5 0 0 1 4.5-4.5h9.2c1.3 0 2.5.5 3.4 1.5l1.9 2c.5.5 1.1.8 1.8.8H38.5a4.5 4.5 0 0 1 4.5 4.5v19.7a4.5 4.5 0 0 1-4.5 4.5h-29A4.5 4.5 0 0 1 5 36.5v-24Z"
          fill={`url(#${backGradId})`}
        />

        {/* Subtle inner document sheet peek */}
        <rect x="8.5" y="13.8" width="31" height="4.5" rx="1.8" fill="#F8FAFC" fillOpacity="0.45" />

        {/* Front sculpted flap */}
        <path
          d="M5 19a4 4 0 0 1 4-4h30a4 4 0 0 1 4 4v17.2a4.5 4.5 0 0 1-4.5 4.5h-29A4.5 4.5 0 0 1 5 36.2V19Z"
          fill={`url(#${frontGradId})`}
        />

        {/* Glass sheen & depth overlay */}
        <path
          d="M5 19a4 4 0 0 1 4-4h30a4 4 0 0 1 4 4v17.2a4.5 4.5 0 0 1-4.5 4.5h-29A4.5 4.5 0 0 1 5 36.2V19Z"
          fill={`url(#${sheenGradId})`}
        />

        {/* Crisp top rim highlight */}
        <path
          d="M9 15.6h30a3.4 3.4 0 0 1 3.4 3.4v.4a3.4 3.4 0 0 0-3.4-3.2H9a3.4 3.4 0 0 0-3.4 3.2V19A3.4 3.4 0 0 1 9 15.6Z"
          fill="#FFFFFF"
          fillOpacity="0.42"
        />

        {/* Subtle decorative groove on front flap when no tag is shown */}
        {!tag && (
          <rect x="16" y="26.5" width="16" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.28" />
        )}
      </svg>

      {tag && (
        <span
          data-testid="folder-tag-label"
          title={tag}
          className="pointer-events-none absolute inset-x-1 bottom-1.5 mx-auto max-w-[92%] truncate rounded-md border border-white/20 bg-black/75 px-1.5 py-0.5 text-center text-[9px] font-semibold leading-none text-white shadow-sm backdrop-blur-[2px]"
        >
          {tag}
        </span>
      )}
    </div>
  );
}
