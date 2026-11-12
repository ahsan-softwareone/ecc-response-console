// The Situation Room's response panel. Written for someone who was not in the control room:
// What happened? What needs a decision or confirmation? What happens next? Then the response so far,
// keeping the decision, what the field team reports doing and what was verified apart.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DECISION_LABEL, useDerived, useIncidentNow } from '../lib/derive';
import { formatValue, sampleAt, watcherDef, type Clock } from '../lib/series';
import { clock, now } from '../lib/time';
import { userLabel, useStore, type Contact, type Decision } from '../store';
import { Icon } from '../ui/Icon';
import { IconButton, SeverityChip } from '../ui/ui';
import { AnalysisChip, ConcernResponse, ConcernSources } from './Concern';
import { Citation } from '../ui/Citation';
import { OriginTag, srcOf, useOpenUpdate } from './Situation';
import { useEscape } from '../ui/esc';
import { ASK_LABEL, followUpDue, ORIGIN_LABEL, type Ask, type Issue, type Rep, type RoomData, type Update } from './issues';

const who = (s: string) => s.split(' · ')[0];

function PanelHead({ eyebrow, pill, children }: { eyebrow: string; pill?: React.ReactNode; children?: React.ReactNode }) {
  const dock = useStore((s) => s.room.dock);
  const setRoom = useStore((s) => s.setRoom);
  const close = useStore((s) => s.closeRoomPanel);
  return (
    <header className="sr-ph">
      <span className="sr-eyebrow">{eyebrow}</span>{pill}
      <span className="spacer" />
      {children}
      <IconButton className="sm" name={dock === 'wide' ? 'dock' : 'expand'} title={dock === 'wide' ? 'Dock to the side' : 'Widen the panel'} onClick={() => setRoom({ dock: dock === 'wide' ? 'side' : 'wide' })} testId="panel-dock" />
      <IconButton className="sm" name="close" title="Close the panel (the issue stays as it is)" onClick={close} testId="panel-close" />
    </header>
  );
}

/** One line in “What happened”: when, from whom, what. The update the person clicked is marked. */
function Line({ u, opened, isNew, testId }: { u: Update; opened: boolean; isNew: boolean; testId: string }) {
  // A report made in ECC keeps its label hook, so its own wording can be found wherever it is shown.
  const label = opened && u.invId ? 'concern-label' : undefined;
  return (
    <li className={`ir-line ${opened ? 'opened' : ''}`} data-testid={testId} data-update={u.id} data-opened={opened || undefined}>
      <span className="ir-line-m"><span className="num">{clock(u.t)}</span> · {srcOf(u) || ORIGIN_LABEL[u.origin]}{opened && <span className="ir-tag" data-testid="opened-mark">You opened this</span>}{isNew && <span className="ir-tag new">New</span>}</span>
      <span className="ir-line-t" data-testid={label}>{u.plain}</span>
    </li>
  );
}

export function IssuePanel({ issue: i, room, focus }: { issue: Issue; room: RoomData; focus: string | null }) {
  const setRoom = useStore((s) => s.setRoom);
  const markSeen = useStore((s) => s.markIssueSeen);
  const openAssistantFor = useStore((s) => s.openAssistantFor);
  const openUpdate = useOpenUpdate();
  const record = useStore((s) => s.records[s.incidentId]);
  const d = useDerived();
  // Updates that arrived since this person last looked stay marked while the panel is open.
  const [seenAt] = useState(() => useStore.getState().issueUser[i.id]?.lastSeen ?? null);
  useEffect(() => { markSeen(i.id, i.latest.t); }, [i.id, i.latest.t, markSeen]);
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h.current?.focus(); }, [i.id]);
  const opened = focus ? i.updates.find((u) => u.id === focus) : undefined;
  const others = i.updates.slice().reverse();
  const evidenceAlert = i.alerts.find((x) => x.id === focus) ?? i.suggestion ?? i.alerts[i.alerts.length - 1] ?? null;
  const toRecord = () => useStore.getState().openIssueHistory(i.id);
  const isNew = (u: Update) => seenAt != null && u.t > seenAt;
  // What happened and what changed: how it started, the latest change, and the update you clicked if it is neither.
  const latest = i.latest.id !== i.lead.id ? i.latest : null;
  const extra = opened && opened.id !== i.lead.id && opened.id !== latest?.id ? opened : null;
  const inv = opened?.invId ? record?.investigations?.find((x) => x.id === opened.invId) : undefined;
  const sev = i.severity && !i.closed ? i.severity : null;
  const sub = useStore((s) => s.room.sub);

  return (
    <aside className="sr-panel ir" aria-labelledby="sr-p-title" data-testid="issue-panel" data-issue={i.id} data-ask={i.ask} data-focus={focus ?? ''}>
      <PanelHead eyebrow="Issue"><Ack i={i} focus={focus} /></PanelHead>
      <div className="sr-pb ir-b">
        <div className="ir-head">
          <h2 id="sr-p-title" className="ir-title" ref={h} tabIndex={-1} data-testid="issue-title">{i.title}</h2>
          <p className="ir-meta" data-testid="issue-meta">
            {i.equipment.length > 0 && <span>{i.equipment.join(', ')}</span>}
            <span className="num">Opened {clock(i.openedAt)}</span>
            {sev && <span className={`ir-sev s-${sev}`} data-testid="issue-severity">{sev[0].toUpperCase() + sev.slice(1)}</span>}
            <span className="ir-status" data-testid="panel-ask">{ASK_LABEL[i.ask]}</span>
          </p>
          {i.history.length > 0 && !i.closed && <p className="ir-note-quiet" data-testid="issue-history">{i.history.map((x) => `${x.kind === 'closed' ? 'Closed' : 'Reopened'} ${clock(x.t)} by ${who(x.by)}${x.kind === 'reopened' && x.note ? ` (${x.note})` : ''}`).join(' · ')}</p>}
        </div>

        <section className="ir-sec" aria-labelledby="ir-h1" data-testid="sec-happened">
          <h3 id="ir-h1" className="ir-h">What happened</h3>
          <ol className="ir-lines">
            <Line u={i.lead} opened={focus === i.lead.id} isNew={isNew(i.lead)} testId="happened-lead" />
            {latest && <Line u={latest} opened={focus === latest.id} isNew={isNew(latest)} testId="happened-latest" />}
            {extra && <Line u={extra} opened isNew={isNew(extra)} testId="happened-opened" />}
          </ol>
          {inv && record && (
            <details className="ir-det" open data-testid="opened-assessment">
              <summary>ECC’s assessment of the report you opened <span data-testid="concern-bar" data-kind={inv.kind} className="ir-chip"><AnalysisChip inv={inv} /></span></summary>
              <ConcernResponse inv={inv} record={record} d={d} />
            </details>
          )}
          {inv && record && sub === 'evidence' && <EvidenceDialog title={opened!.plain}><ConcernSources inv={inv} record={record} d={d} /></EvidenceDialog>}
          {opened && <button className="link ir-move" onClick={() => { openUpdate(opened.id); setRoom({ sub: 'place' }); }} data-testid="opened-move">Move the update you opened to another issue</button>}
        </section>

        <section className="ir-sec ir-main" aria-labelledby="ir-h2" data-testid="sec-recommends">
          <h3 id="ir-h2" className="ir-h">ECC recommends</h3>
          <Recommends i={i} room={room} />
        </section>

        <section className="ir-sec" aria-labelledby="ir-h3" data-testid="sec-needs">
          <h3 id="ir-h3" className="ir-h">Follow-up</h3>
          <FollowUpSection i={i} />
          <CloseArea i={i} />
        </section>

        <EvidenceList i={i} focus={focus} />

        <div className="ir-foot" aria-label="Supporting detail">
          <details className="ir-det" data-testid="related">
            <summary data-testid="link-related">All updates on this issue ({i.updates.length}){i.updates.some(isNew) && <span className="ir-tag new">{i.updates.filter(isNew).length} new</span>}</summary>
            <ol className="ir-lines ir-all" data-testid="issue-updates">
              {others.map((u) => (
                <li key={u.id} className={`ir-line ${focus === u.id ? 'opened' : ''}`} data-update={u.id}>
                  <button className="ir-line-btn" onClick={() => openUpdate(u.id)}><span className="ir-line-m"><span className="num">{clock(u.t)}</span> · {srcOf(u) || ORIGIN_LABEL[u.origin]}{isNew(u) && <span className="ir-tag new">New</span>}</span><span className="ir-line-t">{u.plain}</span></button>
                </li>
              ))}
            </ol>
            <button className="link" onClick={() => { useStore.getState().closeRoomPanel(); setRoom({ feedIssue: i.id, view: 'updates' }); }} data-testid="related-in-feed">Show only these in Incident Updates</button>
          </details>
          <div className="ir-links">
            <button className="link" onClick={toRecord} data-testid="link-record">Show in Timeline</button>
            <button className="link" onClick={() => { const a = i.alerts.find((x) => x.id === focus) ?? evidenceAlert; openAssistantFor({ mode: 'ask', context: a ? { alertId: a.id, equipmentId: a.def.equipmentId } : { equipmentId: i.equipment[0] } }); }} data-testid="ask-about-alert">Ask ECC about this</button>
          </div>
        </div>
      </div>
    </aside>
  );
}


