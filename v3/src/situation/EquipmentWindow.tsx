import { useEffect, useMemo, useRef, useState } from 'react';
import { EQUIPMENT } from '../data/scenario';
import type { Equipment, WatcherDef } from '../data/types';
import { ATTENTION, SEVERITY_ORDER, useDerived, type AlertView, type Derived } from '../lib/derive';
import { formatValue, sampleAt, series, type Clock } from '../lib/series';
import { ago, clockSec } from '../lib/time';
import { useIncidentNow } from '../lib/derive';
import { useStore, watchersFor } from '../store';
import { Icon } from '../ui/Icon';
import { Sparkline } from '../ui/Sparkline';
import { IconButton, Popover, SourceDot } from '../ui/ui';
import { WindowFrame } from './WindowFrame';
import { rememberOpener } from './TrendOverlay';

export function EquipmentWindow() {
  const dashboard = useStore((s) => s.dashboard);
  const addEquipment = useStore((s) => s.addEquipment);
  const swapSides = useStore((s) => s.swapSides);
  const d = useDerived();
  const catalogue = EQUIPMENT.filter((e) => !dashboard.includes(e.id));

  return (
    <WindowFrame id="equipment" title="Equipment" meta={`${dashboard.length} monitored`} actions={
      <>
        <Popover width={300} trigger={(open, toggle) => (
          <button className="btn sm" onClick={toggle} aria-expanded={open} data-testid="add-equipment"><Icon name="plus" size={14} /> Add equipment</button>
        )}>
          {(close) => (
            <>
              <div className="head label">Plant items</div>
              {catalogue.length === 0 && <div className="empty">Everything in the catalogue is on the dashboard.</div>}
              {catalogue.map((e) => (
                <button key={e.id} className="item" onClick={() => { addEquipment(e.id); close(); }} data-testid={`add-${e.id}`}>
                  <span><b>{e.id}</b> · {e.name}</span>
                  <span className="sub">{d.roleOf(e.id) || e.area}</span>
                </button>
              ))}
            </>
          )}
        </Popover>
        <IconButton className="sm" name="swap" title="Swap monitoring and response sides" onClick={swapSides} />
      </>
    }>
      <div className="scroll">
        <div className="cards" data-testid="cards">
          {dashboard.map((id) => <EquipmentCard key={id} equipment={d.equipmentById.get(id)!} d={d} />)}
        </div>
      </div>
    </WindowFrame>
  );
}

