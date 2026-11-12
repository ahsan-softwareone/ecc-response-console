// Equipment watch: the top of the Situation Room. Every monitored item with its key reading, trend and
// current status at a glance; the full cards with every watcher open in place.
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { ATTENTION, SEVERITY_ORDER, useDerived, useIncidentNow } from '../lib/derive';
import { formatValue, sampleAt, series, type Clock } from '../lib/series';
import { useStore, watchersFor } from '../store';
import { Icon } from '../ui/Icon';
import { Sparkline } from '../ui/Sparkline';
import { AddEquipment, EquipmentCards } from './EquipmentWindow';

const ARROW = { rising: '↑', falling: '↓', steady: '→' } as const;
/** Kept in step with the Situation Room's divider: the worklist never gets less than this. */
const WORK_MIN = 240;

export function EquipmentWatch({ ref }: { ref?: React.Ref<HTMLElement> }) {
  const dashboard = useStore((s) => s.dashboard);
  const frac = useStore((s) => s.room.watchFrac ?? null);
  const open = useStore((s) => !!s.room.watch);
  const setRoom = useStore((s) => s.setRoom);
  // Its height comes from the divider below it; Show all readings sets a comfortable height, Hide returns to the strip.
  const toggle = () => { if (!open) fit.current = true; setRoom(open ? { watch: false, watchFrac: null } : { watch: true, watchFrac: frac ?? 0.5 }); };
  // Opening every reading makes room for at least the first row of equipment: Incident Updates moves down
  // until that row is in view, keeping the worklist's own minimum. A taller watch the person set is left alone.
  const own = useRef<HTMLElement | null>(null);
  const fit = useRef(false);
  const setRefs = useCallback((el: HTMLElement | null) => { own.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as React.RefObject<HTMLElement | null>).current = el; }, [ref]);
  useLayoutEffect(() => {
    if (!open || !fit.current) return;
    fit.current = false;
    const el = own.current; const main = el?.parentElement;
    const cards = el ? [...el.querySelectorAll<HTMLElement>('[data-testid^="card-"]')] : [];
    if (!el || !main || !cards.length) return;
    const body = el.querySelector<HTMLElement>('.sr-watch-b'); if (body) body.scrollTop = 0;
    const top = el.getBoundingClientRect().top;
    const first = cards[0].getBoundingClientRect().top;
    const row = Math.max(...cards.filter((c) => Math.abs(c.getBoundingClientRect().top - first) < 4).map((c) => c.getBoundingClientRect().bottom));
    const need = row - top + 14;
    const h = main.clientHeight; const max = h - WORK_MIN - 12;
    const want = Math.min(need, max);
    if (want > el.getBoundingClientRect().height + 1) setRoom({ watchFrac: want / h });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section ref={setRefs} className={`sr-watch ${open ? 'open' : ''}`} style={frac ? { height: `${(frac * 100).toFixed(2)}%`, maxHeight: 'none' } : undefined} aria-labelledby="sr-watch-h" data-testid="equipment-watch">
      <header className="sr-watch-h">
        <h2 id="sr-watch-h">Equipment watch <span className="num">{dashboard.length} monitored</span></h2>
        <span className="spacer" />
        <AddEquipment />
        <button className="btn sm quiet" onClick={toggle} aria-expanded={open} aria-controls="sr-watch-b" data-testid="watch-toggle">{open ? 'Hide readings' : 'Show all readings'}<Icon name={open ? 'chevU' : 'chevD'} size={12} /></button>
      </header>
      <div id="sr-watch-b" className="sr-watch-b">
        {/* The full cards stay mounted while collapsed, so watcher settings and open menus are kept. */}
        <div hidden={!open}><EquipmentCards /></div>
        {!open && (
          <div className="sr-strip" data-testid="watch-strip">
            {dashboard.map((id) => <Tile key={id} id={id} />)}
            {dashboard.length === 0 && <p className="quiet">No equipment is monitored. Use Add equipment.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

/** One monitored item: its status, its key reading with the trend, and its alerts. */
function Tile({ id }: { id: string }) {
  const d = useDerived();
  const overrides = useStore((s) => s.watcherOverrides);
  const startedAt = useStore((s) => s.startedAt); const revealedAt = useStore((s) => s.revealedAt);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const now = useIncidentNow(2000);
  const showUpdates = useStore((s) => s.showEquipmentUpdates);
  const setTrend = useStore((s) => s.setTrendView);
  const eq = d.equipmentById.get(id)!;
  const ws = watchersFor(id, overrides).filter((w) => w.onCard);
  const alerts = d.alerts.filter((a) => a.def.equipmentId === id);
  const active = alerts.filter((a) => ATTENTION.includes(a.condition)).sort((a, b) => SEVERITY_ORDER[a.def.severity] - SEVERITY_ORDER[b.def.severity] || b.time - a.time);
  // The key reading: the one an active alert is about, else the first numeric watcher.
  const key = ws.find((w) => w.def.id === active[0]?.def.watcherId && w.def.unit !== 'status') ?? ws.find((w) => w.def.unit !== 'status') ?? ws[0];
  const status = [...alerts].sort((a, b) => b.time - a.time).find((a) => a.def.status)?.def.status ?? (d.roleOf(id) || eq.area);
  const s = key ? sampleAt(key.def, now, clk) : null;
  const lim = key ? key.def.limits.find((l) => l.label === key.limitLabel) : undefined;
  const breach = !!(s && lim && (lim.kind === 'high' ? s.value > lim.value : s.value < lim.value));
  const pts = key ? series(key.def, now, clk, 15 * 60_000, 24) : [];
  const top = active[0];
  return (
    <div className={`sr-tile ${top ? `sev-${top.def.severity}` : ''}`} data-testid={`watch-${id}`}>
      <button className="sr-tile-h" onClick={() => showUpdates(id)} disabled={!alerts.length} title={alerts.length ? `Show ${id}’s notifications in Incident Updates` : `${id} has no notifications`} data-testid={`watch-open-${id}`}>
        <span className="tag">{id}</span>
        {active.length > 0 && <span className={`badge sev-${top!.def.severity}`} title={`${active.length} active ${active.length === 1 ? 'alert' : 'alerts'}`}>{active.length}</span>}
        <span className="name">{eq.name}</span>
      </button>
      {key && s && (
        <button className="sr-tile-r" onClick={() => setTrend({ equipmentId: id, watcherId: key.def.id, windowMin: 15 })} title={`${key.def.variable}: open the trend`} aria-label={`${id} ${key.def.variable} ${formatValue(key.def, s.value)} ${key.def.unit}, ${s.trend}. Open the trend`} data-testid={`watch-trend-${id}`}>
          <span className={`v num ${breach ? 'breach' : ''}`}>{formatValue(key.def, s.value)}{key.def.unit !== 'status' && <small> {key.def.unit}</small>}<span className="arr" aria-hidden="true">{s.source === 'lost' ? '' : ARROW[s.trend]}</span></span>
          <span className="k">{s.source === 'lost' ? 'signal lost' : key.def.variable}</span>
          {key.def.unit !== 'status' && <span className="spark"><Sparkline points={pts} limit={lim?.value ?? null} limitKind={lim?.kind} breach={breach} width={70} height={26} /></span>}
        </button>
      )}
      <span className="sr-tile-s" title={status}>{status}</span>
    </div>
  );
}
