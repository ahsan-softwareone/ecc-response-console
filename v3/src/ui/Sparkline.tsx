import { useId } from 'react';

/** One trend lane per watcher, its own scale, optional limit line. */
export function Sparkline({ points, limit, limitKind, width = 96, height = 30, breach }: { points: { t: number; v: number }[]; limit?: number | null; limitKind?: 'high' | 'low'; width?: number; height?: number; breach?: boolean }) {
  const id = useId();
  const vs = points.map((p) => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (limit != null) { min = Math.min(min, limit); max = Math.max(max, limit); }
  if (max - min < 1e-9) { max += 1; min -= 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const x = (i: number) => (i / (points.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - min) / (max - min)) * (height - 4);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1).toFixed(1)},${height} L1,${height} Z`;
  const stroke = breach ? 'var(--crit)' : 'var(--text-2)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity=".16" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      {limit != null && (
        <line x1="1" x2={width - 1} y1={y(limit)} y2={y(limit)} stroke={limitKind === 'low' ? 'var(--text-3)' : 'var(--high)'} strokeWidth="1" strokeDasharray="3 2" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].v)} r="2" fill={stroke} />
    </svg>
  );
}
