// Minimal inline icon set (stroke icons, currentColor).
const PATHS: Record<string, string> = {
  close: 'M5 5l10 10M15 5L5 15',
  max: 'M4 8V4h4M16 12v4h-4M4 4l5 5M16 16l-5-5',
  restore: 'M8 4H4v4M12 16h4v-4M4 4l5 5M16 16l-5-5',
  swap: 'M3 7h11l-3-3M17 13H6l3 3',
  plus: 'M10 4v12M4 10h12',
  minus: 'M4 10h12',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  chevD: 'M5 8l5 5 5-5',
  chevR: 'M8 5l5 5-5 5',
  chevL: 'M12 5l-5 5 5 5',
  chevU: 'M5 12l5-5 5 5',
  filter: 'M3 5h14l-5 6v5l-4-2v-3z',
  doc: 'M6 3h6l4 4v10H6zM12 3v4h4',
  expand: 'M4 12v4h4M16 8V4h-4M4 16l5-5M16 4l-5 5',
  dock: 'M3 4h14v12H3zM3 11h14',
  sun: 'M10 4V2M10 18v-2M4 10H2M18 10h-2M5 5L3.6 3.6M16.4 16.4L15 15M15 5l1.4-1.4M3.6 16.4L5 15M10 14a4 4 0 100-8 4 4 0 000 8z',
  moon: 'M16 11.5A6 6 0 018.5 4a6 6 0 100 12 6 6 0 007.5-4.5z',
  zoomIn: 'M9 4a5 5 0 100 10A5 5 0 009 4zM13 13l4 4M9 7v4M7 9h4',
  zoomOut: 'M9 4a5 5 0 100 10A5 5 0 009 4zM13 13l4 4M7 9h4',
  fit: 'M4 7V4h3M13 4h3v3M16 13v3h-3M7 16H4v-3',
  check: 'M4 10l4 4 8-8',
  warn: 'M10 3l8 14H2zM10 8v4M10 15h.01',
  play: 'M6 4l10 6-10 6z',
  pause: 'M6 4h3v12H6zM11 4h3v12h-3z',
  reset: 'M4 10a6 6 0 1 1 2 4.5M4 15v-4h4',
  arrowR: 'M4 10h12M11 5l5 5-5 5',
  search: 'M9 4a5 5 0 100 10A5 5 0 009 4zM13 13l4 4',
  link: 'M8 12l4-4M7 9l-2 2a3 3 0 004 4l2-2M13 11l2-2a3 3 0 00-4-4l-2 2',
  up: 'M10 16V4M5 9l5-5 5 5',
  down: 'M10 4v12M5 11l5 5 5-5',
  flat: 'M4 10h12',
  download: 'M10 3v10M6 9l4 4 4-4M4 17h12',
  gear: 'M8.2 3.9L8.9 1.5L11.1 1.5L11.8 3.9L13.1 4.4L15.2 3.2L16.8 4.8L15.6 6.9L16.1 8.2L18.5 8.9L18.5 11.1L16.1 11.8L15.6 13.1L16.8 15.2L15.2 16.8L13.1 15.6L11.8 16.1L11.1 18.5L8.9 18.5L8.2 16.1L6.9 15.6L4.8 16.8L3.2 15.2L4.4 13.1L3.9 11.8L1.5 11.1L1.5 8.9L3.9 8.2L4.4 6.9L3.2 4.8L4.8 3.2L6.9 4.4zM10 7.4a2.6 2.6 0 100 5.2 2.6 2.6 0 000-5.2z',
  windows: 'M3 4h14v12H3zM3 8h14M9 8v8',
  hide: 'M4 10h12',
  stop: 'M5 5h10v10H5z',
  info: 'M10 3a7 7 0 100 14 7 7 0 000-14zM10 9v5M10 6.5h.01',
  bell: 'M6 8a4 4 0 118 0c0 4 2 5 2 5H4s2-1 2-5M8.5 16a1.5 1.5 0 003 0',
  print: 'M6 7V3h8v4M4 7h12v7h-3v3H7v-3H4z',
  ask: 'M4 5h12v9H9l-3.5 3v-3H4z',
};

export function Icon({ name, size = 16, strokeWidth = 1.75, className }: { name: keyof typeof PATHS | string; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
