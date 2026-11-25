import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 15, props: IconProps) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props
});

export function IconDownload({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function IconPlus({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconFolder({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2.5h7.5A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
    </svg>
  );
}

export function IconFolderPlus({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2.5h7.5A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
      <path d="M12 11v5" />
      <path d="M9.5 13.5h5" />
    </svg>
  );
}

export function IconFolderOpen({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2 2 0 0 1 20.5 9v1" />
      <path d="M3 10.5h15.5a2 2 0 0 1 1.94 2.48l-1.2 5A2 2 0 0 1 17.3 19.5H5.5A2.5 2.5 0 0 1 3 17Z" />
    </svg>
  );
}

export function IconLayers({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5Z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}

export function IconSparkles({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7Z" />
      <path d="M19 15l.8 2 .2.2 2 .8-2 .8-.2.2-.8 2-.8-2-.2-.2-2-.8 2-.8.2-.2Z" />
    </svg>
  );
}

export function IconGrid({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </svg>
  );
}

export function IconList({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  );
}

export function IconSidebar({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

export function IconColumns({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </svg>
  );
}

export function IconCopyCheck({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

export function IconUndo({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function IconPalette({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 2-2v-.5a2 2 0 0 1 2-2h1.5a3.5 3.5 0 0 0 3.5-3.5A9 9 0 0 0 12 3Z" />
      <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClipboard({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="8" y="2.5" width="8" height="3.5" rx="1" />
      <path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

export function IconSettings({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function IconSearch({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconPause({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function IconPlay({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

export function IconRefresh({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function IconX({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function IconCheck({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function IconAlert({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="m12 3 9.5 17H2.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function IconInfo({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function IconPuzzle({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M14 5a2 2 0 1 1-4 0H5v5a2 2 0 1 1 0 4v5h5a2 2 0 1 1 4 0h5v-5a2 2 0 1 1 0-4V5Z" />
    </svg>
  );
}

export function IconChevronDown({ size = 13, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconChevronUp({ size = 13, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

export function IconCopy({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconArrowLeft({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function IconArrowUp({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function IconMonitor({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}
