import { useEffect, useRef, useState } from 'react';
import { useAgentDisplay } from '../lib/agentStatus';
import { agentStateOf } from '../lib/agent';
import { tokenize } from '../lib/retrieval';
import { clock, dateTime } from '../lib/time';
import { groupPassages, PassageCard } from '../pages/Knowledge';
import { observationText } from '../investigate/engine';
import { analysisOf, ANALYSIS_LABEL, outcomeOf } from '../investigate/followThrough';
import { OBSERVATION_SOURCE, type EvidenceItem, type IncidentRecord, type Investigation, type InvestigationResponse } from '../record/types';
import { useStore } from '../store';
import { Citation } from '../ui/Citation';
import { Icon } from '../ui/Icon';

const scopeLine = (inv: Investigation) => `${inv.scope.sites.length ? inv.scope.sites.join(', ') : 'All sites'} · ${inv.scope.types.length ? inv.scope.types.join(', ') : 'all content'}`;
const contextLine = (inv: Investigation) => [inv.context.equipmentId, inv.context.alertTitle ? `Alert: ${inv.context.alertTitle}` : '', inv.context.location].filter(Boolean).join(' · ');
const STATE_ATTR: Record<InvestigationResponse['state'], string> = { answered: 'answered', conflict: 'conflict', insufficient: 'insufficient', passages: 'results', empty: 'empty', error: 'error' };

/** Open a recommendation in the existing response workspace. No decision is made or duplicated here. */
export function useOpenInWorkspace(originInv?: string) {
  const openRecommendation = useStore((s) => s.openRecommendation); const showPanel = useStore((s) => s.showPanel); const maximize = useStore((s) => s.maximize); const layout = useStore((s) => s.layout);
  return (alertId: string) => { showPanel('situation.response'); if (layout.maximized && layout.maximized !== 'response') maximize(null); openRecommendation(alertId, originInv); };
}
/** Bring this entry into the Investigation window. Where the Assistant would cover it, the Assistant steps aside. */
function useOpenConcern() {
  const selectConcern = useStore((s) => s.selectConcern); const setNav = useStore((s) => s.setNav); const showPanel = useStore((s) => s.showPanel); const setOpen = useStore((s) => s.setAssistantOpen); const width = useStore((s) => s.assistantWidth); const maximize = useStore((s) => s.maximize); const layout = useStore((s) => s.layout);
  return (id: string) => { setNav('situation'); showPanel('situation.response'); if (layout.maximized && layout.maximized !== 'response') maximize(null); selectConcern(id, 'response'); if (window.innerWidth - width < 1400) setOpen(false); };
}

