// Incident Overview: the Incident Manager's briefing for the active incident.
// Read-only: viewing it, or opening anything from it, changes no acknowledgement, decision or command state.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { WATCHERS } from '../data/scenario';
import { LIFECYCLE_LABEL } from '../lib/agent';
import { useDerived, useIncidentNow } from '../lib/derive';
import { formatValue, sampleAt, type Clock } from '../lib/series';
import { clock, dateTime } from '../lib/time';
import { alertOf, equipmentPicture, firstSentence, leaderBrief, type LeaderBrief, milestones, prioritised, shortTitle, situationHead, statusCards, type Attention, type Card, type Milestone, type MsRecord, type Reading, type Sequence, type Target } from '../overview/brief';
import { DEFAULT_DASHBOARD } from '../data/scenario';
import { SEVERITY_SCALE, useStore, type QuickRef } from '../store';
import { Icon } from '../ui/Icon';
import { useEscape } from '../ui/esc';
import { Popover } from '../ui/ui';
import type { DecisionEvent, IncidentRecord, RecommendationEvent } from '../record/types';


/** Go to the exact record. The overview remembers it was the origin, so the manager can come back to the same place. */
function useGo() {
  const s = useStore.getState;
  return (t: Target) => {
    const st = s(); st.setOverview({ fromOverview: true });
    if (t.kind === 'alert') st.focusAlert(t.alertId, t.tab);
    else if (t.kind === 'concern') { st.selectConcern(t.invId, 'response'); st.setNav('situation'); st.showPanel('situation.response'); }
    else if (t.kind === 'reading') st.setTrendView({ equipmentId: t.equipmentId, watcherId: t.watcherId, windowMin: 15 });
    else if (t.kind === 'timeline') { st.setTimelineFocus(t.eventId); st.setNav('sitrep'); }
    else if (t.kind === 'doc') st.openViewer({ ...t.ev, origin: 'Incident Overview', dock: false });
  };
}

