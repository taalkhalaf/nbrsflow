import { colorHex } from '../lib/palette';

interface FolderIconProps {
  color?: string;
  tag?: string;
  className?: string;
}

/**
 * Modern Windows-style layered folder icon with custom color support and optional embedded tag label.
 */
export default function FolderIcon({ color, tag, className = 'h-10 w-10' }: FolderIconProps) {
  const c = colorHex(color);
  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 48 48"
        className="h-full w-full drop-shadow-xs"
        aria-hidden="true"
        data-color={color ?? 'default'}
      >
        {/* Back folder tab & body */}
        <path
          d="M5 12a4 4 0 0 1 4-4h9.8c1.2 0 2.3.5 3.1 1.4l2.1 2.2c.4.4.9.6 1.5.6H39a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V12Z"
          fill={c}
          fillOpacity="0.72"
        />
        {/* Subtle inner paper edge */}
        <rect x="8.5" y="14.5" width="31" height="4" rx="1.5" fill="#FFFFFF" fillOpacity="0.28" />
        {/* Front folder flap */}
        <path
          d="M5 18.5a3.5 3.5 0 0 1 3.5-3.5h31a3.5 3.5 0 0 1 3.5 3.5V36a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V18.5Z"
          fill={c}
        />
        {/* Top bevel highlight on front flap */}
        <path
          d="M8.5 15.5h31a3 3 0 0 1 3 3v.6a3 3 0 0 0-3-3h-31a3 3 0 0 0-3 3v-.6a3 3 0 0 1 3-3Z"
          fill="#FFFFFF"
          fillOpacity="0.34"
        />
        {/* Bottom depth shadow */}
        <path
          d="M5.2 35.5A4 4 0 0 0 9 39.5h30a4 4 0 0 0 3.8-4v.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-.5Z"
          fill="#000000"
          fillOpacity="0.2"
        />
      </svg>
      {tag && (
        <span
          data-testid="folder-tag-label"
          title={tag}
          className="pointer-events-none absolute inset-x-1 bottom-1.5 mx-auto max-w-[92%] truncate rounded bg-black/70 px-1 py-0.5 text-center text-[9px] font-semibold leading-none text-white shadow-xs backdrop-blur-[1px]"
        >
          {tag}
        </span>
      )}
    </div>
  );
}