/** Evidence opens on request, over the room, and closes back to the issue. Opening a document docks it beside the issue. */
function EvidenceDialog({ title, children }: { title: string; children: React.ReactNode }) {
  const setRoom = useStore((s) => s.setRoom);
  const viewer = useStore((s) => s.viewer);
  const trend = useStore((s) => s.trendView);
  const close = () => setRoom({ sub: 'main' });
  // Opening a document or a trend from here shows it in its usual place, so the dialog steps aside.
  const first = useRef({ viewer, trend });
  useEffect(() => { if ((viewer && viewer !== first.current.viewer) || (trend && trend !== first.current.trend)) close(); }, [viewer, trend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEscape(true, close);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    createPortal(<div className="modal-back sr-ev-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal sr-ev" role="dialog" aria-modal="true" aria-labelledby="sr-ev-h" tabIndex={-1} ref={ref} data-testid="evidence-dialog">
        <header className="modal-h"><span className="title" id="sr-ev-h">Evidence · {title}</span><span className="spacer" /><button className="iconbtn sm" onClick={close} aria-label="Close evidence" title="Close" data-testid="evidence-back"><Icon name="close" size={14} /></button></header>
        <div className="sr-ev-b">{children}</div>
      </div>
    </div>, document.body)
  );
}

/** Acknowledge the issue's alerts: seen and taken in hand. It decides nothing and verifies nothing. */
function Ack({ i, focus }: { i: Issue; focus: string | null }) {
  const alertUser = useStore((s) => s.alertUser);
  const acknowledge = useStore((s) => s.acknowledge);
  if (i.closed) return null;
  const focused = i.alerts.find((a) => a.id === focus);
  const pending = focused ? (alertUser[focused.id]?.ackAt ? [] : [focused]) : i.alerts.filter((a) => (a.condition === 'active' || a.condition === 'unconfirmed') && !alertUser[a.id]?.ackAt);
  if (!pending.length) { const t = Math.max(0, ...i.alerts.map((a) => alertUser[a.id]?.ackAt ?? 0)); return t ? <span className="sidenote num" data-testid="acked">Acknowledged {clock(t)}</span> : null; }
  return <button className="link sr-ack" onClick={() => pending.forEach((a) => acknowledge(a.id))} title={`Acknowledge ${pending.length === 1 ? 'this alert' : `${pending.length} alerts`}: seen and taken in hand. This does not decide or verify anything.`} data-testid="ack">Acknowledge{pending.length > 1 ? ` ${pending.length} alerts` : ''}</button>;
}

/** What the issue rests on, listed in the response. Each item opens its evidence in a dialog:
 *  a reading opens its trend, a document opens at the cited passage, a report opens as reported. */
const PREVIEW = 3;
function EvidenceList({ i, focus }: { i: Issue; focus: string | null }) {
  const d = useDerived();
  const startedAt = useStore((s) => s.startedAt); const revealedAt = useStore((s) => s.revealedAt);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const t = useIncidentNow(2000);
  const setTrend = useStore((s) => s.setTrendView);
  const openViewer = useStore((s) => s.openViewer);
  const [report, setReport] = useState<Update | Rep | null>(null);
  const [all, setAll] = useState(false);
  // After a document, trend or report dialog closes, focus goes back to the item that opened it, in the same place.
  const last = useRef<HTMLElement | null>(null);
  const viewer = useStore((s) => s.viewer); const trend = useStore((s) => s.trendView);
  const openNow = !!viewer || !!trend || !!report;
  const wasOpen = useRef(false);
  useEffect(() => { if (wasOpen.current && !openNow && last.current?.isConnected) { const el = last.current; window.setTimeout(() => el.focus({ preventScroll: false }), 0); } wasOpen.current = openNow; }, [openNow]);
  const mark = (e: React.MouseEvent<HTMLElement>) => { last.current = e.currentTarget; };
  if (i.closed && !i.alerts.length && !i.updates.some((u) => u.origin === 'field' || u.origin === 'person')) return null;
  // Readings: the instruments behind the issue's alerts, the one you opened first.
  const focused = i.alerts.find((a) => a.id === focus);
  const ws = [...new Set([focused, ...[...i.alerts].reverse()].filter(Boolean).map((a) => a!.def.watcherId).filter(Boolean) as string[])].map((id) => watcherDef(id)!).filter((w) => w && w.unit !== 'status').slice(0, 3);
  // Documents: what ECC's suggestion (and the alert you opened) cites, at the revision it used.
  const recs = [focused?.def.recommendation, i.suggestion?.def.recommendation].filter(Boolean);
  const seen = new Set<string>();
  const docs = recs.flatMap((r) => r!.evidence.map((e) => ({ e, supports: r!.summary }))).filter(({ e }) => { const k = `${e.docId}:${e.revision}:${e.page}:${e.label}`; if (seen.has(k)) return false; seen.add(k); return !!d.docById.get(e.docId); });
  // Reports: what people reported about it. A report is not independently verified.
  const reports = i.updates.filter((u) => u.origin === 'field' || u.origin === 'person');
  const n = ws.length + docs.length + reports.length;
  if (!n) return null;
  return (
    <section className="ir-sec sr-evlist ir-ev" aria-labelledby="ir-h4" data-testid="evidence">
      <h3 id="ir-h4" className="ir-h">Evidence <span className="num ir-count">{n}</span></h3>
      <ul data-all={all || n <= PREVIEW} style={{ ['--preview' as string]: PREVIEW }}>
        {ws.map((w) => { const sm = sampleAt(w, t, clk); const lim = w.limits[0]; return (
          <li key={w.id}><button onMouseDown={mark} onKeyDown={(e) => { last.current = e.currentTarget; }} onClick={() => setTrend({ equipmentId: w.equipmentId, watcherId: w.id, windowMin: 15 })} data-testid="evidence-item" data-kind="reading">
            <Icon name="pulse" size={14} /><span className="t"><b>{w.equipmentId} {w.variable.toLowerCase()}</b> <span className="num">{formatValue(w, sm.value)}{w.unit === 'status' ? '' : ` ${w.unit}`}</span>, {sm.source === 'lost' ? 'signal lost' : sm.trend}</span>
            <span className="m">Simulated reading{lim ? ` · ${lim.label} limit ${lim.value} (illustrative)` : ''} · opens the trend</span>
          </button></li>
        ); })}
        {docs.map(({ e, supports }) => { const doc = d.docById.get(e.docId)!; const newer = doc.current.revision !== e.revision; return (
          <li key={`${e.docId}:${e.page}:${e.label}`}><button onMouseDown={mark} onKeyDown={(ev) => { last.current = ev.currentTarget; }} onClick={() => openViewer({ docId: e.docId, revision: e.revision, page: e.page, label: e.label, quote: e.quote, region: e.region, locate: e.locate, origin: i.title, dock: false })} data-testid="evidence-item" data-kind="document" data-doc={e.docId}>
            <Icon name="doc" size={14} /><span className="t"><b>{doc.title.replace(/ — generic guidance| — illustrative values/, '')}</b> · {e.label}</span>
            <span className="m">{doc.number} · Rev {e.revision}{newer ? ` (Rev ${doc.current.revision} now current)` : ''} · p.{e.page} · {e.locate === 'exact' ? (e.region ? 'marked region' : 'exact passage') : e.locate === 'ambiguous' ? 'several matches' : 'page only'}{supports !== i.suggestion?.def.recommendation?.summary ? ' · cited for the alert you opened' : ''}</span>
          </button></li>
        ); })}
        {reports.map((u) => (
          <li key={u.id}><button onMouseDown={mark} onKeyDown={(e) => { last.current = e.currentTarget; }} onClick={() => setReport(u)} data-testid="evidence-item" data-kind="report">
            <Icon name="person" size={14} /><span className="t"><b>{srcOf(u) || ORIGIN_LABEL[u.origin]}</b> · {u.text}</span>
            <span className="m num">{clock(u.t)} · reported, not independently verified</span>
          </button></li>
        ))}
      </ul>
      {n > PREVIEW && <button className="link ir-more" onClick={() => setAll(!all)} aria-expanded={all} data-testid="evidence-all">{all ? 'Show less' : `Show more (${n - PREVIEW})`}</button>}
      {report && <ReportDialog r={report} issue={i.title} onClose={() => setReport(null)} />}
    </section>
  );
}

/** A report shown as it was made: who, when, the words, and what that does and does not establish. */
function ReportDialog({ r, issue, onClose }: { r: Update | Rep; issue: string; onClose: () => void }) {
  useEscape(true, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const u = 'origin' in r ? r : null;
  const text = u ? u.text : (r as Rep).text;
  const who = u ? (srcOf(u) || ORIGIN_LABEL[u.origin]) : (r as Rep).by;
  const at = u ? u.t : (r as Rep).at;
  return (
    createPortal(<div className="modal-back sr-ev-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sr-ev sr-rep" role="dialog" aria-modal="true" aria-labelledby="sr-rep-h" tabIndex={-1} ref={ref} data-testid="report-dialog">
        <header className="modal-h"><span className="title" id="sr-rep-h">Report · {who}</span><span className="spacer" /><button className="iconbtn sm" onClick={onClose} aria-label="Close report" data-testid="report-dialog-close"><Icon name="close" size={14} /></button></header>
        <div className="sr-ev-b">
          <p className="sr-rep-meta num">{clock(at)} · {u?.equipmentId ?? ''}{u?.equipmentId ? ' · ' : ''}part of “{issue}”</p>
          <blockquote className="sr-rep-q" data-testid="report-dialog-text">{text}</blockquote>
          {u && u.plain !== u.text && <p className="sidenote">In plain words: {u.plain}</p>}
          <p className="sr-note"><Icon name="warn" size={13} /><span>Reported. Nobody has independently verified this. A report is evidence of what someone saw or did, not of the outcome.</span></p>
        </div>
      </div>
    </div>, document.body)
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LiveReading({ i }: { i: Issue }) {
  const startedAt = useStore((s) => s.startedAt); const revealedAt = useStore((s) => s.revealedAt);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const t = useIncidentNow(2000);
  const setTrend = useStore((s) => s.setTrendView);
  const has = (x?: typeof i.alerts[number]) => !!x?.def.watcherId && watcherDef(x.def.watcherId)?.unit !== 'status';
  const leadAlert = i.alerts.find((x) => x.id === i.lead.alertId);
  const a = has(leadAlert) ? leadAlert : has(i.suggestion ?? undefined) ? i.suggestion! : [...i.alerts].reverse().find(has);
  const w = a?.def.watcherId ? watcherDef(a.def.watcherId) : undefined;
  if (!w || i.closed) return null;
  const s = sampleAt(w, t, clk);
  return (
    <p className="sr-live" data-testid="live-reading">
      <span className="label">Now</span> {w.equipmentId} {w.variable.toLowerCase()} <b className="num">{formatValue(w, s.value)}{w.unit === 'status' ? '' : ` ${w.unit}`}</b>, {s.source === 'lost' ? 'signal lost' : s.trend}
      {w.limits[0] && <span className="sidenote"> · {w.limits[0].label} limit {w.limits[0].value} (illustrative)</span>}
      <button className="link" onClick={() => setTrend({ equipmentId: w.equipmentId, watcherId: w.id, windowMin: 15 })} data-testid="live-trend">Trend</button>
    </p>
  );
}

/** Follow-up: the actual next step once a decision is recorded, then the record of who was told, field updates and checks. */
function FollowUpSection({ i }: { i: Issue }) {
  const t = useIncidentNow(5000);
  const rec = i.suggestion?.def.recommendation;
  const lastRep = [...i.reports].reverse()[0];
  const lastVer = [...i.verifications].reverse()[0];
  const ask: Ask = i.ask;
  const dec = i.decision;
  return (
    <div className="ir-needs" data-testid="needs" data-ask={ask}>
      <FollowUp i={i} t={t} />
      {(ask === 'decision' || ask === 'deferred') && <p className="ir-p ir-quiet" data-testid="needs-line">Awaiting decision on ECC’s recommendation{ask === 'deferred' ? ` (deferred at ${clock(dec!.at)})` : ''}. The next step appears here once it is accepted.</p>}
      {ask === 'respond' && <>
        <p className="ir-p" data-testid="needs-line">{dec?.status === 'declined' ? <>ECC’s recommendation was declined at {clock(dec.at)}. Record what will be done instead, or close the issue if nothing is needed.</> : <>ECC has no recommendation for this issue. Record how it will be handled, or close it if nothing is needed.</>}</p>
        <DecisionForm i={i} />
      </>}
      {ask === 'field' && <>
        <p className="ir-p" data-testid="needs-line">{followUpDue(i, t) ? '' : 'No field update yet. '}Record what the field team reports doing when it comes in.</p>
        <ReportForm i={i} kind="reported" />
      </>}
      {ask === 'verify' && <>
        <p className="ir-p" data-testid="needs-line">{i.recheck ? <>A new update arrived at {clock(i.latest.t)}, after the last check: “{i.latest.plain}” Check it again.</> : i.reopenedAt && i.verifications.length ? <>The issue was reopened at {clock(i.reopenedAt)}, so the earlier check no longer settles it. Check it again.</> : <>The field team reported at {clock(lastRep.at)}: “{lastRep.text}” Nobody has checked that it worked; a report is not proof on its own.</>}</p>
        {rec?.verify && <p className="ir-check" data-testid="needs-check"><span className="ir-k">What to check</span>{rec.verify}</p>}
        <ReportForm i={i} kind="verified" />
        <ReportForm i={i} kind="reported" quiet />
      </>}
      {ask === 'close' && <p className="ir-p" data-testid="needs-line">{who(lastVer.by)} verified it at {clock(lastVer.at)}: “{lastVer.text}” Close the issue if no more follow-up is needed.</p>}
      {ask === 'closed' && <p className="ir-p" data-testid="needs-line">{who(i.closed!.by)} closed this issue at {clock(i.closed!.t)}{i.closed!.note ? `: “${i.closed!.note}”` : '.'}</p>}
      <History i={i} t={t} />
    </div>
  );
}

/** ECC recommends: the proposal, why, and the controls. Accept records only on Record acceptance; feedback is separate. */
function Recommends({ i, room }: { i: Issue; room: RoomData }) {
  const openIssue = useStore((s) => s.openIssue);
  const [fb, setFb] = useState(false);
  const s = i.suggestion; const rec = s?.def.recommendation;
  const dec = i.decision;
  const replaced = i.replacedBy && room.byId.get(i.replacedBy.issueId);
  if (!s || !rec) return (
    <div className="ir-rec">
      <p className="ir-p ir-quiet" data-testid="no-recommendation">ECC has no recommendation for this issue.</p>
      <DecisionStatus i={i} />
    </div>
  );
  const awaiting = !dec || dec.status === 'deferred';
  const prev = i.earlier[i.earlier.length - 1];
  return (
    <div className="ir-rec" data-testid="recommendation">
      <p className="ir-rec-t" data-testid="suggestion-text">{rec.summary}</p>
      <p className="ir-src"><span className="num">{clock(s.time)}</span> · ECC agent{s.def.evidence === 'reported' ? ' · based on a field report' : ''}</p>
      {awaiting && prev && <p className="ir-p ir-quiet" data-testid="needs-revised">ECC revised its recommendation at {clock(s.time)} after a new update. Your earlier decision ({DECISION_LABEL[prev.decision.status].toLowerCase()}, {clock(prev.decision.at)}) was on the previous one.</p>}
      {replaced && <p className="ir-warn" data-testid="needs-replaced"><Icon name="warn" size={13} /><span>Part of this recommendation was replaced at {clock(i.replacedBy!.t)}: {i.replacedBy!.reason} <button className="link" onClick={() => openIssue(replaced.id)}>Open “{replaced.title}”</button></span></p>}
      {rec.prerequisites?.map((p) => <p key={p} className="ir-warn" data-testid="prerequisite"><Icon name="warn" size={13} /><span>Before acting: {p}</span></p>)}
      <details className="ir-det">
        <summary data-testid="suggestion-steps">Why, and the {rec.actions.length} steps</summary>
        <p className="ir-why"><span className="ir-k">Why</span>{s.def.consequence}</p>
        {rec.calculation && <p className="ir-why" data-testid="calc"><span className="ir-k">{rec.calculation.label}</span>{rec.calculation.status === 'unavailable' ? `not computed: ${rec.calculation.reason}` : `${rec.calculation.value} · ${rec.calculation.basis}`}</p>}
        <ol className="ir-steps">{rec.actions.map((a) => <li key={a}>{a}</li>)}</ol>
      </details>
      <DecisionStatus i={i} />
      {awaiting ? <AcceptForm i={i} onFeedback={() => setFb(true)} feedbackOpen={fb} />
        : !fb && <div className="ir-actions"><button className="btn sm" onClick={() => setFb(true)} data-testid="feedback-open">Give feedback</button></div>}
      {fb && <FeedbackForm i={i} onDone={() => setFb(false)} />}
      <FeedbackList i={i} />
    </div>
  );
}

/** Who decided, and when; earlier decisions on a previous recommendation stay listed beneath. */
function DecisionStatus({ i }: { i: Issue }) {
  const dec = i.decision;
  const shown = dec && dec.status !== 'deferred';
  if (!shown && !i.earlier.length) return null;
  return (
    <div className="ir-decided" data-testid="lane-decision">
      {shown && <div className="ir-entry" data-testid="decision-recorded"><span><b>{DECISION_LABEL[dec!.status]}</b> by {who(dec!.by)} at <span className="num">{clock(dec!.at)}</span>{dec!.status === 'alternative' ? `: ${dec!.response}` : ''}{dec!.rationale && <span className="ir-empty"> · “{dec!.rationale}”</span>}</span><DecisionEvidence dec={dec!} /></div>}
      {i.earlier.map((e) => <div key={e.alert.id} className="ir-entry earlier" data-testid="decision-earlier"><span>{DECISION_LABEL[e.decision.status]} an earlier recommendation: {e.decision.recommendationSummary}</span><span className="ir-entry-m">{who(e.decision.by)} · {clock(e.decision.at)}</span><DecisionEvidence dec={e.decision} /></div>)}
    </div>
  );
}

/** Accept, with notes and who was told behind Add details. Nothing is recorded until Record acceptance. */
function AcceptForm({ i, onFeedback, feedbackOpen }: { i: Issue; onFeedback: () => void; feedbackOpen: boolean }) {
  const record = useStore((s) => s.recordDecision);
  const addContact = useStore((s) => s.addContact);
  const [tell, setTell] = useState<Tell>(NO_TELL);
  // A half-typed acceptance survives closing the panel, switching tabs and reloading.
  const dk = `decision:${i.key}`;
  const draft = useStore((s) => s.drafts[dk]);
  const setDraft = useStore((s) => s.setDraft);
  const clearDrafts = useStore((s) => s.clearDrafts);
  const saved = draft ? (JSON.parse(draft) as { mode: Decision['status'] | null; text: string }) : null;
  const [open, setOpenS] = useState(saved?.mode === 'approved');
  const [text, setTextS] = useState(saved?.text ?? '');
  const keep = (o: boolean, t: string) => { if (o || t) setDraft(dk, JSON.stringify({ mode: o ? 'approved' : null, text: t })); else clearDrafts(dk); };
  const setOpen = (o: boolean) => { setOpenS(o); keep(o, text); };
  const setText = (t: string) => { setTextS(t); keep(open, t); };
  const rec = i.suggestion?.def.recommendation;
  const submit = () => {
    const at = now();
    record(i.key, { status: 'approved', rationale: text.trim(), by: userLabel(), at, evidenceUsed: (rec?.evidence ?? []).map((e) => ({ docId: e.docId, revision: e.revision, page: e.page, label: e.label })), recommendationSummary: rec?.summary ?? i.title });
    if (tell.to.trim()) addContact(i.key, contactOf(tell, at, `accepted, ${rec?.summary ?? i.title}`));
    setTextS(''); setOpenS(false); clearDrafts(dk); setTell(NO_TELL);
  };
  if (!open) return (
    <div className="ir-actions" data-testid="decision-form">
      <button className="btn sm primary" onClick={() => setOpen(true)} data-testid="decide-approved">Accept</button>
      {!feedbackOpen && <button className="btn sm" onClick={onFeedback} data-testid="feedback-open">Give feedback</button>}
      <span className="ir-awaiting" data-testid="awaiting-decision">Awaiting decision</span>
    </div>
  );
  return (
    <div className="ir-accept" data-testid="decision-form">
      <p className="ir-p">Accept ECC’s recommendation? It is recorded as yours. A decision is not an action taken.</p>
      <details className="ir-det ir-add" open={!!text || !!tell.to || undefined} data-testid="decision-details">
        <summary>Add details <span className="ir-src">notes, who you told</span></summary>
        <label className="ir-k" htmlFor="sr-dec-t">Note or instructions for the field team</label>
        <textarea id="sr-dec-t" className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} data-testid="rationale" />
        <TellFields v={tell} set={setTell} idp="decision" />
      </details>
      <div className="row">
        <button className="btn primary sm" onClick={submit} data-testid="record-decision">Record acceptance</button>
        <button className="btn sm" onClick={() => { setOpen(false); setTextS(''); clearDrafts(dk); setTell(NO_TELL); }} data-testid="decision-cancel">Cancel</button>
        <span className="ir-src">Recorded as {who(userLabel())}</span>
      </div>
    </div>
  );
}

/** How the issue will be handled when ECC has nothing to accept: no recommendation, or the recommendation was declined. */
function DecisionForm({ i }: { i: Issue }) {
  const record = useStore((s) => s.recordDecision);
  const [text, setText] = useState('');
  const rec = i.suggestion?.def.recommendation;
  return (
    <div className="sr-decide-f" data-testid="decision-form">
      <label className="ir-k" htmlFor="sr-resp-t">What will be done</label>
      <textarea id="sr-resp-t" className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} data-testid="rationale" />
      <div className="row"><button className="btn primary sm" disabled={!text.trim()} onClick={() => { record(i.key, { status: 'alternative', rationale: '', response: text.trim(), by: userLabel(), at: now(), evidenceUsed: (rec?.evidence ?? []).map((e) => ({ docId: e.docId, revision: e.revision, page: e.page, label: e.label })), recommendationSummary: rec?.summary ?? i.title }); setText(''); }} data-testid="record-decision">Record response</button></div>
    </div>
  );
}

const REASONS = ['Wrong for this situation', 'Evidence missing or wrong', 'Unclear wording', 'Not practical on site', 'Too early or too late', 'Other'];
/** What should ECC improve? Saved with the proposal exactly as shown, for review; it does not change ECC automatically. */
function FeedbackForm({ i, onDone }: { i: Issue; onDone: () => void }) {
  const save = useStore((s) => s.saveFeedback);
  const record = useStore((s) => s.records[s.incidentId]);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'edit' | 'saving' | 'saved' | 'error'>('edit');
  const s = i.suggestion!; const rec = s.def.recommendation!;
  const version = record?.events.find((e) => e.kind === 'recommendation' && (e as { alertId?: string }).alertId === s.id)?.id ?? `rec-${s.id}`;
  const submit = async () => {
    setState('saving');
    const res = await save({ issueId: i.id, issueTitle: i.title, proposal: { alertId: s.id, version, summary: rec.summary, actions: rec.actions }, evidence: rec.evidence.map((e) => ({ docId: e.docId, revision: e.revision, page: e.page, label: e.label })), comment: comment.trim(), reason: reason || undefined });
    setState(res.ok ? 'saved' : 'error');
    if (res.ok) window.setTimeout(onDone, 2500);
  };
  if (state === 'saved') return <p className="ir-saved" role="status" data-testid="feedback-saved"><Icon name="check" size={13} />Feedback saved with this recommendation.</p>;
  return (
    <div className="ir-feedback" data-testid="feedback-form">
      <label className="ir-k" htmlFor="ir-fb-t">What should ECC improve?</label>
      <textarea id="ir-fb-t" className="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="For example: it should have asked whether the deluge was isolated first" data-testid="feedback-text" autoFocus />
      <div className="row">
        <select className="input sm" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason (optional)" data-testid="feedback-reason"><option value="">Reason (optional)</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        <button className="btn primary sm" disabled={!comment.trim() || state === 'saving'} onClick={() => void submit()} data-testid="feedback-save">Save feedback</button>
        <button className="btn sm" onClick={onDone}>Cancel</button>
      </div>
      <p className="ir-src">Saved with this recommendation and the evidence it cited, for review by the ECC team. It does not change ECC automatically, and it is not a decision.</p>
      {state === 'error' && <p className="ir-warn"><Icon name="warn" size={13} /><span>Not saved. Your comment is kept; try again.</span></p>}
    </div>
  );
}

/** Feedback already given on this recommendation, kept with it for later review. */
function FeedbackList({ i }: { i: Issue }) {
  const record = useStore((s) => s.records[s.incidentId]);
  const list = (record?.feedback ?? []).filter((f) => f.proposal.alertId === i.suggestion?.id);
  if (!list.length) return null;
  return (
    <details className="ir-det ir-fblist" data-testid="feedback-list">
      <summary>Feedback on this recommendation ({list.length})</summary>
      <ul>{list.map((f) => <li key={f.id} data-testid="feedback-item"><span>“{f.comment}”{f.reason && <span className="ir-src"> · {f.reason}</span>}</span><span className="ir-src">{who(f.by)} · <span className="num">{clock(f.t)}</span> · for review</span></li>)}</ul>
    </details>
  );
}

type Tell = { to: string; via: Contact['via']; within: number; note?: string };
const NO_TELL: Tell = { to: '', via: 'Radio', within: 15 };
const VIA: Contact['via'][] = ['Radio', 'Phone', 'In person', 'Message', 'Other'];
const WITHIN = [0, 10, 15, 30, 60];
const PEOPLE = ['Fire team leader', 'Incident Commander', 'Operations supervisor', 'Control room operator', 'Maintenance lead'];
const contactOf = (t: Tell, at: number, decision?: string, followUpOf?: string): Contact => ({ id: `c-${at}-${Math.random().toString(36).slice(2, 6)}`, at, by: userLabel(), to: t.to.trim(), via: t.via, note: t.note?.trim() || undefined, expectBy: t.within ? at + t.within * 60_000 : undefined, decision, followUpOf });

/** Who you told, how, and when you expect to hear back. Optional, one line; ECC records it and sends nothing. */
function TellFields({ v, set, idp, required }: { v: Tell; set: (t: Tell) => void; idp: string; required?: boolean }) {
  return (
    <div className="ir-tell" data-testid={`${idp}-tell`}>
      <div className="ir-tell-row">
        <label className="ir-tell-l" htmlFor={`${idp}-to`}>Told{!required && <span className="ir-opt"> · optional</span>}</label>
        <input id={`${idp}-to`} className="input sm ir-tell-to" list="ir-people" placeholder="Who, e.g. Fire team leader" value={v.to} onChange={(e) => set({ ...v, to: e.target.value })} data-testid={`${idp}-to`} />
        <select className="input sm" aria-label="How" value={v.via} onChange={(e) => set({ ...v, via: e.target.value as Contact['via'] })} data-testid={`${idp}-via`}>{VIA.map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input sm" aria-label="When to expect an update" value={v.within} onChange={(e) => set({ ...v, within: +e.target.value })} data-testid={`${idp}-within`}>{WITHIN.map((m) => <option key={m} value={m}>{m ? `Expect update in ${m} min` : 'No follow-up'}</option>)}</select>
      </div>
      <datalist id="ir-people">{PEOPLE.map((x) => <option key={x} value={x} />)}</datalist>
      {v.to.trim() && <p className="ir-tell-hint">Recorded in the issue history. ECC does not send messages{v.within ? `; if no field update comes in within ${v.within} min, the issue shows Follow-up due` : ''}.</p>}
    </div>
  );
}

/** Record who you told after the decision, or a follow-up on an earlier contact. */
function ContactForm({ i, follow, onDone }: { i: Issue; follow?: Contact; onDone: () => void }) {
  const add = useStore((s) => s.addContact);
  const [v, set] = useState<Tell>(follow ? { to: follow.to, via: follow.via, within: 15 } : NO_TELL);
  const idp = follow ? 'followup' : 'contact';
  return (
    <div className="sr-decide-f ir-contact" data-testid={`${idp}-form`}>
      <TellFields v={v} set={set} idp={idp} required />
      <input className="input sm" placeholder={follow ? 'What you heard, or what you asked (optional)' : 'Note (optional)'} value={v.note ?? ''} onChange={(e) => set({ ...v, note: e.target.value })} data-testid={`${idp}-note`} />
      <div className="row">
        <button className="btn primary sm" disabled={!v.to.trim()} onClick={() => { add(i.key, contactOf(v, now(), i.decision ? `${DECISION_LABEL[i.decision.status].toLowerCase()}, ${i.decision.response ?? i.decision.recommendationSummary}` : undefined, follow?.id)); onDone(); }} data-testid={`${idp}-save`}>{follow ? 'Record follow-up' : 'Record'}</button>
        <button className="btn sm" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Each contact on one line, with what came of it: an update received, still waiting, or a follow-up due. */
function ContactLines({ i, t }: { i: Issue; t: number }) {
  const [adding, setAdding] = useState(false);
  const heardAfter = (c: Contact) => [...i.reports, ...i.verifications].find((r) => r.at >= c.at);
  return (
    <>
      {i.contacts.map((c) => {
        const h = heardAfter(c); const late = !h && c.expectBy && t >= c.expectBy && !i.closed && i.contacts[i.contacts.length - 1] === c;
        return (
          <div key={c.id} className="ir-entry" data-testid="contact" data-followup={c.followUpOf ? 'true' : undefined}>
            <span>{c.followUpOf ? 'Followed up with' : 'Told'} <b>{c.to}</b> by {c.via.toLowerCase()}{c.note ? <span className="ir-empty"> · “{c.note}”</span> : null}</span>
            <span className="ir-entry-m">{who(c.by)} · {clock(c.at)}{c.expectBy ? ` · update expected by ${clock(c.expectBy)}` : ''}{h ? ` · field update received ${clock(h.at)}` : late ? '' : c.expectBy ? ' · waiting' : ''}{late && <span className="ir-late" data-testid="contact-late"> · no update yet</span>}</span>
          </div>
        );
      })}
      {!i.closed && (adding ? <ContactForm i={i} onDone={() => setAdding(false)} /> : <button className="link ir-close-link" onClick={() => setAdding(true)} data-testid="contact-open">Record who you told</button>)}
    </>
  );
}

/** When an expected update has not come in: say so plainly, once, with a way to record the follow-up. */
function FollowUp({ i, t }: { i: Issue; t: number }) {
  const due = followUpDue(i, t);
  const [open, setOpen] = useState(false);
  if (!due) return null;
  const c = due.contact;
  return (
    <div className="ir-followup" data-testid="followup-due">
      <p className="ir-warn"><Icon name="warn" size={13} /><span>No field update since you {c.followUpOf ? 'followed up with' : 'told'} {c.to} at {clock(c.at)}. You expected one by {clock(c.expectBy!)}.</span></p>
      {open ? <ContactForm i={i} follow={c} onDone={() => setOpen(false)} /> : <button className="link" onClick={() => setOpen(true)} data-testid="followup-open">Record follow-up</button>}
    </div>
  );
}

function ReportForm({ i, kind, quiet }: { i: Issue; kind: 'reported' | 'verified'; quiet?: boolean }) {
  const add = useStore((s) => s.addReport);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [by, setBy] = useState(kind === 'reported' ? 'Fire team leader (field)' : who(userLabel()));
  const p = kind === 'reported' ? 'report' : 'verify';
  if (!open) return quiet ? <button className="link ir-close-link" onClick={() => setOpen(true)} data-testid={`${p}-open`}>Add a later field update</button>
    : <button className={`btn sm ${i.ask === (kind === 'reported' ? 'field' : 'verify') ? 'primary' : ''}`} onClick={() => setOpen(true)} data-testid={`${p}-open`}><Icon name="plus" size={13} />{kind === 'reported' ? 'Record field update' : 'Record verification'}</button>;
  return (
    <div className="sr-decide-f" data-testid={`${p}-form`}>
      <label className="label" htmlFor={`sr-${p}-t`}>{kind === 'reported' ? 'What the field team reports doing' : 'What was checked, and how'}</label>
      <textarea id={`sr-${p}-t`} className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'reported' ? 'For example: mobile monitors set up on the D-0001 shell' : 'For example: water seen on the shell from the north road'} data-testid={`${p}-text`} autoFocus />
      <div className="row">
        <input className="input sm" style={{ width: 200 }} value={by} onChange={(e) => setBy(e.target.value)} aria-label={kind === 'reported' ? 'Reported by' : 'Checked by'} data-testid={`${p}-by`} />
        <button className="btn primary sm" disabled={!text.trim() || !by.trim()} onClick={() => { add(i.key, { id: `r-${now()}`, at: now(), by: by.trim(), text: text.trim(), status: kind }); setText(''); setOpen(false); }} data-testid={`${p}-save`}>{kind === 'reported' ? 'Record as reported' : 'Record as verified'}</button>
        <button className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/** The documents a decision relied on, at the revisions it used. */
function DecisionEvidence({ dec }: { dec: Decision }) {
  if (!dec.evidenceUsed.length) return null;
  return <details className="ir-det ir-dev" data-testid="decision-evidence"><summary>Documents relied on ({dec.evidenceUsed.length})</summary><span className="sr-dev">{dec.evidenceUsed.map((e, n) => <Citation key={n} cite={{ docId: e.docId, revision: e.revision, page: e.page, label: e.label }} origin={`Decision · ${dec.recommendationSummary}`} dock />)}</span></details>;
}

/** One row of the response record. Defined once, outside the component, so a re-render (the clock ticks every few
 *  seconds) never remounts it: what is open inside it, such as the documents a decision relied on or a half-filled
 *  form, stays open. */
function Row({ k, children, empty, testid }: { k: string; children?: React.ReactNode; empty: string; testid: string }) {
  return <div className="ir-row" data-testid={testid}><dt>{k}</dt><dd>{children ?? <span className="ir-empty">{empty}</span>}</dd></div>;
}

/** The record under Follow-up: who was told, what the field team reports doing, and what was verified, each kept apart. */
function History({ i, t }: { i: Issue; t: number }) {
  const dec = i.decision;
  const any = (!!dec && dec.status !== 'deferred') || i.reports.length > 0 || i.verifications.length > 0 || i.contacts.length > 0;
  if (!any) return null;
  const rep = (r: Rep) => <div key={r.id} className="ir-entry" data-testid={r.status === 'verified' ? 'verification' : 'field-report'}><span>{r.text}</span><span className="ir-entry-m">{who(r.by)} · {clock(r.at)}{r.status === 'reported' ? ' · reported, not verified' : ''}</span></div>;
  return (
    <dl className="ir-dl" data-testid="sec-sofar">
      {(i.contacts.length > 0 || dec) && <Row k="Told" testid="lane-told" empty="">{<ContactLines i={i} t={t} />}</Row>}
      <Row k="Field update" testid="lane-field" empty="Nothing reported yet">{i.reports.length ? <>{i.reports.map(rep)}</> : undefined}</Row>
      <Row k="Verified" testid="lane-verified" empty={i.reports.length ? 'Not checked yet. A field report is not proof.' : 'Not checked yet'}>{i.verifications.length ? <>{i.verifications.map(rep)}</> : undefined}</Row>
    </dl>
  );
}

function CloseArea({ i }: { i: Issue }) {
  const closeIssue = useStore((s) => s.closeIssue);
  const reopenIssue = useStore((s) => s.reopenIssue);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { setOpen(false); setNote(''); }, [i.closed?.t]);
  if (i.closed) return (
    <section className="sr-close closed" data-testid="closed-area">
      <p><Icon name="check" size={13} /> Closed {clock(i.closed.t)} by {who(i.closed.by)}{i.closed.note ? `: “${i.closed.note}”` : ''}</p>
      {i.history.length > 1 && <p className="sidenote" data-testid="issue-history">{i.history.map((h) => `${h.kind === 'closed' ? 'Closed' : 'Reopened'} ${clock(h.t)} by ${who(h.by)}`).join(' · ')}</p>}
      {!open ? <button className="btn sm" onClick={() => setOpen(true)} data-testid="reopen-open">Reopen issue</button> : (
        <div className="sr-decide-f">
          <label className="label" htmlFor="sr-reopen">Why reopen it? (recorded)</label>
          <textarea id="sr-reopen" className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="reopen-note" autoFocus />
          <div className="row"><button className="btn primary sm" disabled={!note.trim()} onClick={() => reopenIssue(i.id, i.title, note.trim())} data-testid="reopen-confirm">Reopen issue</button><button className="btn sm" onClick={() => setOpen(false)}>Cancel</button></div>
        </div>
      )}
    </section>
  );
  const gaps = [
    ...(!i.decision || i.decision.status === 'deferred' ? ['No decision is recorded'] : []),
    ...(i.decided && !i.reported ? ['The field team has not reported back'] : []),
    ...(i.decided && !i.verified ? [i.reopenedAt ? 'Nobody has checked it again since the issue was reopened' : 'Nobody has verified that the response worked'] : []),
  ];
  const ready = i.ask === 'close';
  return (
    <section className={`sr-close ${ready ? 'ready' : ''}`} data-testid="close-area">
      {!open ? <button className={ready ? 'btn sm primary' : 'link ir-close-link'} onClick={() => setOpen(true)} data-testid="close-open">Close issue…</button> : (
        <div className="sr-decide-f" data-testid="close-form">
          <b>Close this issue?</b>
          {gaps.length ? <ul className="sr-gaps" data-testid="close-gaps">{gaps.map((g) => <li key={g}><Icon name="warn" size={12} />{g}</li>)}</ul> : <p className="sidenote">Decision, field report and verification are recorded.</p>}
          <label className="label" htmlFor="sr-close-n">Why follow-up can end (recorded)</label>
          <textarea id="sr-close-n" className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="close-note" autoFocus />
          <div className="row"><button className="btn primary sm" disabled={!note.trim()} onClick={() => closeIssue(i.id, i.title, note.trim())} data-testid="close-confirm">Close issue</button><button className="btn sm" onClick={() => setOpen(false)}>Cancel</button><span className="sidenote">It moves to Closed and can be reopened.</span></div>
        </div>
      )}
    </section>
  );
}

/** An update on its own: one that needs placing, is information only, or is being moved. */
export function UpdatePanel({ u, room }: { u: Update; room: RoomData }) {
  const place = useStore((s) => s.placeUpdate);
  const openIssue = useStore((s) => s.openIssue);
  const reopen = useStore((s) => s.reopenIssue);
  const setRoom = useStore((s) => s.setRoom);
  const record = useStore((s) => s.records[s.incidentId]);
  const inv = u.invId ? record?.investigations?.find((x) => x.id === u.invId) : undefined;
  const sub = useStore((s) => s.room.sub);
  const d = useDerived();
  // A placed update shows where it is; Move (or arriving from the feed's Move) opens the chooser.
  const [moving, setMoving] = useState(sub === 'place');
  useEffect(() => { if (sub === 'place') setMoving(true); }, [sub]);
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h.current?.focus(); }, [u.id]);
  const closed = u.place.closedIssue ? room.byId.get(u.place.closedIssue) : undefined;
  const suggested = u.place.suggest && !closed ? room.byId.get(u.place.suggest) : undefined;
  const others = room.open.filter((x) => x.id !== suggested?.id);
  const current = u.place.issueId;
  const [pick, setPick] = useState<string>(suggested?.id ?? (current && current !== 'info' ? current : '') ?? '');
  const [title, setTitle] = useState(u.plain.length > 80 ? `${u.plain.slice(0, 77)}…` : u.plain);
  const done = (id: string) => { if (id === 'info') setRoom({ sub: 'main' }); else openIssue(id, { focus: u.id }); };
  const confirm = () => {
    if (!pick) return;
    setMoving(false);
    const label = u.plain.length > 90 ? `${u.plain.slice(0, 87)}…` : u.plain;
    if (pick === 'new') done(place(u.id, { title: title.trim(), equipmentId: u.equipmentId }, label));
    else done(place(u.id, pick, label, pick === 'info' ? 'Information only' : room.byId.get(pick)?.title));
  };
  return (
    <aside key={useStore.getState().room.sub} className="sr-panel ir ir-upd" aria-labelledby="sr-u-title" data-testid="update-panel" data-update={u.id} data-place={u.place.kind}>
      <PanelHead eyebrow={inv ? 'Report' : 'Update'} pill={<>{u.place.kind === 'review' ? <span className="sr-ask ask-review" data-testid="panel-ask">About a closed issue</span> : u.place.kind === 'info' ? <span className="sr-ask ask-closed">Information only</span> : null}{inv && <span data-testid="concern-bar" data-kind={inv.kind}><AnalysisChip inv={inv} /></span>}</>} />
      <div className="sr-pb ir-b">
        <div className="sr-meta"><OriginTag o={u.origin} /><span className="num">{clock(u.t)}</span>{srcOf(u) && <span>· {srcOf(u)}</span>}{u.equipmentId && <span>· {u.equipmentId}</span>}{u.severity && <SeverityChip s={u.severity} />}</div>
        <h2 id="sr-u-title" className="sr-title" ref={h} tabIndex={-1} data-testid={inv ? 'concern-label' : 'update-title'}>{u.plain}</h2>
        {u.text !== u.plain && <p className="sr-quote" data-testid="update-original"><span className="label">As {u.origin === 'monitoring' ? 'raised' : 'reported'}</span>{u.text}</p>}
        {(u.place.kind === 'opens' || u.place.kind === 'joins' || u.place.kind === 'info') && !moving ? (
          <section className="sr-placed" data-testid="place-current">
            {u.place.kind === 'info' ? <span>Recorded as information only{u.place.who ? ` by ${u.place.who}` : ''}.</span>
              : <span>Part of the issue <b>“{room.byId.get(u.place.issueId!)?.title ?? u.place.issueId}”</b>{u.place.by === 'person' ? `, placed by ${u.place.who}` : ''}.</span>}
            <span className="row">
              {u.place.issueId && u.place.kind !== 'info' && <button className="btn sm primary" onClick={() => openIssue(u.place.issueId!, { focus: u.id })} data-testid="update-open-issue">Open issue</button>}
              <button className="btn sm" onClick={() => setMoving(true)} data-testid="update-move">Move</button>
            </span>
          </section>
        ) : closed ? (
          <section className="sr-sec need" data-testid="place-closed">
            <h3>This update is about a closed issue</h3>
            <p>“{closed.title}” was closed at {clock(closed.closed!.t)} by {who(closed.closed!.by)}{closed.closed!.note ? `: “${closed.closed!.note}”` : '.'}</p>
            <p>Decide whether this update changes that.</p>
            <div className="row wrap">
              <button className="btn primary sm" onClick={() => { reopen(closed.id, closed.title, `New update: ${u.plain}`); place(u.id, closed.id, u.plain, closed.title); openIssue(closed.id, { focus: u.id }); }} data-testid="place-reopen">Reopen the issue and add this</button>
              <button className="btn sm" onClick={() => { place(u.id, 'info', u.plain, 'Information only'); setRoom({ sub: 'main' }); }} data-testid="place-keep-closed">Keep it closed: information only</button>
            </div>
          </section>
        ) : (
          <section className="sr-sec need" data-testid="place-form">
            <h3>{u.place.kind === 'review' ? 'Where does this update belong?' : 'Move this update'}</h3>
            {u.place.kind === 'review' && <p className="sidenote" data-testid="place-reason">{u.place.reason}</p>}
            <div className="sr-place-opts" role="radiogroup" aria-label="Place this update">
              {suggested && <PlaceOpt id={suggested.id} pick={pick} setPick={setPick} title={suggested.title} sub={`ECC suggests this · ${ASK_LABEL[suggested.ask].toLowerCase()}`} tag="Suggested" />}
              {others.map((x) => <PlaceOpt key={x.id} id={x.id} pick={pick} setPick={setPick} title={x.title} sub={`${x.equipment.join(', ') || 'No equipment'} · ${ASK_LABEL[x.ask].toLowerCase()}`} current={x.id === current} />)}
              <PlaceOpt id="new" pick={pick} setPick={setPick} title="Open a new issue" sub="It needs its own response" />
              {pick === 'new' && <input className="input sm sr-new-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New issue title" data-testid="place-new-title" />}
              <PlaceOpt id="info" pick={pick} setPick={setPick} title="Information only" sub="Kept in the feed and the record; no follow-up" current={current === 'info'} />
            </div>
            <div className="row"><button className="btn primary sm" disabled={!pick || (pick === 'new' && !title.trim()) || pick === current} onClick={confirm} data-testid="place-confirm">{pick === 'new' ? 'Open issue' : pick === 'info' ? 'Record as information' : 'Add to issue'}</button>{moving && <button className="btn sm" onClick={() => setMoving(false)}>Cancel</button>}<span className="sidenote">Recorded as {who(userLabel())}.</span></div>
          </section>
        )}
        {inv && record && <section className="sr-sec sr-concern" data-testid="update-assessment"><h3>ECC’s assessment of this report</h3><ConcernResponse inv={inv} record={record} d={d} /></section>}
        {inv && record && sub === 'evidence' && <EvidenceDialog title={u.plain}><ConcernSources inv={inv} record={record} d={d} /></EvidenceDialog>}
      </div>
    </aside>
  );
}

function PlaceOpt({ id, pick, setPick, title, sub, tag, current }: { id: string; pick: string; setPick: (v: string) => void; title: string; sub: string; tag?: string; current?: boolean }) {
  return (
    <label className={`sr-opt ${pick === id ? 'on' : ''}`} data-testid={`place-opt-${id}`}>
      <input type="radio" name="sr-place" checked={pick === id} onChange={() => setPick(id)} />
      <span className="grow"><span className="t">{title}{tag && <span className="sr-tag">{tag}</span>}{current && <span className="sr-tag">Current</span>}</span><span className="m">{sub}</span></span>
    </label>
  );
}

export { ORIGIN_LABEL };