function SeverityBadge({ record }: { record: IncidentRecord }) {
  const assess = useStore((s) => s.assessSeverity);
  const persona = useStore((s) => s.persona);
  const [level, setLevel] = useState<string>(record.severity?.level ?? '');
  const [why, setWhy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const sev = record.severity;
  const tier = sev ? Math.max(0, SEVERITY_SCALE.levels.findIndex((l) => l.id === sev.level) + 1) : 0;
  return (
    <Popover width={330} trigger={(open, toggle) => (
      <button className="ob-sev" data-tier={tier} onClick={toggle} aria-expanded={open} aria-label={`Incident severity: ${sev ? `${sev.label}, assessed by ${sev.by} at ${clock(sev.t)}` : 'not yet assessed'}. ${sev ? 'Reassess' : 'Assess'}`} title={sev ? `${sev.label} on the ${sev.scale}. Assessed by ${sev.by}, ${dateTime(sev.t)}` : 'No incident-level severity is recorded. Select to assess.'} data-testid="incident-severity" data-assessed={!!sev}>
        <span className="ob-sev-k">Incident severity</span>
        <span className="ob-sev-v"><b data-testid="severity-value">{sev ? sev.label : 'Not yet assessed'}</b>{tier > 0 && <span className="ob-bars" aria-hidden="true"><i /><i /><i /></span>}</span>
        <span className="ob-sev-f">{sev ? <span className="ob-sev-m" data-testid="severity-by">{clock(sev.t)} · {sev.by.split(' · ')[0]}</span> : <span className="ob-sev-m">Illustrative scale</span>}<span className="ob-sev-a" data-testid="severity-assess">{sev ? 'Reassess' : 'Assess'}</span></span>
      </button>
    )}>
      {(close) => (
        <div className="ov-sev-pop" data-testid="severity-panel">
          <div className="head"><b>Incident severity</b><div className="sidenote">{SEVERITY_SCALE.name}. Separate from alert severity and from lifecycle status.</div></div>
          {sev ? <div className="sidenote" style={{ padding: '0 10px 6px' }} data-testid="severity-recorded">{sev.label}, assessed by {sev.by} at {dateTime(sev.t)}: {sev.rationale}</div> : <div className="sidenote" style={{ padding: '0 10px 6px' }}>No assessment is recorded. Viewing this does not record one.</div>}
          {record.status !== 'closed' && (
            <div className="ov-sev-form">
              <div className="seg sm">{SEVERITY_SCALE.levels.map((l) => <button key={l.id} aria-pressed={level === l.id} title={l.note} onClick={() => setLevel(l.id)} data-testid={`severity-${l.id}`}>{l.label}</button>)}</div>
              <textarea className="textarea" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason for this assessment (recorded)" data-testid="severity-reason" />
              <div className="row"><button className="btn sm primary" disabled={!level || !why.trim()} onClick={async () => { const r = await assess(level, why); if (r.ok) { setWhy(''); close(); } else setErr(r.error); }} data-testid="severity-record">Record assessment</button><span className="sidenote">As {persona === 'incident-manager' ? 'Incident Manager' : 'Shift Manager'}</span></div>
              {err && <div className="supnote"><Icon name="warn" size={13} />Not recorded: {err}</div>}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}

const qkey = (q: QuickRef) => `${q.kind}:${'id' in q ? q.id : ''}`;
/** The element that opened Quick detail, so Close and Escape can return focus to it. */
let opener: HTMLElement | null = null;
function useQuick() {
  const setOverview = useStore((s) => s.setOverview);
  return {
    open: (q: QuickRef, from?: HTMLElement | null) => { opener = from ?? (document.activeElement as HTMLElement | null); setOverview({ quick: q }); },
    close: () => {
      const q = useStore.getState().overview.quick;
      setOverview({ quick: null });
      window.setTimeout(() => { const el = opener?.isConnected ? opener : q ? document.querySelector<HTMLElement>(`[data-qd="${qkey(q)}"]`) : null; el?.focus(); }, 0);
    },
  };
}

function Header({ record, asOf, onRecord, onExec }: { record: IncidentRecord; asOf: number; onRecord: (el: HTMLElement) => void; onExec: (el: HTMLElement) => void }) {
  return (
    <header className="ob-head" data-testid="ov-details">
      <div className="ob-headl">
        <h1 data-testid="ov-title">{record.title}</h1>
        <div className="ob-meta">
          <span className={`ob-life ${record.status}`} data-testid="ov-status">{LIFECYCLE_LABEL[record.status]}</span>
          <span aria-hidden="true">·</span><span data-testid="ov-area">{record.site}</span>
          <span aria-hidden="true">·</span><span className="num" data-testid="ov-started">Started {clock(record.occurredAt ?? record.startedAt)}</span>
          <span aria-hidden="true">·</span><span className="num" data-testid="ov-asof">Briefing as of {clock(asOf)}</span>
          {record.mode === 'training' && <span className="ob-training" data-testid="ov-training">Training exercise</span>}
          <button className="link" onClick={(e) => onRecord(e.currentTarget)} data-qd="record:" data-testid="ov-record">Incident record</button>
        </div>
      </div>
      <div className="ob-headr">
        <button className="link ob-exec-link" onClick={(e) => onExec(e.currentTarget)} data-qd="exec:" data-testid="ov-exec-open"><Icon name="doc" size={13} />Executive brief</button>
        <SeverityBadge record={record} />
      </div>
    </header>
  );
}

function DetailsPanel({ head, cards, onCard, onDeps }: { head: { headline: string; para: string }; cards: Card[]; onCard: (c: Card, el: HTMLElement) => void; onDeps: () => void }) {
  return (
    <section className="ob-panel ob-details" data-testid="ov-summary" aria-labelledby="ob-det-h">
      <div className="ob-sh"><h2 id="ob-det-h">Incident details</h2><button className="link" onClick={onDeps} data-testid="ov-deps">Equipment and dependencies</button></div>
      <h3 className="ob-headline" data-testid="ov-headline">{head.headline}</h3>
      <p className="ob-intro" data-testid="ov-para">{head.para}</p>
      {cards.length > 0 && (
        <div className="ob-cards" style={{ gridTemplateColumns: `repeat(${Math.max(cards.length, 3)}, minmax(0, 1fr))` }}>
          {cards.map((c) => (
            <button key={c.eq} className="ob-card" onClick={(e) => onCard(c, e.currentTarget)} data-qd={`card:${c.eq}`} data-testid="ov-card" data-eq={c.eq}>
              <span className="ob-asset"><span>{c.eq} · {c.name}</span><Icon name="chevR" size={12} /></span>
              <strong data-testid="ov-card-condition">{c.condition}</strong>
              <small className={c.wait ? 'wait' : ''} data-testid="ov-card-note">{c.note}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const PILL: Record<string, string> = { decision: 'Decision needed', review: 'Decision review', verification: 'Verification pending', signal: 'Signal lost', 'follow-up': 'Follow-up', assessment: 'Assessment' };
const kindOf = (a: Attention) => (a.id.startsWith('rev-') ? 'review' : a.id.startsWith('sig-') ? 'signal' : a.kind);
const ACTION: Record<string, string> = { decision: 'Review decision', review: 'Review decision', verification: 'View report', signal: 'View reading', 'follow-up': 'Review', assessment: 'Assess' };
type Item = Attention & { short: string; sentence: string; k: string };

function AttentionPanel({ items, onItem, onQueue }: { items: Item[]; onItem: (a: Item, el: HTMLElement) => void; onQueue: (el: HTMLElement) => void }) {
  const [lead, ...rest] = items;
  return (
    <section className="ob-panel ob-attention" data-testid="ov-attention" aria-labelledby="ob-att-h">
      <div className="ob-sh"><h2 id="ob-att-h">Requires attention</h2>{items.length > 0 && <button className="link" onClick={(e) => onQueue(e.currentTarget)} data-qd="queue:" data-testid="ov-attention-all">View open items ({items.length})</button>}</div>
      {!lead && <p className="quiet" data-testid="ov-attention-empty">Nothing recorded needs a decision, verification or assessment right now.</p>}
      {lead && (
        <div className="ob-lead" data-testid="ov-item" data-lead="true" data-kind={lead.k} data-id={lead.id}>
          <div className="ob-lead-t">
            <span className={`ob-pill ${lead.k}`}>{PILL[lead.k]}</span>
            <h3 data-testid="ov-item-title">{lead.short}</h3>
            <p data-testid="ov-item-why">{lead.sentence}</p>
          </div>
          <button className="btn primary" onClick={(e) => onItem(lead, e.currentTarget)} data-qd={`item:${lead.id}`} data-testid="ov-item-action">{ACTION[lead.k]}</button>
        </div>
      )}
      <div className="ob-queue">
        {rest.slice(0, 3).map((a) => (
          <button key={a.id} className="ob-row" onClick={(e) => onItem(a, e.currentTarget)} data-qd={`item:${a.id}`} data-testid="ov-item" data-kind={a.k} data-id={a.id}>
            <span className="grow"><span className="ob-row-t" data-testid="ov-item-title">{a.short}</span><span className="ob-row-k">{PILL[a.k]}</span></span><span className="ob-row-a" data-testid="ov-item-action">{ACTION[a.k]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const dur = (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
function Unfolded({ seq, asOf, story, sel, onPick, onFull }: { seq: Sequence; asOf: number; story: boolean; sel: string | null; onPick: (m: Milestone, el: HTMLElement) => void; onFull: () => void }) {
  const ms = seq.ms;
  return (
    <section className={`ob-panel ob-unfold ${story ? 'story' : ''}`} data-testid="ov-sequence" aria-labelledby="ob-seq-h">
      <div className="ob-sh"><div><h2 id="ob-seq-h">How the incident unfolded</h2><div className="ob-note">Key developments in chronological order · as of {clock(asOf)}{seq.earlier > 0 && <span data-testid="sq-earlier"> · first report and latest {ms.length - 1}; {seq.earlier} earlier in the full timeline</span>}</div></div><button className="link" onClick={onFull} data-testid="ov-full-timeline">Full timeline</button></div>
      <ol className="ob-spine" style={{ gridTemplateColumns: `repeat(${Math.max(ms.length, 2)}, minmax(0, 1fr))` }} data-testid="event-chart" data-milestones={ms.length}>
        {ms.map((m, i) => {
          const gap = i > 0 ? m.t - ms[i - 1].t : 0;
          const up = story && i % 2 === 1;
          return (
            <li key={m.id} className={`ob-ev ${up ? 'up' : ''} ${m.critical ? 'crit' : ''} ${sel === m.id ? 'on' : ''}`}>
              {gap >= 15 * 60_000 && <span className="ob-gap" data-testid="sq-gap">{dur(gap)}</span>}
              <button onClick={(e) => onPick(m, e.currentTarget)} aria-label={`${clock(m.t)}: ${m.headline}${m.qualifier ? `. ${m.qualifier}` : ''}`} data-qd={`ms:${m.id}`} data-testid="ec-marker" data-id={m.id}>
                <time className="num">{clock(m.t)}</time>
                <span className="ob-dot" aria-hidden="true" />
                <span className="ob-stem" aria-hidden="true" />
                <span className="ob-lbl" data-testid="ec-label"><b>{m.headline}</b>{m.qualifier && <small>{m.qualifier}</small>}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface QuickView { wide?: boolean; crumb?: string; status: string; title: string; why?: string; known?: string[]; open?: string[]; proposed?: { summary: string; actions: string[] }; source?: MsRecord; primary?: { label: string; run: () => void; testid: string }; secondary?: { label: string; run: () => void; testid: string }[]; body?: React.ReactNode }
function QuickPanel({ v, onClose }: { v: QuickView; onClose: () => void }) {
  useEscape(true, onClose);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, [v.title]);
  return (
    <div className="ob-qd-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={`ob-qd ${v.wide ? 'wide' : ''}`} role="dialog" aria-labelledby="ob-qd-title" data-testid="quick-detail">
        <header className="ob-qd-h"><span className="ob-eyebrow">Overview / {v.crumb ?? 'Quick detail'}</span><button className="iconbtn sm" onClick={onClose} aria-label="Close quick detail" title="Close" data-testid="qd-close"><Icon name="close" size={14} /></button></header>
        <div className="ob-qd-b">
          <div className="ob-eyebrow" data-testid="qd-status">{v.status}</div>
          <h2 id="ob-qd-title" tabIndex={-1} ref={ref} data-testid="qd-title">{v.title}</h2>
          {v.why && <section className="ob-qd-s" data-testid="qd-why"><h4>Why it matters</h4><p>{v.why}</p></section>}
          {v.proposed && <section className="ob-qd-s" data-testid="qd-proposed"><h4>Proposed action</h4><p>{v.proposed.summary}</p>{v.proposed.actions.length > 0 && <ul>{v.proposed.actions.map((a) => <li key={a}>{a}</li>)}</ul>}</section>}
          {v.known && v.known.length > 0 && <section className="ob-qd-s" data-testid="qd-known"><h4>What we know</h4>{v.known.map((k, i) => <p key={i}>{k}</p>)}</section>}
          {v.open && v.open.length > 0 && <section className="ob-qd-s" data-testid="qd-open"><h4>Still open</h4>{v.open.map((k, i) => <p key={i}>{k}</p>)}</section>}
          {v.source && <section className="ob-qd-s" data-testid="qd-source"><h4>Key source</h4><p className="ob-src"><span className="num">{clock(v.source.t)}</span> · {v.source.source} · <span className={`sq-chip ${v.source.status.toLowerCase()}`}>{v.source.status}</span></p><p className="ob-quote">{v.source.text}</p></section>}
          {v.body}
        </div>
        <footer className="ob-qd-f">
          {v.primary && <button className="btn primary" onClick={v.primary.run} data-testid={v.primary.testid}>{v.primary.label}</button>}
          {v.secondary?.map((b) => <button key={b.testid} className="btn" onClick={b.run} data-testid={b.testid}>{b.label}</button>)}
          <span className="spacer" />
          <button className="link" onClick={onClose} data-testid="qd-back">Back to overview</button>
        </footer>
      </aside>
    </div>
  );
}

function DepsDrawer({ pic, onClose, onGo }: { pic: ReturnType<typeof equipmentPicture>; onClose: () => void; onGo: (t: Target) => void }) {
  useEscape(true, onClose);
  const group = (label: string, xs: typeof pic.impact) => <div className="ox-dep"><div className="label">{label}</div>{xs.length ? xs.map((x) => <button key={x.id} className="ox-reading" onClick={() => { if (x.target) { onClose(); onGo(x.target); } }} data-testid={`ov-eq-${x.id}`}><span><b>{x.id}</b> {x.name}</span><span>{x.text}{x.certainty ? ` · impact ${x.certainty === 'confirmed' ? 'confirmed by readings' : 'reported'}` : ''}</span></button>) : <p className="quiet">None recorded</p>}</div>;
  return (
    <div className="drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer ox-drawer" role="dialog" aria-label="Equipment and dependencies" data-testid="ov-equipment">
        <header className="modal-h"><span className="title">Equipment and dependencies</span><span className="spacer" /><button className="iconbtn sm" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button></header>
        <div className="ox-drawer-b">
          {group('Impact', pic.impact)}{group('Exposed', pic.exposed)}{group('Protection and relief', pic.protective)}
          <p className="sidenote">Impact is confirmed only where readings show it. Exposure means in or near the affected area with no damage reported.</p>
        </div>
      </aside>
    </div>
  );
}


function ExecBody({ ex }: { ex: LeaderBrief }) {
  return (
    <div className="ob-brief" data-testid="ov-exec">
      <p className="ob-brief-ctx" data-testid="ov-exec-context">{ex.context.join(' · ')}</p>
      <div className="ob-brief-grid" data-testid="ov-exec-text" data-plain={ex.plain}>
        {ex.sections.map((x) => <section key={x.key} className={`ob-brief-b ${x.key}`} data-testid={`ov-exec-${x.key}`}><h3>{x.label}</h3><p>{x.text}</p></section>)}
      </div>
      <p className="sidenote">Built from the incident record as of {clock(ex.asOf)}. Reported items are not independently verified unless stated.</p>
    </div>
  );
}

export function Overview() {
  const record = useStore((s) => s.records[s.incidentId]);
  const dashboard = useStore((s) => s.dashboard);
  const startedAt = useStore((s) => s.startedAt); const revealedAt = useStore((s) => s.revealedAt);
  const scroll = useStore((s) => s.overview.scroll);
  const quick = useStore((s) => s.overview.quick) ?? null;
  const setOverview = useStore((s) => s.setOverview);
  const setNav = useStore((s) => s.setNav);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const now = useIncidentNow(5000);
  const roleOf = useDerived().roleOf;
  const go = useGo();
  const q = useQuick();
  const ref = useRef<HTMLDivElement>(null);
  const [deps, setDeps] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = scroll; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOverview({ fromOverview: false }); }, [setOverview]);
  const readings: Reading[] = useMemo(() => WATCHERS.filter((w) => dashboard.includes(w.equipmentId) && w.unit !== 'status').map((w) => { const s = sampleAt(w, now, clk); return { watcherId: w.id, equipmentId: w.equipmentId, variable: w.variable, text: `${formatValue(w, s.value)}${w.unit === 'status' ? '' : ` ${w.unit}`}, ${s.trend}`, trend: s.trend, source: s.source, observedAt: s.observedAt }; }), [dashboard, now, clk]);
  const data = useMemo(() => {
    if (!record) return null;
    const asOf = record.closure ? Math.min(now, record.closure.t) : now;
    const pic = equipmentPicture(record, asOf, roleOf);
    const att = prioritised(record, asOf, readings);
    const mins = Math.max(0, Math.floor((asOf - (record.occurredAt ?? record.startedAt)) / 60000));
    const seq = milestones(record, asOf, 8);
    const cards = statusCards(record, asOf, [...new Set([...dashboard, ...DEFAULT_DASHBOARD])]);
    const items: Item[] = att.map((a) => { const al = alertOf(record, a.target); return { ...a, k: kindOf(a), short: shortTitle(record, a), sentence: firstSentence(String(al?.meta?.why ?? a.why.replace(/^Recommended for: /, 'Raised by: '))) }; });
    if (!record.severity && record.status !== 'closed') items.splice(Math.min(items.length, items[0]?.k === 'decision' ? 2 : 0), 0, { id: 'assess-severity', kind: 'follow-up', k: 'assessment', title: 'Assess incident severity', short: 'Assess incident severity', sentence: 'No incident-level severity has been recorded.', why: '', uncertain: '', owner: '', action: 'Assess', target: { kind: 'timeline', eventId: '' }, t: asOf });
    const head = situationHead(record, asOf, cards, att[0], seq, items.filter((x) => x.k === 'verification').length);
    return { asOf, pic, att, items, seq, cards, mins, head, ex: leaderBrief(record, asOf, cards, att[0], seq, head.concern) };
  }, [record, now, readings, roleOf, dashboard]);
  if (!record || !data) return null;
  const toFull = (t: Target) => go(t); // the quick ref stays in the store, so the return path reopens it
  const msOfAlert = (alertId: string) => data.seq.ms.find((m) => m.key.id === `alert-${alertId}` || m.records.some((x) => x.id === `alert-${alertId}`) || m.id === `ms-alert-${alertId}`);
  const recOf = (alertId: string) => record.events.find((e) => e.kind === 'recommendation' && (e as RecommendationEvent).alertId === alertId && !e.meta?.superseded) as RecommendationEvent | undefined;
  const outstanding = (alertId: string) => record.events.filter((e) => e.kind === 'gap' && e.meta?.prerequisite && e.meta?.alertId === alertId && e.t <= data.asOf).map((e) => e.title.replace(/^Prerequisite outstanding: /, ''));

  let view: QuickView | null = null;
  if (quick?.kind === 'card') {
    const c = data.cards.find((x) => x.eq === quick.id);
    const latest = c && alertOf(record, { kind: 'alert', alertId: c.alertId, tab: 'response' });
    const al = c && alertOf(record, { kind: 'alert', alertId: c.basisId, tab: 'response' });
    if (c && al && latest) {
      const m = msOfAlert(c.basisId) ?? msOfAlert(c.alertId);
      const reported = al.evidenceStatus === 'reported';
      view = { status: `${c.eq} · ${c.name} · ${clock(al.t)}`, title: c.condition, why: String(al.meta?.why ?? ''),
        known: [...(latest !== al ? [`Latest (${clock(latest.t)}): ${latest.title}${latest.detail ? `: ${latest.detail}` : ''}.`] : []), `${al.title}${al.detail && al.detail !== al.meta?.why ? `: ${al.detail}` : ''}.`],
        open: [...(c.wait ? [c.note] : []), ...outstanding(c.basisId), ...(reported && !c.wait ? ['Independent verification of the field report'] : [])],
        source: m?.key,
        primary: { label: 'Open full record', run: () => toFull({ kind: 'alert', alertId: c.basisId, tab: reported ? 'observations' : 'response' }), testid: 'qd-full' } };
      if (!view.open!.length) view.open = ['Nothing outstanding is recorded for this item.'];
    }
  } else if (quick?.kind === 'item') {
    const a = data.items.find((x) => x.id === quick.id);
    if (a?.k === 'assessment') view = sevView();
    else if (a) {
      const al = alertOf(record, a.target);
      const m = al ? msOfAlert(String(al.meta?.alertId)) : undefined;
      const aid = al ? String(al.meta?.alertId) : '';
      const rec = a.k === 'decision' ? recOf(aid) : undefined;
      const dec = a.k === 'review' ? (record.events.find((e) => e.id === a.id.replace(/^rev-/, '')) as DecisionEvent | undefined) : undefined;
      view = { status: `${PILL[a.k]}${al?.equipmentId ? ` · ${al.equipmentId}` : ''}`, title: a.short,
        why: String(al?.meta?.why ?? a.why),
        proposed: rec ? { summary: rec.summary, actions: rec.actions } : undefined,
        known: [...(al ? [`${al.title}${al.detail && al.detail !== al.meta?.why ? `: ${al.detail}` : ''}`.replace(/\.?$/, '.')] : []), ...(dec ? [`${dec.title} (${clock(dec.t)}, ${dec.by ?? 'recorded'}).`] : [])],
        open: [a.uncertain.replace(/^Outstanding: /, '')].filter(Boolean),
        source: m?.key,
        primary: { label: a.k === 'decision' || a.k === 'review' ? 'Review decision' : a.k === 'verification' ? 'Open field report' : a.k === 'follow-up' ? 'Review in Investigation' : 'Open full record', run: () => toFull(a.target), testid: 'qd-full' } };
    }
  } else if (quick?.kind === 'ms') {
    const m = data.seq.ms.find((x) => x.id === quick.id);
    if (m) {
      const gaps = m.records.filter((x) => x.status === 'Outstanding').map((x) => x.text.replace(/^Prerequisite outstanding: /, ''));
      view = { status: `${clock(m.t)}${m.qualifier ? ` · ${m.qualifier}` : ''}`, title: m.headline, why: m.why.join(' '),
        known: [`${m.key.text}`, ...((m.key.received != null && Math.abs(m.key.received - m.key.t) > 60_000) || (m.key.observed != null && Math.abs(m.key.observed - m.key.t) > 60_000) ? [`Event ${clock(m.key.observed ?? m.key.t)} · received ${clock(m.key.received ?? m.key.t)}.`] : []), ...(m.records.length ? [`${m.records.length} related record${m.records.length > 1 ? 's' : ''} at this milestone.`] : [])],
        open: [...(m.key.status === 'Reported' ? ['Independent verification of the field report'] : []), ...gaps].slice(0, 3),
        source: m.key,
        primary: { label: 'Open full record', run: () => toFull(m.key.target.kind === 'notification' ? { kind: 'timeline', eventId: m.key.id } : m.key.target), testid: 'qd-full' },
        secondary: [{ label: 'Show in full timeline', run: () => toFull({ kind: 'timeline', eventId: m.key.id }), testid: 'qd-timeline' }] };
      if (!view.open!.length) view.open = ['Nothing outstanding is recorded for this development.'];
    }
  } else if (quick?.kind === 'exec') {
    const copy = async () => { try { await navigator.clipboard.writeText(data.ex.plain); setCopied('ok'); } catch { setCopied('fail'); } window.setTimeout(() => setCopied(null), 2500); };
    view = { crumb: 'Executive brief', wide: true, status: `Leadership update · as of ${clock(data.asOf)}`, title: 'Executive brief', body: <ExecBody ex={data.ex} />,
      primary: { label: copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed: select the text' : 'Copy brief', run: () => void copy(), testid: 'ov-exec-copy' },
      secondary: [{ label: 'Open Sit. Rep', run: () => { setOverview({ fromOverview: true }); setNav('sitrep'); }, testid: 'ov-to-sitrep' }] };
  } else if (quick?.kind === 'queue') {
    view = { crumb: 'Open items', status: `Incident Manager queue · ${data.items.length} open`, title: 'Open attention items',
      body: <div className="ob-queue full">{data.items.map((a) => <button key={a.id} className="ob-row" onClick={(e) => q.open({ kind: 'item', id: a.id }, e.currentTarget)} data-testid="qd-queue-item"><span className="grow"><span className="ob-row-t">{a.short}</span><span className="ob-row-k">{PILL[a.k]}</span></span><span className="ob-row-a">Open</span></button>)}</div> };
  } else if (quick?.kind === 'record') {
    const note = record.events.find((e) => e.kind === 'notification');
    view = { crumb: 'Incident record', status: `${record.id}${record.mode === 'training' ? ' · training exercise' : ''}`, title: record.title,
      body: (
        <section className="ob-qd-s" data-testid="qd-record">
          <dl className="ob-kv">
            <dt>Incident ID</dt><dd className="num" data-testid="qd-record-id">{record.id}</dd>
            <dt>Lifecycle</dt><dd>{LIFECYCLE_LABEL[record.status]}</dd>
            <dt>Facility</dt><dd>{record.site}</dd>
            <dt>Started</dt><dd className="num">{dateTime(record.occurredAt ?? record.startedAt)}</dd>
            <dt>Reported by</dt><dd>{record.reportedBy}</dd>
            <dt>Notification</dt><dd data-testid="qd-notification">{note ? <>Received {dateTime(note.t)} via {record.notification?.via ?? record.reportedBy}. {record.notification?.text || note.detail}</> : 'Not recorded'}</dd>
            <dt>Command</dt><dd data-testid="qd-command">Not recorded in ECC. Command transfer is a manual step; signing in to ECC does not transfer it.</dd>
          </dl>
        </section>
      ),
      primary: { label: 'Open full record', run: () => toFull({ kind: 'timeline', eventId: '' }), testid: 'qd-full' } };
  } else if (quick?.kind === 'severity') view = sevView();
  function sevView(): QuickView {
    const sev = record!.severity;
    const open = data!.items.filter((x) => x.k !== 'assessment');
    return { status: sev ? `Assessed · ${clock(sev.t)}` : 'Assessment pending', title: sev ? `Incident severity ${sev.label}` : 'Incident severity not yet assessed',
      why: 'Incident severity is the Incident Manager’s overall assessment. It is separate from alert severity and from lifecycle status.',
      known: [`Lifecycle: ${LIFECYCLE_LABEL[record!.status]}.`, `${open.length} open item${open.length === 1 ? '' : 's'}; ${data!.cards.filter((c) => c.severity === 'critical').length} item(s) with a critical condition.`, ...(sev ? [`${sev.label} on the ${sev.scale}, by ${sev.by}: ${sev.rationale}`] : [])],
      open: sev ? [] : ['No incident-level severity has been recorded. Viewing this records nothing.'],
      primary: record!.status !== 'closed' ? { label: sev ? 'Reassess severity' : 'Assess severity', run: () => { setOverview({ quick: null }); window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-testid="incident-severity"]')?.click(), 0); }, testid: 'qd-assess' } : undefined };
  }

  const details = <DetailsPanel head={data.head} cards={data.cards} onCard={(c, el) => q.open({ kind: 'card', id: c.eq }, el)} onDeps={() => setDeps(true)} />;
  const attention = <AttentionPanel items={data.items} onItem={(a, el) => q.open({ kind: 'item', id: a.id }, el)} onQueue={(el) => q.open({ kind: 'queue' }, el)} />;
  const unfolded = <Unfolded seq={data.seq} asOf={data.asOf} story sel={quick?.kind === 'ms' ? quick.id : null} onPick={(m, el) => q.open({ kind: 'ms', id: m.id }, el)} onFull={() => go({ kind: 'timeline', eventId: '' })} />;
  return (
    <div className="ov-page ob-page story" ref={ref} onScroll={(e) => setOverview({ scroll: (e.target as HTMLDivElement).scrollTop })} data-testid="page-overview">
      <div className="ob-wrap">
        <Header record={record} asOf={data.asOf} onRecord={(el) => q.open({ kind: 'record' }, el)} onExec={(el) => q.open({ kind: 'exec' }, el)} />
        {details}{unfolded}{attention}
      </div>
      {view && <QuickPanel v={view} onClose={q.close} />}
      {deps && <DepsDrawer pic={data.pic} onClose={() => setDeps(false)} onGo={go} />}
    </div>
  );
}

/** Shown on other pages after leaving the overview through one of its links. Returns to the same place, with Quick detail reopened if it was open. */
export function ReturnToOverview() {
  const from = useStore((s) => s.overview.fromOverview);
  const quick = useStore((s) => s.overview.quick);
  const nav = useStore((s) => s.nav);
  const setNav = useStore((s) => s.setNav);
  if (!from || nav === 'overview') return null;
  return <div className="ov-return" data-testid="ov-return"><button className="link" onClick={() => setNav('overview')} data-testid="ov-return-btn"><Icon name="chevL" size={13} /> {quick ? 'Back to Quick detail' : 'Back to Incident Overview'}</button><span className="sidenote">Your place in the briefing is kept.</span></div>;
}
