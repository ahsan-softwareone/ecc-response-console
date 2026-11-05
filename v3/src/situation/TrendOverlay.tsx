import { useMemo, useRef, useState } from 'react';
import { EQUIPMENT, WATCHERS } from '../data/scenario';
import { SEVERITY_ORDER, useDerived } from '../lib/derive';
import { formatValue, sampleAt, type Clock } from '../lib/series';
import { ago, clock, clockSec } from '../lib/time';
import { useIncidentNow } from '../lib/derive';
import { useEscape } from '../ui/esc';
import { useStore } from '../store';
import { IconButton, SeverityChip, SourceDot } from '../ui/ui';

const WINDOWS: { key: 15 | 60 | 0; label: string }[] = [{ key: 15, label: '15 min' }, { key: 60, label: '60 min' }, { key: 0, label: 'All so far' }];
let opener: HTMLElement | null = null;
export function rememberOpener() { opener = document.activeElement as HTMLElement | null; }

/** Large trend view over the workspace for one watcher; nothing beyond scenario-now. */
export function TrendOverlay() {
  const view = useStore((s) => s.trendView);
  const setTrendView = useStore((s) => s.setTrendView);
  const startedAt = useStore((s) => s.startedAt);
  const revealedAt = useStore((s) => s.revealedAt);
  const selectAlert = useStore((s) => s.selectAlert);
  const setNav = useStore((s) => s.setNav);
  const d = useDerived();
  const now = useIncidentNow(2000);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const [hover, setHover] = useState<{ t: number; v: number; x: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const close = () => { setTrendView(null); setTimeout(() => opener?.focus(), 0); };
  useEscape(!!view, close);

  if (!view) return null;
  const w = WATCHERS.find((x) => x.id === view.watcherId); const eq = EQUIPMENT.find((e) => e.id === view.equipmentId);
  if (!w || !eq) return null;
  const siblings = WATCHERS.filter((x) => x.equipmentId === eq.id);
  const windowMs = view.windowMin ? view.windowMin * 60_000 : Math.max(60_000, now - startedAt);
  const start = now - windowMs;
  const N = 160;
  const samples = Array.from({ length: N }, (_, i) => { const t = start + (windowMs * i) / (N - 1); const s = sampleAt(w, t, clk); return { t, v: s.value, lost: s.source === 'lost' }; });
  const cur = sampleAt(w, now, clk);
  const isStatus = w.unit === 'status';
  const limits = w.limits;
  const vals = samples.filter((s) => !s.lost).map((s) => s.v);
  let ymin = Math.min(...vals, ...limits.map((l) => l.value)), ymax = Math.max(...vals, ...limits.map((l) => l.value));
  if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
  if (ymax - ymin < 1e-9) { ymax += 1; ymin -= 1; }
  const pad = (ymax - ymin) * 0.12; ymin -= pad; ymax += pad;
  if (isStatus) { ymin = -0.45; ymax = 1.45; }
  const W = 1000, H = 420, L = isStatus ? 100 : 64, R = 20, T = 18, B = 44;
  const x = (t: number) => L + ((t - start) / windowMs) * (W - L - R);
  const y = (v: number) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  // path with gaps where the signal is lost
  let path = ''; let pen = false; let lostFrom: number | null = null;
  for (const s of samples) { if (s.lost) { pen = false; if (lostFrom == null) lostFrom = s.t; continue; } path += `${pen ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.v).toFixed(1)} `; pen = true; }
  const alerts = d.alerts.filter((a) => a.def.watcherId === w.id && a.time >= start && a.time <= now).sort((a, b) => SEVERITY_ORDER[a.def.severity] - SEVERITY_ORDER[b.def.severity]);
  const critical = d.alerts.find((a) => a.def.severity === 'critical' && a.condition === 'active');
  const ticks = 5; const yTicks = isStatus ? [0, 1] : Array.from({ length: ticks + 1 }, (_, i) => ymin + ((ymax - ymin) * i) / ticks);
  const xTicks = Array.from({ length: 5 }, (_, i) => start + (windowMs * i) / 4);
  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current; if (!svg) return;
    const r = svg.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W;
    const t = start + ((px - L) / (W - L - R)) * windowMs;
    const s = samples.reduce((best, cur2) => (Math.abs(cur2.t - t) < Math.abs(best.t - t) ? cur2 : best), samples[0]);
    setHover(s.lost ? null : { t: s.t, v: s.v, x: x(s.t) });
  };

  return (
    <div className="overlay" data-testid="trend-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="panel trend" role="dialog" aria-label={`${eq.id} ${w.variable} trend`} data-watcher={w.id} data-window={view.windowMin} data-range-ms={windowMs} data-last-t={samples[samples.length - 1].t} data-gap={lostFrom != null} data-ymax={ymax.toFixed(3)} data-unit={w.unit}>
        <div className="trend-h">
          <div className="trend-title">
            <span className="tag">{eq.id}</span><span className="name">{eq.name}</span><span className="sep">·</span><span className="var">{w.variable}</span>
          </div>
          <div className="trend-now num" data-testid="trend-value">
            <span className="big">{formatValue(w, cur.value)}</span>{!isStatus && <span className="unit">{w.unit}</span>}
            <span className="sidenote">{cur.source === 'lost' ? <SourceDot h="lost" /> : `observed ${ago(now - cur.observedAt)}`}</span>
          </div>
          <span className="spacer" />
          <span className="seg sm" data-testid="trend-window">{WINDOWS.map((o) => <button key={o.key} aria-pressed={view.windowMin === o.key} onClick={() => setTrendView({ ...view, windowMin: o.key })} data-testid={`trend-win-${o.key}`}>{o.label}</button>)}</span>
          <IconButton className="sm" name="close" title="Close trend (Esc)" onClick={close} testId="trend-close" />
        </div>
        {critical && <button className="as-critical" onClick={() => { close(); setNav('situation'); selectAlert(critical.id); }} data-testid="trend-critical"><SeverityChip s="critical" /><span className="grow">{critical.def.title.startsWith(critical.def.equipmentId) ? critical.def.title : `${critical.def.equipmentId} · ${critical.def.title}`}</span><span className="num sidenote">{clock(critical.time)}</span></button>}
        {siblings.length > 1 && (
          <div className="trend-switch" data-testid="trend-switch">
            {siblings.map((s) => <button key={s.id} className={`chip ${s.id === w.id ? 'accent' : 'soft'}`} aria-pressed={s.id === w.id} onClick={() => setTrendView({ ...view, watcherId: s.id })} data-testid={`trend-pick-${s.id}`}>{s.variable}{s.unit !== 'status' ? ` · ${s.unit}` : ''}</button>)}
            <span className="sidenote">Each variable keeps its own scale and unit.</span>
          </div>
        )}
        <div className="trend-body">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="trend-svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)} data-testid="trend-svg">
            {yTicks.map((v, i) => <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 8} y={y(v) + 4} className="axis" textAnchor="end">{isStatus ? (v >= 0.5 && v < 1.5 ? (w.statusLabels?.[1] ?? 'On') : v < 0.5 && v > -0.5 ? (w.statusLabels?.[0] ?? 'Off') : '') : v.toFixed(w.decimals)}</text></g>)}
            {xTicks.map((t, i) => <text key={i} x={x(t)} y={H - B + 18} className="axis" textAnchor="middle">{clock(t)}</text>)}
            <text x={L - 8} y={T - 6} className="axis unit" textAnchor="end">{isStatus ? 'state' : w.unit}</text>
            <text x={W - R} y={H - 6} className="axis" textAnchor="end">time · ends at scenario now {clockSec(now)}</text>
            {!isStatus && limits.map((l) => <g key={l.label} data-testid={`trend-limit-${l.label}`}><line x1={L} x2={W - R} y1={y(l.value)} y2={y(l.value)} className={`limit ${l.kind}`} /><text x={L + 6} y={y(l.value) - 5} className="limit-label">{l.label} {l.value.toFixed(w.decimals)} {w.unit} · illustrative</text></g>)}
            {lostFrom != null && <rect x={x(lostFrom)} y={T} width={Math.max(2, x(now) - x(lostFrom))} height={H - T - B} className="lost" data-testid="trend-gap" />}
            {lostFrom != null && <text x={x(lostFrom) + 6} y={T + 16} className="limit-label">signal lost · frozen at last reading</text>}
            {isStatus ? samples.map((s, i) => (i > 0 && !s.lost ? <rect key={i} x={x(samples[i - 1].t)} y={y(s.v >= 0.5 ? 1 : 0) - 6} width={Math.max(1, x(s.t) - x(samples[i - 1].t) + 0.5)} height={12} className="state" data-state={s.v >= 0.5 ? 1 : 0} /> : null)) : <path d={path} className="series" />}
            {alerts.map((a) => <g key={a.id} className="marker" onClick={() => { close(); selectAlert(a.id); }} data-testid={`trend-alert-${a.id}`} role="button" tabIndex={0}><title>{`${clock(a.time)} ${a.def.title}`}</title><rect x={x(a.time) - 7} y={T} width={14} height={H - T - B + 4} className="marker-hit" /><line x1={x(a.time)} x2={x(a.time)} y1={T} y2={H - B} className={`marker-line sev-${a.def.severity}`} /><polygon points={`${x(a.time) - 6},${H - B + 2} ${x(a.time) + 6},${H - B + 2} ${x(a.time)},${H - B - 8}`} className={`marker-dot sev-${a.def.severity}`} /></g>)}
            {hover && <g className="hover"><line x1={hover.x} x2={hover.x} y1={T} y2={H - B} /><circle cx={hover.x} cy={y(hover.v)} r={4} /></g>}
          </svg>
          {hover && <div className="trend-readout num" style={{ left: `${(hover.x / W) * 100}%` }} data-testid="trend-readout">{clockSec(hover.t)} · {formatValue(w, hover.v)}{isStatus ? '' : ` ${w.unit}`}</div>}
        </div>
        <div className="trend-f sidenote">
          {alerts.length ? <span>{alerts.length} alert{alerts.length > 1 ? 's' : ''} in window — click a marker to open it</span> : <span>No alerts for this variable in the window</span>}
          <span className="spacer" />
          <span>Illustrative scenario values · limits are placeholders</span>
        </div>
      </div>
    </div>
  );
}