function EquipmentCard({ equipment, d }: { equipment: Equipment; d: Derived }) {
  const overrides = useStore((s) => s.watcherOverrides);
  const setWatcher = useStore((s) => s.setWatcher);
  const removeEquipment = useStore((s) => s.removeEquipment);
  const openAssistantFor = useStore((s) => s.openAssistantFor);
  const reportedInv = useStore((s) => s.records[s.incidentId]?.investigations?.filter((i) => i.kind === 'observation' && i.context.equipmentId === equipment.id).pop());
  const reported = useStore((s) => (reportedInv ? s.records[s.incidentId]?.events.find((e) => e.id === reportedInv.observationEventId) : undefined));
  const selectConcern = useStore((s) => s.selectConcern);
  const filtered = useStore((s) => s.logFilters.equipment.includes(equipment.id));
  const flash = useStore((s) => s.flashEquipment === equipment.id);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => { if (!flash || !cardRef.current) return; cardRef.current.scrollIntoView({ block: 'nearest' }); cardRef.current.focus(); const t = window.setTimeout(() => useStore.getState().setFlashEquipment(null), 2400); return () => window.clearTimeout(t); }, [flash]);
  const toggleEquipmentFilter = useStore((s) => s.toggleEquipmentFilter);
  const openViewer = useStore((s) => s.openViewer);
  const startedAt = useStore((s) => s.startedAt);
  const revealedAt = useStore((s) => s.revealedAt);
  const clock: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const now = useIncidentNow(2000);

  const ws = watchersFor(equipment.id, overrides);
  const visible = ws.filter((w) => w.onCard);
  const hidden = ws.filter((w) => !w.onCard);
  const alerts = d.alerts.filter((a) => a.def.equipmentId === equipment.id);
  const active = alerts.filter((a) => ATTENTION.includes(a.condition));
  const bySev = (['critical', 'high', 'medium', 'low'] as const).map((s) => ({ s, n: active.filter((a) => a.def.severity === s).length })).filter((x) => x.n > 0);
  const role = d.roleOf(equipment.id);
  const docs = equipment.drawings.map((dr) => ({ dr, doc: d.docById.get(dr.docId)! }));

  return (
    <article ref={cardRef} tabIndex={-1} className={`card ${filtered ? 'filtered' : ''} ${flash ? 'focus-flash' : ''}`} data-flash={flash} data-testid={`card-${equipment.id}`} aria-label={`${equipment.id} ${equipment.name}`}>
      <header className="card-h">
        <div className="grow">
          <div><span className="tag">{equipment.id}</span> <span className="name">{equipment.name}</span></div>
          <div className="role">{role || equipment.area}</div>
        </div>
        {alerts.length > 0 && (
          <button className="ind" aria-pressed={filtered} title={filtered ? `Remove ${equipment.id} from the alert filter` : `Filter the alert log to ${equipment.id}`} onClick={() => toggleEquipmentFilter(equipment.id)} data-testid={`ind-${equipment.id}`}>
            <Icon name="filter" size={13} />
            {bySev.length === 0 ? <span className="badge neutral" title={`${alerts.length} alerts, none needing attention`}>{alerts.length}</span> : bySev.slice(0, 2).map((x) => <span key={x.s} className={`badge sev-${x.s}`} title={`${x.n} ${x.s} needing attention`}>{x.n}</span>)}
          </button>
        )}
        <Popover trigger={(open, toggle) => <IconButton className="sm" name="more" title="Card menu" onClick={toggle} pressed={open} />}>
          {(close) => (
            <>
              <div className="head label">Drawings</div>
              {docs.map(({ dr, doc }) => (
                <button key={doc.id} className="item" onClick={() => { openViewer({ docId: doc.id, revision: doc.current.revision, page: dr.page ?? dr.region?.page ?? 1, label: `${equipment.id} on ${doc.type}`, region: dr.region, locate: dr.region ? 'exact' : 'page-only', origin: `${equipment.id} · ${equipment.name}` }); close(); }}>
                  <span>{doc.type}</span><span className="sub">Rev {doc.current.revision}</span>
                </button>
              ))}
              {docs.length === 0 && <div className="item sidenote">No linked drawings</div>}
              <div className="sep" />
              <button className="item" onClick={() => { removeEquipment(equipment.id); close(); }}>Remove from dashboard<span className="sub">Monitoring continues</span></button>
            </>
          )}
        </Popover>
      </header>
      {reported && (
        <button className="card-reported" onClick={() => selectConcern(reportedInv?.id ?? null, 'response')} title="Reported evidence. It has not changed this equipment's readings or alerts. Open its follow-through." data-testid={`reported-${equipment.id}`} data-state={reportedInv?.responses[reportedInv.responses.length - 1]?.reconciliation ?? 'pending'}>
          <span className="label">Reported · not verified</span><span className="grow">{reported.title}</span>{(() => { const rec = reportedInv?.responses[reportedInv.responses.length - 1]?.reconciliation; return rec === 'conflict' ? <span className="chip outline">Conflicts with a reading</span> : rec === 'consistent' ? <span className="chip outline">Consistent with a reading</span> : null; })()}
        </button>
      )}
      {visible.map((w) => <WatcherRow key={w.def.id} w={w.def} limitLabel={w.limitLabel} windowMin={w.windowMin} clock={clock} now={now} alerts={alerts} onChange={(o) => setWatcher(w.def.id, o)} />)}
      {visible.length === 0 && <div className="empty">No watchers shown. Monitoring continues for {ws.length} variables.</div>}
      <footer className="card-f">
        <Popover align="left" width={260} trigger={(open, toggle) => <button className="btn quiet sm" onClick={toggle} aria-expanded={open} data-testid={`add-watcher-${equipment.id}`}><Icon name="plus" size={14} /> Watcher</button>}>
          {(close) => (
            <>
              <div className="head label">Variables</div>
              {hidden.length === 0 && <div className="item sidenote">All variables are shown</div>}
              {hidden.map((w) => (
                <button key={w.def.id} className="item" onClick={() => { setWatcher(w.def.id, { onCard: true }); close(); }} data-testid={`watch-${w.def.id}`}>
                  <span>{w.def.variable}</span><span className="sub">{w.def.unit === 'status' ? 'status' : w.def.unit}</span>
                </button>
              ))}
            </>
          )}
        </Popover>
        {hidden.length > 0 && <span className="sidenote" title={`${hidden.length} hidden · still monitored`}>{hidden.length} hidden · still monitored</span>}
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn quiet sm" onClick={() => openAssistantFor({ mode: 'ask', context: { equipmentId: equipment.id } })} title={`Ask about ${equipment.id} in the Assistant`} data-testid={`ask-about-${equipment.id}`}><Icon name="ask" size={13} /> Ask about this</button>
      </footer>
    </article>
  );
}

