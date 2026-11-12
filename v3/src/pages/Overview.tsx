// Incident Overview: the Incident Manager's briefing for the active incident.
// Read-only: viewing it, or opening anything from it, changes no acknowledgement, decision or command state.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EQUIPMENT, WATCHERS } from '../data/scenario';
import { LIFECYCLE_LABEL } from '../lib/agent';
import { useDerived, useIncidentNow } from '../lib/derive';
import { formatValue, sampleAt, type Clock } from '../lib/series';
import { clock, dateTime } from '../lib/time';
import { alertOf, equipmentPicture, firstSentence, leaderBrief, type LeaderBrief, milestones, prioritised, shortTitle, situationHead, statusCards, type Attention, type Card, type Milestone, type MsRecord, type Reading, type Sequence, type Target } from '../overview/brief';
import { DEFAULT_DASHBOARD } from '../data/scenario';
import { SEVERITY_SCALE, useStore, type QuickRef } from '../store';
import { Icon } from '../ui/Icon';
import { useEscape } from '../ui/esc';
import { ASK_LABEL, followUpDue, useRoom, type Issue, type RoomData } from '../situation/issues';
import { Popover } from '../ui/ui';
import type { DecisionEvent, IncidentRecord, RecommendationEvent } from '../record/types';


/** Go to the exact record. The overview remembers it was the origin, so the manager can come back to the same place. */
function useGo() {
  const s = useStore.getState;
  return (t: Target) => {
    const st = s(); st.setOverview({ fromOverview: true });
    if (t.kind === 'alert') st.focusAlert(t.alertId, t.tab);
    else if (t.kind === 'concern') { st.setNav('situation'); st.selectConcern(t.invId, 'response'); }
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

function DetailsPanel({ head, cards, onCard, onDeps, record }: { head: { headline: string; para: string }; cards: Card[]; onCard: (c: Card, el: HTMLElement) => void; onDeps: () => void; record: IncidentRecord }) {
  return (
    <section className="ob-panel ob-details" data-testid="ov-summary" aria-labelledby="ob-det-h">
      <div className="ob-sh"><h2 id="ob-det-h">Incident details</h2><button className="link" onClick={onDeps} data-testid="ov-deps">Equipment and dependencies</button></div>
      <h3 className="ob-headline" data-testid="ov-headline">{head.headline}</h3>
      {head.para && <p className="ob-intro" data-testid="ov-para">{head.para}</p>}
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
      {record.intake && <IntakeFacts record={record} />}
    </section>
  );
}

/** What was reported at intake, as entered: where, which equipment, and the original words. ECC's suggestions wait for a person. */
function IntakeFacts({ record: r }: { record: IncidentRecord }) {
  const resolve = useStore((s) => s.resolveSuggestedEquipment);
  const it = r.intake!;
  const named = r.equipment.filter((id) => !(it.suggested ?? []).some((s) => s.id === id && s.status === 'added'));
  const nameOf = (id: string) => EQUIPMENT.find((x) => x.id === id)?.name ?? id;
  const pending = (it.suggested ?? []).filter((s) => s.status === 'pending');
  const added = (it.suggested ?? []).filter((s) => s.status === 'added');
  return (
    <div className="ob-intake" data-testid="ov-intake">
      <dl>
        <div><dt>Reported location</dt><dd data-testid="ov-intake-location">{it.place ? <>{it.place}{it.placeApprox && <span className="ob-q"> · approximate</span>}</> : <span className="ob-q">Not stated</span>}{it.area ? <span className="sidenote"> · {it.area} area</span> : <span className="sidenote"> · area not stated</span>}</dd></div>
        <div><dt>Equipment that may be involved</dt><dd data-testid="ov-intake-equipment">{named.length ? <>{named.map((id) => `${id} ${nameOf(id)}`).join(', ')}<span className="ob-q"> · named at intake, not verified</span></> : <span className="ob-q">Not yet identified</span>}{added.length > 0 && <span className="sidenote"> · also watching {added.map((s) => s.id).join(', ')} (suggested by ECC, confirmed)</span>}</dd></div>
        <div className="wide"><dt>Original notification</dt><dd data-testid="ov-intake-notification">“{r.notification?.text}”<span className="sidenote"> · {[it.reportedBy, it.channel ? `by ${it.channel.toLowerCase()}` : '', `${it.occurredApprox ? 'about ' : ''}${clock(r.occurredAt ?? r.startedAt)}`].filter(Boolean).join(' · ')}</span></dd></div>
      </dl>
      {pending.length > 0 && (
        <div className="ob-suggest" data-testid="ov-suggest">
          <span className="ob-suggest-h">ECC suggests also watching</span>
          {pending.map((s) => (
            <div key={s.id} className="ob-suggest-r" data-testid="ov-suggest-item" data-eq={s.id}>
              <span><b>{s.id}</b> {nameOf(s.id)}<span className="sidenote"> · {s.reason}</span></span>
              <span className="ob-suggest-a"><button className="btn sm" onClick={() => void resolve(s.id, true)} data-testid={`ov-suggest-add-${s.id}`}>Add to Equipment watch</button><button className="link" onClick={() => void resolve(s.id, false)} data-testid={`ov-suggest-no-${s.id}`}>Not relevant</button></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PILL: Record<string, string> = { decision: 'Decision needed', review: 'Decision review', verification: 'Verification pending', signal: 'Signal lost', 'follow-up': 'Follow-up', assessment: 'Assessment' };
const kindOf = (a: Attention) => (a.id.startsWith('rev-') ? 'review' : a.id.startsWith('sig-') ? 'signal' : a.kind);
type Item = Attention & { short: string; sentence: string; k: string };

/** What still needs doing: the same next step the issue shows in the Situation Room, in a few words. */
function nextStep(i: Issue, t: number): string {
  const lc = (x: string) => (/^[A-Z]{1,3}-?\d|^[A-Z]{2}/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1));
  // The first action of a long recommendation: up to the first clause break or " and ".
  const short = (x: string) => { const c = x.split(/[;:]|, (?=and |once |before )| and (?=[a-z]+ )/)[0].trim().replace(/\.$/, ''); return c.length > 80 ? `${c.slice(0, 77).trimEnd()}…` : c; };
  const due = followUpDue(i, t);
  if (due) return `Follow up with ${due.contact.to}: no field update since ${clock(due.since)}`;
  const rec = i.suggestion?.def.recommendation;
  const lastRep = [...i.reports].reverse()[0];
  // A result reported after ECC's recommendation (the fire reported contained) is what to check first; the decision stays open.
  const result = [...i.alerts].reverse().find((a) => a.def.act === 'result' && a.def.evidence === 'reported' && (!i.suggestion || a.time >= i.suggestion.time) && !i.verified);
  switch (i.ask) {
    case 'decision': return result ? `Verify: ${lc(short(String(result.def.headline ?? result.def.title)))} (decision still open)` : rec ? `Decide: ${lc(short(rec.summary))}` : 'Decide on the response';
    case 'deferred': return 'Decision deferred: decide when ready';
    case 'respond': return i.decision?.status === 'declined' ? 'Record what will be done instead' : 'Record how it will be handled, or close it';
    case 'field': return `Get the field update: ${lc(short(i.decision?.response ?? i.decision?.recommendationSummary ?? 'the response'))}`;
    case 'verify': return i.recheck ? 'Check it again after the latest update' : `Verify: ${lc(short(lastRep?.text ?? 'that the response worked'))}`;
    case 'close': return 'Close it if no more follow-up is needed';
    default: return '';
  }
}

/** A short preview of Open issues in the Situation Room: the same issues, titles, statuses and order; one row per issue. */
function AttentionPanel({ room, t, onIssue, onAll }: { room: RoomData; t: number; onIssue: (id: string) => void; onAll: () => void }) {
  const rows = room.open.slice(0, 3);
  return (
    <section className="ob-panel ob-attention" data-testid="ov-attention" aria-labelledby="ob-att-h">
      <div className="ob-sh"><h2 id="ob-att-h">Requires attention</h2>{room.open.length > 0 && <button className="link" onClick={onAll} data-testid="ov-attention-all">View open issues ({room.open.length})</button>}</div>
      {rows.length === 0 && <p className="quiet" data-testid="ov-attention-empty">No open issues. Nothing needs a decision, a field update or a check right now.</p>}
      <ul className="ob-att">
        {rows.map((i) => (
          <li key={i.id}>
            <button className="ob-att-row" onClick={() => onIssue(i.id)} data-testid="ov-item" data-issue={i.id} data-ask={i.ask} title={`Open “${i.title}” in the Situation Room`}>
              <span className={`sr-ask ask-${i.ask}`} data-testid="ov-item-status">{ASK_LABEL[i.ask]}</span>
              <span className="ob-att-b">
                <span className="ob-att-t" data-testid="ov-item-title">{i.title}</span>
                <span className="ob-att-n" data-testid="ov-item-next">{nextStep(i, t)}</span>
              </span>
              <span className="ob-att-go" aria-hidden="true"><Icon name="chevR" size={14} /></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const dur = (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
/** Clock time; with seconds when a neighbour shares the minute, so the order of same-minute events is explicit. */
const msTime = (ms: Milestone[], i: number) => {
  const minute = (t: number) => Math.floor(t / 60_000);
  const shared = [ms[i - 1], ms[i + 1]].some((x) => x && minute(x.t) === minute(ms[i].t));
  if (!shared) return clock(ms[i].t);
  const d = new Date(ms[i].t); return `${clock(ms[i].t)}:${String(d.getSeconds()).padStart(2, '0')}`;
};
// Amber only for doubt about a fact (not verified, unconfirmed, pending), not for a condition that is simply bad.
const UNCERTAIN = /not verified|unverified|unconfirmed|pending|approximate/i;

/** How the incident unfolded: one development per milestone, left to right on a continuous spine. Spacing is even, not to scale. */
function Unfolded({ seq, asOf, story, sel, onPick, onFull }: { seq: Sequence; asOf: number; story: boolean; sel: string | null; onPick: (m: Milestone, el: HTMLElement) => void; onFull: () => void }) {
  const ms = seq.ms;
  // A short story starts at the left: at least four columns, the spine ending just after the latest event.
  const n = Math.max(ms.length, 1); const cols = Math.max(ms.length, 4);
  const wrap = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const on = () => setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    on(); el.addEventListener('scroll', on, { passive: true });
    const ro = new ResizeObserver(on); ro.observe(el);
    return () => { el.removeEventListener('scroll', on); ro.disconnect(); };
  }, [ms.length]);
  // Opening the briefing shows the latest developments when they do not all fit.
  useLayoutEffect(() => { const el = wrap.current; if (el) el.scrollLeft = el.scrollWidth; }, [ms.length]);
  return (
    <section className={`ob-panel ob-unfold us-panel ${story ? 'story' : ''}`} data-testid="ov-sequence" aria-labelledby="ob-seq-h">
      <div className="ob-sh us-head">
        <div>
          <h2 id="ob-seq-h">How the incident unfolded</h2>
          <div className="ob-note">Key developments, earliest first · as of {clock(asOf)}{seq.earlier > 0 && <span data-testid="sq-earlier"> · first report and latest {ms.length - 1}; {seq.earlier} more in the full timeline</span>}<span className="us-scale"> · evenly spaced, not to time scale</span></div>
        </div>
        <button className="link" onClick={onFull} data-testid="ov-full-timeline">Full timeline</button>
      </div>
      <div className={`us-wrap ${edge.l ? 'more-l' : ''} ${edge.r ? 'more-r' : ''}`} ref={wrap} data-testid="us-scroll" data-overflow={edge.l || edge.r ? 'true' : 'false'}>
        <ol className="us" style={{ ['--n' as string]: n, ['--cols' as string]: cols }} data-testid="event-chart" data-milestones={ms.length} aria-label="Developments, earliest first">
          {ms.map((m, i) => {
            const gap = i > 0 ? m.t - ms[i - 1].t : 0;
            const up = i % 2 === 1;
            const pos = i === 0 ? 'first' : i === ms.length - 1 ? 'last' : 'mid';
            return (
              <li key={m.id} className={`us-ev ${up ? 'up' : 'down'} ${pos} ${m.critical ? 'crit' : ''} ${sel === m.id ? 'on' : ''}`} data-testid="us-ev">
                {i > 0 && <span className={`us-step ${gap >= 10 * 60_000 ? 'gap' : ''}`} aria-hidden="true" data-testid={gap >= 10 * 60_000 ? 'sq-gap' : undefined}>{gap >= 10 * 60_000 ? <>{dur(gap)} <span className="us-chev">›</span></> : <span className="us-chev">›</span>}</span>}
                <button onClick={(e) => onPick(m, e.currentTarget)} aria-label={`${i + 1} of ${ms.length}, ${msTime(ms, i)}: ${m.headline}${m.qualifier ? `. ${m.qualifier}` : ''}. Open for the full record.`} data-qd={`ms:${m.id}`} data-testid="ec-marker" data-id={m.id}>
                  <span className="us-dot" aria-hidden="true" />
                  <span className="us-stem" aria-hidden="true" />
                  <span className="us-lbl" data-testid="ec-label">
                    <time className="num" data-testid="ec-time">{msTime(ms, i)}</time>
                    <b>{m.headline}</b>
                    {m.qualifier && <small className={UNCERTAIN.test(m.qualifier) ? 'unsure' : ''}>{m.qualifier}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

interface QuickView { issue?: string | null; wide?: boolean; crumb?: string; status: string; title: string; why?: string; known?: string[]; open?: string[]; proposed?: { summary: string; actions: string[] }; source?: MsRecord; primary?: { label: string; run: () => void; testid: string }; secondary?: { label: string; run: () => void; testid: string }[]; body?: React.ReactNode }
function QuickPanel({ v, onClose }: { v: QuickView; onClose: () => void }) {
  useEscape(true, onClose);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, [v.title]);
  return (
    <div className="ob-qd-back side-sheet-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={`ob-qd side-sheet ${v.wide ? 'wide' : ''}`} role="dialog" aria-labelledby="ob-qd-title" data-testid="quick-detail">
        <header className="ob-qd-h"><span className="ob-eyebrow">Overview / {v.crumb ?? 'Quick detail'}</span><button className="iconbtn sm" onClick={onClose} aria-label="Close quick detail" title="Close" data-testid="qd-close"><Icon name="close" size={14} /></button></header>
        <div className="ob-qd-b">
          <div className="ob-eyebrow" data-testid="qd-status">{v.status}</div>
          <h2 id="ob-qd-title" tabIndex={-1} ref={ref} data-testid="qd-title">{v.title}</h2>
          {v.issue && <p className="ob-qd-issue" data-testid="qd-issue">Part of the issue <b>“{v.issue}”</b> in the Situation Room</p>}
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
  const room = useRoom();
  const issueIdOf = (t: Target | undefined): string | null => { if (!t) return null; const u = t.kind === 'alert' ? room.updateById.get(t.alertId) : t.kind === 'concern' ? room.updateById.get(`inv-${t.invId}`) : undefined; const id = u?.place.issueId; return id && room.byId.get(id) ? id : null; };
  const issueOf = (t: Target | undefined): string | null => { const id = issueIdOf(t); return id ? room.byId.get(id)!.title : null; };
  // To the Situation Room, remembering the briefing as the origin: a specific issue, or the Open issues list with nothing open.
  const toOpenIssues = () => { setOverview({ quick: null, fromOverview: true }); const st = useStore.getState(); st.setNav('situation'); st.closeRoomPanel(); st.setRoom({ view: 'issues', list: 'open', feedEquipment: null, feedIssue: null }); };
  const OPEN_ISSUE = 'Open issue in Situation Room';
  const ref = useRef<HTMLDivElement>(null);
  const [deps, setDeps] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = scroll; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOverview({ fromOverview: false }); }, [setOverview]);
  const readings: Reading[] = useMemo(() => WATCHERS.filter((w) => dashboard.includes(w.equipmentId) && w.unit !== 'status').map((w) => { const s = sampleAt(w, now, clk); return { watcherId: w.id, equipmentId: w.equipmentId, variable: w.variable, text: `${formatValue(w, s.value)}${w.unit === 'status' ? '' : ` ${w.unit}`}, ${s.trend}`, trend: s.trend, source: s.source, observedAt: s.observedAt }; }), [dashboard, now, clk]);
  const data = useMemo(() => {
    if (!record) return null;
    // As of now, and never earlier than the newest event shown, so the as-of time and the event times agree.
    const newest = record.events.reduce((m, e) => Math.max(m, e.t), 0);
    const asOf = record.closure ? Math.min(Math.max(now, newest), record.closure.t) : Math.max(now, newest);
    const pic = equipmentPicture(record, asOf, roleOf);
    const att = prioritised(record, asOf, readings);
    const mins = Math.max(0, Math.floor((asOf - (record.occurredAt ?? record.startedAt)) / 60000));
    const seq = milestones(record, asOf, 8);
    const alertCards = statusCards(record, asOf, [...new Set([...dashboard, ...DEFAULT_DASHBOARD])]);
    const kind = record.incidentType && record.incidentType !== 'Not sure' ? record.incidentType : null;
    const intakeCards: Card[] = record.intake ? record.equipment.filter((id) => !alertCards.some((c) => c.eq === id)).slice(0, Math.max(0, 4 - alertCards.length)).map((id) => ({ eq: id, name: EQUIPMENT.find((x) => x.id === id)?.name ?? id, condition: kind ? `${kind} reported` : 'May be involved', note: 'Reported at intake; not verified', wait: true, alertId: '', basisId: '', t: record.occurredAt ?? record.startedAt, severity: 'medium' })) : [];
    const cards = [...alertCards, ...intakeCards];
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
        issue: issueOf({ kind: 'alert', alertId: c.basisId, tab: 'response' }),
        primary: { label: issueOf({ kind: 'alert', alertId: c.basisId, tab: 'response' }) ? OPEN_ISSUE : 'Open full record', run: () => toFull({ kind: 'alert', alertId: c.basisId, tab: reported ? 'observations' : 'response' }), testid: 'qd-full' } };
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
        issue: issueOf(a.target),
        primary: { label: issueOf(a.target) ? OPEN_ISSUE : a.k === 'decision' || a.k === 'review' ? 'Review decision' : a.k === 'verification' ? 'Open field report' : a.k === 'follow-up' ? 'Review in Investigation' : 'Open full record', run: () => toFull(a.target), testid: 'qd-full' } };
    }
  } else if (quick?.kind === 'ms') {
    const m = data.seq.ms.find((x) => x.id === quick.id);
    if (m) {
      const gaps = m.records.filter((x) => x.status === 'Outstanding').map((x) => x.text.replace(/^Prerequisite outstanding: /, ''));
      view = { status: `${clock(m.t)}${m.qualifier ? ` · ${m.qualifier}` : ''}`, title: m.headline, why: m.why.join(' '),
        known: [`${m.key.text}`, ...((m.key.received != null && Math.abs(m.key.received - m.key.t) > 60_000) || (m.key.observed != null && Math.abs(m.key.observed - m.key.t) > 60_000) ? [`Event ${clock(m.key.observed ?? m.key.t)} · received ${clock(m.key.received ?? m.key.t)}.`] : []), ...(m.records.length ? [`${m.records.length} related record${m.records.length > 1 ? 's' : ''} at this milestone.`] : [])],
        open: [...(m.key.status === 'Reported' ? ['Independent verification of the field report'] : []), ...gaps].slice(0, 3),
        source: m.key,
        issue: m.key.target.kind === 'notification' ? null : issueOf(m.key.target as Target),
        primary: { label: m.key.target.kind !== 'notification' && issueOf(m.key.target as Target) ? OPEN_ISSUE : 'Open full record', run: () => toFull(m.key.target.kind === 'notification' ? { kind: 'timeline', eventId: m.key.id } : m.key.target), testid: 'qd-full' },
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

  const details = <DetailsPanel record={record} head={data.head} cards={data.cards} onCard={(c, el) => (c.alertId ? q.open({ kind: 'card', id: c.eq }, el) : (setOverview({ quick: null, fromOverview: true }), useStore.getState().setNav('situation')))} onDeps={() => setDeps(true)} />;
  const attention = <AttentionPanel room={room} t={data.asOf} onIssue={(id) => { setOverview({ quick: null, fromOverview: true }); useStore.getState().openIssue(id); }} onAll={() => toOpenIssues()} />;
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
  // The Situation Room has its own breadcrumb back to the briefing.
  if (!from || nav === 'overview' || nav === 'situation') return null;
  return <div className="ov-return" data-testid="ov-return"><button className="link" onClick={() => setNav('overview')} data-testid="ov-return-btn"><Icon name="chevL" size={13} /> {quick ? 'Back to Quick detail' : 'Back to Incident Overview'}</button><span className="sidenote">Your place in the briefing is kept.</span></div>;
}