export function InvestigationEntry({ inv, record, replyRef }: { inv: Investigation; record: IncidentRecord; replyRef?: React.Ref<HTMLDivElement> }) {
  const focus = useStore((s) => s.focusInvestigation);
  const setFocus = useStore((s) => s.setFocusInvestigation);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus === inv.id && ref.current) { ref.current.scrollIntoView({ block: 'start' }); setFocus(null); } }, [focus, inv.id, setFocus]);
  const latest = inv.responses[inv.responses.length - 1];
  const earlier = inv.responses.slice(0, -1).reverse();
  const question = inv.kind === 'question' ? inv.text : (record.events.find((e) => e.id === inv.observationEventId)?.meta?.question as string | null);
  return (
    <div className="inv" ref={ref} data-testid="investigation" data-id={inv.id} data-kind={inv.kind} data-status={inv.status} data-revisions={inv.responses.length}>
      {inv.kind === 'question'
        ? <div className="as-q" data-testid="assistant-user"><div>{inv.text}</div><div className="sidenote">{clock(inv.t)} · {scopeLine(inv)}</div>{contextLine(inv) && <div className="sidenote" data-testid="question-context">{contextLine(inv)}</div>}</div>
        : <ObservationCard inv={inv} record={record} question={question} />}
      {inv.status === 'running' && <Progress inv={inv} />}
      {inv.status === 'queued' && <Pending inv={inv} record={record} />}
      {inv.status === 'needs-clarification' && <Clarify inv={inv} record={record} />}
      {inv.clarification?.answeredAt && <div className="as-obs-amend sidenote" data-testid="clarification-answered">{inv.clarification.question} Answered {clock(inv.clarification.answeredAt)}: {[inv.clarification.answer, inv.clarification.answerLocation, inv.clarification.answerText].filter(Boolean).join(' · ')}</div>}
      {inv.status === 'failed' && <Failed inv={inv} />}
      <FollowBar inv={inv} />
      {latest && inv.status !== 'running' && (
        <div className="as-a" ref={replyRef} data-testid="assistant-reply" data-state={STATE_ATTR[latest.state]} data-revision={latest.revision}>
          <ResponseBody r={latest} inv={inv} record={record} question={question || inv.text} />
          {earlier.length > 0 && (
            <details className="inv-more" data-testid="earlier-assessments">
              <summary>{earlier.length} earlier {earlier.length === 1 ? 'assessment' : 'assessments'} kept</summary>
              {earlier.map((r) => <div key={r.id} className="inv-earlier" data-testid="earlier-assessment"><ResponseBody r={r} inv={inv} record={record} question={question || inv.text} superseded /></div>)}
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ObservationCard({ inv, record, question }: { inv: Investigation; record: IncidentRecord; question: string | null | undefined }) {
  const ev = record.events.find((e) => e.id === inv.observationEventId);
  const amend = useStore((s) => s.amendObservation);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!ev) return null;
  const { original, current, amendedAt } = observationText(record, inv);
  const m = ev.meta ?? {};
  const closed = record.status === 'closed';
  const save = async () => { const res = await amend(ev.id, text.trim()); if (res.ok) { setEditing(false); setText(''); setErr(null); } else setErr(res.error); };
  return (
    <div className="as-obs" data-testid="assistant-observation">
      <div className="as-obs-h"><span className="chip outline" data-testid="observation-label">Reported · {OBSERVATION_SOURCE[m.sourceType as keyof typeof OBSERVATION_SOURCE] ?? 'Reported'}</span><span className="spacer" />{!closed && !editing && <button className="link" onClick={() => { setEditing(true); setText(current); }} data-testid="observation-amend">Amend</button>}</div>
      <div data-testid="observation-original">{original}</div>
      {amendedAt != null && <div className="as-obs-amend" data-testid="observation-amended">Amended {clock(amendedAt)}: {current}<div className="sidenote">The original wording is retained above.</div></div>}
      {question && <div className="sidenote" data-testid="observation-question">Asked: {question}</div>}
      <div className="sidenote" data-testid="observation-attribution">{[m.sourceDetail ? String(m.sourceDetail) : '', `Observed ${clock(Number(m.observedAt))}`, `received ${clock(Number(m.receivedAt))}`, `submitted by ${ev.by}`].filter(Boolean).join(' · ')}</div>
      {contextLine(inv) && <div className="sidenote">{contextLine(inv)}</div>}
      <div className="sidenote">Submitting a report does not verify it, and does not change equipment state or alerts.</div>
      {editing && (
        <div className="decision" style={{ marginTop: 6 }}>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} aria-label="Amended wording" data-testid="amend-text" />
          <div className="row"><button className="btn primary sm" disabled={!text.trim() || text.trim() === current} onClick={() => void save()} data-testid="amend-save">Save amendment</button><button className="btn sm" onClick={() => setEditing(false)}>Cancel</button></div>
          {err && <div className="supnote" data-testid="amend-error"><Icon name="warn" size={13} />Not saved: {err}. Your wording is kept.</div>}
        </div>
      )}
    </div>
  );
}

function Progress({ inv }: { inv: Investigation }) {
  const p = useStore((s) => s.investigationProgress);
  return <div className="inv-progress" data-testid="investigation-progress" role="status"><span className="inv-dot" />{p?.id === inv.id ? p.label : 'Starting the investigation'}<span className="sidenote"> · simulated</span></div>;
}

function Pending({ inv, record }: { inv: Investigation; record: IncidentRecord }) {
  const a = useAgentDisplay();
  const { agentResume, agentStart } = useStore.getState();
  const state = agentStateOf(record);
  const closed = record.status === 'closed';
  if (closed) return <div className="inv-pending" data-testid="investigation-pending" data-reason="closed">Not analysed: the incident was closed before the agent reached this. It stays in the record.</div>;
  if (state === 'running') return <div className="inv-progress" data-testid="investigation-progress" role="status"><span className="inv-dot" />Waiting to start<span className="sidenote"> · simulated</span></div>;
  const what = inv.kind === 'observation' ? 'The observation is recorded.' : 'Your question is saved.';
  const why = state === 'paused' ? 'The agent is paused.' : state === 'stopped' ? 'The agent is stopped.' : state === 'error' ? 'The agent stopped with an error.' : 'The agent has not started.';
  return (
    <div className="inv-pending" data-testid="investigation-pending" data-reason={state}>
      <div><b>Analysis has not started.</b> {what} {why}</div>
      <div className="row">
        {state === 'paused' ? <button className="btn sm" onClick={() => void agentResume(a.received)} data-testid="pending-resume">Resume agent</button> : <button className="btn sm" onClick={() => void agentStart({ reason: 'Started from the Assistant' })} data-testid="pending-start">{state === 'not-started' ? 'Start agent' : 'Start agent again'}</button>}
      </div>
    </div>
  );
}

function Clarify({ inv, record }: { inv: Investigation; record: IncidentRecord }) {
  const answer = useStore((s) => s.answerClarification);
  const [eq, setEq] = useState('');
  const [location, setLocation] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const c = inv.clarification; if (!c) return null;
  const send = async (a: { equipmentId?: string; location?: string; text?: string }) => { setErr(null); const res = await answer(record.id, inv.id, a); if (!res.ok) setErr(res.error); };
  return (
    <div className="inv-pending" data-testid="investigation-clarify">
      <div data-testid="clarify-question"><b>{c.question}</b></div>
      {inv.kind === 'observation' && <div className="sidenote" data-testid="clarify-context">About your report: "{inv.text}"</div>}
      {c.options.length > 0 && <div className="inv-options">{c.options.map((o) => <button key={o.equipmentId} className="btn sm" aria-pressed={eq === o.equipmentId} onClick={() => { if (c.needsBasis) setEq(eq === o.equipmentId ? '' : o.equipmentId); else void send({ equipmentId: o.equipmentId }); }} data-testid={`clarify-${o.equipmentId}`}>{o.label}</button>)}</div>}
      {c.needsBasis && (
        <>
          {c.options.length > 0 && <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Or a location" aria-label="Location" data-testid="clarify-location" />}
          <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was observed, and when" aria-label="What was observed, and when" data-testid="clarify-text" />
          <div className="row"><button className="btn primary sm" disabled={!eq && !location.trim() && !text.trim()} onClick={() => void send({ equipmentId: eq || undefined, location: location.trim() || undefined, text: text.trim() || undefined })} data-testid="clarify-send">Send answer</button></div>
        </>
      )}
      {err && <div className="supnote" data-testid="clarify-error"><Icon name="warn" size={13} />Not saved: {err}. Your answer is kept.</div>}
      <div className="sidenote">Your answer is added to the same record. The original wording stays as it was. If you cannot answer yet, this stays pending.</div>
    </div>
  );
}

function Failed({ inv }: { inv: Investigation }) {
  const retry = useStore((s) => s.retryInvestigation);
  return <div className="inv-pending" data-testid="investigation-failed"><div><b>Analysis failed.</b> {inv.failure ?? ''} The entry is saved and retrying will not duplicate it.</div><div className="row"><button className="btn sm" onClick={() => void retry(inv.id)} data-testid="investigation-retry">Retry analysis</button></div></div>;
}

/** Status, outcome and the link into the Investigation window. */
function FollowBar({ inv }: { inv: Investigation }) {
  const open = useOpenConcern();
  const o = outcomeOf(inv);
  return <div className="inv-follow" data-testid="investigation-follow"><span className={`chip analysis a-${analysisOf(inv)}`} data-testid="analysis-status" data-status={analysisOf(inv)}>{ANALYSIS_LABEL[analysisOf(inv)]}</span>{o && <span className="sidenote" data-testid="assistant-outcome">{o.label}</span>}<span className="spacer" /><button className="link" onClick={() => open(inv.id)} data-testid="open-concern">View in Investigation</button></div>;
}

function EvidenceRow({ e, origin }: { e: EvidenceItem; origin?: string }) {
  const setTrendView = useStore((s) => s.setTrendView);
  const open = useOpenInWorkspace(origin);
  const [details, setDetails] = useState(false);
  const act = () => {
    if (e.kind === 'reading' && e.watcherId && e.equipmentId) setTrendView({ equipmentId: e.equipmentId, watcherId: e.watcherId, windowMin: 15 });
    else if (e.kind === 'alert' && e.alertId) open(e.alertId);
    else setDetails((v) => !v);
  };
  return (
    <div className="inv-ev" data-testid="evidence-item" data-kind={e.kind} data-stance={e.stance}>
      <button className="inv-ev-b" onClick={act} aria-expanded={e.kind === 'reading' || e.kind === 'alert' ? undefined : details} title={e.kind === 'reading' ? 'Open this reading' : e.kind === 'alert' ? 'Open this alert' : 'Show source details'} data-testid="evidence-open">
        <span className="label">{e.label}{e.stance === 'conflicts' ? ' · conflicts' : ''}</span>
        <span className="grow">{e.text}</span>
      </button>
      {details && <dl className="kv" data-testid="evidence-details"><dt>Source</dt><dd>{e.source ?? 'Not recorded'}</dd>{e.status && <><dt>Status</dt><dd>{e.status}</dd></>}{e.t != null && <><dt>Time</dt><dd className="num">{dateTime(e.t)}</dd></>}{e.equipmentId && <><dt>Equipment</dt><dd>{e.equipmentId}</dd></>}</dl>}
    </div>
  );
}

function Trace({ r, inv, record }: { r: InvestigationResponse; inv: Investigation; record: IncidentRecord }) {
  const alertId = r.suggestion?.alertId ?? r.related?.alertId ?? inv.context.alertId;
  const of = (k: string) => (alertId ? record.events.filter((e) => e.kind === k && ((e as { alertId?: string }).alertId === alertId || e.meta?.alertId === alertId) && !e.meta?.superseded) : []);
  const rec = of('recommendation')[0]; const dec = of('decision').pop(); const reports = of('report'); const out = of('outcome').pop();
  const rows: [string, string][] = [
    [inv.kind === 'observation' ? 'Reported observation' : 'Question', `${inv.by} · ${clock(inv.t)}`],
    ['Evidence checked', `${r.evidence.length} record and reading items, ${r.documents.length} documents, ${r.passages.length} passages`],
    ['Finding', r.heading],
    ['Recommendation', rec ? rec.title : 'None linked'],
    ['Decision', dec ? `${dec.title} · ${dec.by} · ${clock(dec.t)}` : 'None recorded'],
    ['Reported action', reports.length ? `${reports.length} reported, latest ${clock(reports[reports.length - 1].t)}` : 'None reported'],
    ['Observed outcome', out ? out.title : 'None observed'],
  ];
  return <dl className="kv inv-trace" data-testid="investigation-trace">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function ResponseBody({ r, inv, record, question, superseded }: { r: InvestigationResponse; inv: Investigation; record: IncidentRecord; question: string; superseded?: boolean }) {
  const open = useOpenInWorkspace(inv.id);
  const terms = tokenize(question);
  const inline = r.state === 'passages' || r.state === 'insufficient' || (r.evidence.length === 0 && r.conflicts.length === 0);
  const groups = groupPassages(r.passages, record.id);
  const Groups = () => <>{groups.map((g) => <div key={g.key} className="as-group" data-testid={`assistant-group-${g.key}`}><div className="label">{g.label}</div>{g.items.map(({ p, more }) => <PassageCard key={p.id} p={p} more={more} origin="Assistant" terms={terms} current={g.key === 'this'} />)}</div>)}</>;
  return (
    <div className="inv-r" data-testid="investigation-response" data-superseded={!!superseded}>
      <div className="inv-r-h">
        <b data-testid="response-heading">{r.heading}</b>
        {r.revision > 1 && !superseded && <span className="chip soft" data-testid="response-updated">Updated</span>}
        {superseded && <span className="chip outline">Earlier · kept</span>}
        <span className="spacer" />
        <span className="sidenote num" data-testid="response-asof">As of {clock(r.asOf)}</span>
      </div>
      {r.updateReason && <div className="sidenote" data-testid="response-reason">{r.updateReason}</div>}
      {r.startedAt - inv.t > 60_000 && r.revision === 1 && <div className="sidenote" data-testid="response-late">Submitted {clock(inv.t)}; analysis began {clock(r.startedAt)}.</div>}
      {r.state === 'error' ? <div className="supnote" data-testid="assistant-error"><Icon name="warn" size={13} />Retrieval failed: {r.retrievalError}. Try again.</div>
        : r.state === 'empty' ? <div className="sidenote" data-testid="assistant-empty">{r.finding} No evidence found in the selected scope ({r.indexed} passages indexed). Widen the site or content scope.</div>
        : <p className="inv-finding" data-testid="response-finding">{r.finding}</p>}
      {r.conflicts.length > 0 && (
        <div className="inv-conflict" data-testid="response-conflicts">
          <div className="label">Both kept</div>
          {r.conflicts.map((c, i) => <div key={i} className="inv-cf"><div data-testid="conflict-a">{c.a}</div><div data-testid="conflict-b">{c.b}</div><div className="sidenote">{c.note}</div></div>)}
        </div>
      )}
      {r.suggestion && (
        <div className="inv-sugg" data-testid="response-suggestion">
          <div className="label">Suggested response · from an existing recommendation</div>
          <div>{r.suggestion.summary}</div>
          {!superseded && <button className="btn sm" onClick={() => open(r.suggestion!.alertId)} data-testid="open-workspace">Open in response workspace</button>}
          <div className="sidenote">Not an instruction. The decision is yours and is recorded there.</div>
        </div>
      )}
      {r.affected && r.affected.length > 0 && (
        <div className="inv-sugg" data-testid="response-affected">
          <div className="label">Recommendations that rely on this</div>
          {r.affected.map((a) => <button key={a.alertId} className="link" style={{ textAlign: 'left' }} onClick={() => open(a.alertId)} data-testid="affected-open">{a.summary}</button>)}
        </div>
      )}
      {(r.missing.length > 0 || r.uncertainty.length > 0) && (
        <div className="inv-unc" data-testid="response-uncertainty">
          {r.missing.length > 0 && <><div className="label">Missing</div><ul className="plain">{r.missing.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {r.uncertainty.length > 0 && <><div className="label">Uncertainty</div><ul className="plain">{r.uncertainty.map((x) => <li key={x}>{x}</li>)}</ul></>}
        </div>
      )}
      {r.documents.length > 0 && <div className="evs" data-testid="response-citations">{r.documents.map((e) => <Citation key={`${e.docId}:${e.revision}:${e.page}`} cite={{ docId: e.docId, revision: e.revision, page: e.page, label: e.label || undefined, quote: e.quote, locate: e.locate, title: e.title, number: e.number }} origin={`Investigation ${inv.number}`} testId="response-citation" />)}</div>}
      {inline && r.state !== 'empty' && r.state !== 'error' && <Groups />}
      {r.evidence.length > 0 && (
        <details className="inv-more" data-testid="response-evidence">
          <summary>Supporting evidence · {r.evidence.length}</summary>
          {r.evidence.map((e) => <EvidenceRow key={e.id} e={e} origin={inv.id} />)}
        </details>
      )}
      {!inline && groups.length > 0 && <details className="inv-more" data-testid="response-passages"><summary>Matching passages · {r.passages.length}</summary><Groups /></details>}
      <details className="inv-more" data-testid="response-details">
        <summary>How this was investigated</summary>
        <div className="sidenote">Simulated investigation: fixed rules and keyword search, no language model. Searched {scopeLine(inv)}. {r.run.number ? `Agent run ${r.run.number}, config v${r.run.configVersion}.` : ''}</div>
        <dl className="kv" data-testid="response-checked">{r.checked.map((c) => <div key={c.label} style={{ display: 'contents' }}><dt>{c.label}</dt><dd>{c.detail}</dd></div>)}</dl>
        <div className="label" style={{ marginTop: 6 }}>Trace</div>
        <Trace r={r} inv={inv} record={record} />
        <div className="sidenote">A question is not a decision. An answer is not an instruction or proof that an action occurred.</div>
      </details>
    </div>
  );
}