function WatcherRow({ w, limitLabel, windowMin, clock, now, alerts, onChange }: { w: WatcherDef; limitLabel: string | null; windowMin: 15 | 60; clock: Clock; now: number; alerts: AlertView[]; onChange: (o: { onCard?: boolean; limit?: string | null; windowMin?: 15 | 60 }) => void }) {
  const s = sampleAt(w, now, clock);
  const pts = useMemo(() => series(w, now, clock, windowMin * 60_000), [w, now, clock, windowMin]);
  const limit = w.limits.find((l) => l.label === limitLabel) ?? null;
  const breach = limit ? (limit.kind === 'high' ? s.value > limit.value : s.value < limit.value) : false;
  const isStatus = w.unit === 'status';
  const trendIcon = s.trend === 'rising' ? 'up' : s.trend === 'falling' ? 'down' : 'flat';
  const selectAlert = useStore((s) => s.selectAlert);
  const related = alerts.filter((a) => a.def.watcherId === w.id && ATTENTION.includes(a.condition)).sort((a, b) => SEVERITY_ORDER[a.def.severity] - SEVERITY_ORDER[b.def.severity]);
  const [inspect, setInspect] = useState(false);
  const setTrendView = useStore((st) => st.setTrendView);

  return (
    <div className="wrow" data-testid={`watcher-${w.id}`} data-breach={breach || undefined} data-value={s.value}>
      <div className="v1">
        <div className="var">{w.variable}{related[0] && <button className={`walert sev-${related[0].def.severity}`} onClick={() => selectAlert(related[0].id)} title={`${related.length} alert${related.length === 1 ? '' : 's'} linked to this reading: ${related.map((r) => r.def.title).join('; ')}. It does not mean the value is above a limit. Click to open.`} data-testid={`walert-${w.id}`}>{related.length} alert{related.length === 1 ? '' : 's'}</button>}</div>
        <button className={`val ${breach ? 'breach' : ''}`} onClick={() => setInspect((v) => !v)} title="Inspect measurement" aria-expanded={inspect} style={{ textAlign: 'left' }}>
          {formatValue(w, s.value)}{!isStatus && <span className="unit">{w.unit}</span>}
          {!isStatus && s.source !== 'lost' && <span className={`trend ${s.trend === 'rising' ? 'up' : s.trend === 'falling' ? 'down' : ''}`} title={s.trend}><Icon name={trendIcon} size={13} /></span>}
        </button>
        <div className="sub">
          {s.source === 'lost' ? <SourceDot h="lost" /> : <span title={clockSec(s.observedAt)}>{ago(now - s.observedAt)}</span>}
          {!isStatus && (limit ? <span className={`lim ${breach ? 'breach' : ''}`} title={`${limit.label} limit · basis: ${limit.basis} (illustrative)`}>{limit.label} {limit.value.toFixed(w.decimals)}</span> : <span>No limit configured</span>)}
        </div>
      </div>
      <div className="lane">
        {isStatus ? <StatusLane pts={pts} /> : <Sparkline points={pts} limit={limit?.value ?? null} limitKind={limit?.kind} breach={breach} width={120} height={32} />}
        <span className="win">{windowMin} min</span>
      </div>
      <div className="menuwrap">
        <IconButton className="sm trend-max" name="max" title={`Maximize ${w.variable} trend`} onClick={() => { rememberOpener(); setTrendView({ equipmentId: w.equipmentId, watcherId: w.id, windowMin: windowMin }); }} testId={`trend-max-${w.id}`} />
        <Popover width={250} trigger={(open, toggle) => <IconButton className="sm menu" name="more" title="Adjust watcher" onClick={toggle} pressed={open} />}>
          {(close) => (
            <>
              <div className="head label">Trend window</div>
              <div style={{ padding: '2px 10px 8px' }}>
                <span className="seg">
                  <button aria-pressed={windowMin === 15} onClick={() => onChange({ windowMin: 15 })}>15 min</button>
                  <button aria-pressed={windowMin === 60} onClick={() => onChange({ windowMin: 60 })}>60 min</button>
                </span>
              </div>
              {w.limits.length > 0 && (
                <>
                  <div className="head label">Limit shown</div>
                  {w.limits.map((l) => (
                    <button key={l.label} className="item" onClick={() => { onChange({ limit: l.label }); close(); }} aria-pressed={limitLabel === l.label}>
                      {limitLabel === l.label ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{l.label} {l.value.toFixed(w.decimals)} {w.unit}<span className="sub">illustrative</span>
                    </button>
                  ))}
                  <button className="item" onClick={() => { onChange({ limit: null }); close(); }}>{limitLabel == null ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}None</button>
                </>
              )}
              <div className="sep" />
              <button className="item" onClick={() => { onChange({ onCard: false }); close(); }} data-testid={`hide-${w.id}`}>Hide watcher<span className="sub">Alerts continue</span></button>
            </>
          )}
        </Popover>
      </div>
      {inspect && (
        <div style={{ gridColumn: '1 / -1', paddingTop: 8 }}>
          <dl className="kv">
            <dt>Observed</dt><dd className="num">{clockSec(s.observedAt)} · {s.source === 'lost' ? 'signal lost, last good value' : 'simulated PI tag, 10 s cadence'}</dd>
            <dt>Window</dt><dd className="num">{windowMin} min · min {Math.min(...pts.map((p) => p.v)).toFixed(w.decimals)} · max {Math.max(...pts.map((p) => p.v)).toFixed(w.decimals)} {isStatus ? '' : w.unit}</dd>
            <dt>Limits</dt><dd>{w.limits.length ? w.limits.map((l) => `${l.label} ${l.value.toFixed(w.decimals)} ${w.unit} (${l.basis}, illustrative)`).join(' · ') : 'None configured'}</dd>
            <dt>Value</dt><dd>Illustrative scenario value, not a plant reading</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function StatusLane({ pts }: { pts: { t: number; v: number }[] }) {
  const w = 120, h = 32;
  const segs: { x: number; on: boolean; width: number }[] = [];
  let start = 0;
  for (let i = 1; i <= pts.length; i++) {
    if (i === pts.length || (pts[i].v >= 0.5) !== (pts[start].v >= 0.5)) {
      segs.push({ x: (start / pts.length) * w, width: ((i - start) / pts.length) * w, on: pts[start].v >= 0.5 });
      start = i;
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {segs.map((s, i) => <rect key={i} x={s.x} y={s.on ? 8 : 18} width={Math.max(1, s.width)} height={s.on ? 14 : 4} rx="2" fill={s.on ? 'var(--text-2)' : 'var(--line-strong)'} />)}
    </svg>
  );
}
