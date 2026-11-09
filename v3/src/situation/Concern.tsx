// The selected observation or question, shown through the same Response and Sources tabs as an alert.
import { useMemo, useState } from 'react';
import { WATCHERS } from '../data/scenario';
import { ATTENTION, SEVERITY_ORDER, useIncidentNow, type AlertView, type Derived } from '../lib/derive';
import { useAgentDisplay } from '../lib/agentStatus';
import { formatValue, sampleAt, type Clock } from '../lib/series';
import { clock, dateTime } from '../lib/time';
import { analysisOf, ANALYSIS_LABEL, ASSESSED_NOTE, latestOf, nextStepOf, outcomeOf } from '../investigate/followThrough';
import { observationText } from '../investigate/engine';
import { OBSERVATION_SOURCE, type EvidenceItem, type IncidentRecord, type Investigation, type InvestigationResponse, type RecordEvent } from '../record/types';
import { useStore } from '../store';
import { PassageCard } from '../pages/Knowledge';
import { Citation } from '../ui/Citation';
import { Icon } from '../ui/Icon';
import { DecisionChip, ExecutionChip, EvidenceChip, SeverityChip } from '../ui/ui';

export function AnalysisChip({ inv }: { inv: Investigation }) {
  const s = analysisOf(inv);
  return <span className={`chip analysis a-${s}`} data-testid="analysis-status" data-status={s} title={s === 'assessed' ? ASSESSED_NOTE : undefined}>{ANALYSIS_LABEL[s]}</span>;
}

/** Runs the next step using the existing controls. */
export function useNextStep(inv: Investigation) {
  const a = useAgentDisplay();
  const { agentResume, agentStart, retryInvestigation, openAssistantFor, openRecommendation, setResponseTab, setAssistantMode } = useStore.getState();
  const record = useStore((s) => s.records[s.incidentId]);
  return (action: ReturnType<typeof nextStepOf>['action']) => {
    if (action === 'resume') void agentResume(a.received);
    else if (action === 'start') void agentStart({ reason: 'Started from the Investigation window' });
    else if (action === 'retry') void retryInvestigation(inv.id);
    else if (action === 'clarify') openAssistantFor({ focus: inv.id });
    else if (action === 'recommendation') { const id = latestOf(inv)?.suggestion?.alertId; if (id) openRecommendation(id, inv.id); }
    else if (action === 'review') setResponseTab('sources');
    else if (action === 'information') { setAssistantMode('report'); openAssistantFor({ mode: 'report', context: { equipmentId: inv.context.equipmentId } }); }
    void record;
  };
}

function NextStep({ inv, record }: { inv: Investigation; record: IncidentRecord }) {
  const n = nextStepOf(inv, record);
  const run = useNextStep(inv);
  return (
    <div className="concern-next" data-testid="concern-next" data-action={n.action}>
      <div className="grow"><span className="label">Next step</span><div data-testid="concern-next-text">{inv.urgentWording && analysisOf(inv) !== 'investigating' ? 'The report uses urgent wording, so it needs prompt human attention. ' : ''}{n.text}</div></div>
      {n.button && <button className={`btn sm ${n.action === 'recommendation' || n.action === 'clarify' || n.action === 'retry' ? 'action' : ''}`} onClick={() => run(n.action)} data-testid={`next-${n.action}`}>{n.button}</button>}
    </div>
  );
}

/** Urgency and evidence certainty, side by side and separate. */
function UrgencyPair({ inv }: { inv: Investigation }) {
  if (!inv.urgentWording) return null;
  return (
    <div className="concern-pair" data-testid="urgency-pair">
      <span data-testid="urgency-label"><span className="label">Urgency</span> Urgent wording in the report</span>
      <span data-testid="certainty-label"><span className="label">Evidence</span> Unverified</span>
    </div>
  );
}

function Stage({ label, status, on, children }: { label: string; status?: React.ReactNode; on?: boolean; children: React.ReactNode }) {
  return (
    <div className="stage" data-stage={label}>
      <div className={`node ${on ? 'on' : 'off'}`} />
      <div className="body">
        <div className="head"><span className="label">{label}</span>{status && <span className="status">{status}</span>}</div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

/** Current evidence beside an unresolved concern. It does not answer the concern. */
function CurrentEvidence({ inv, d }: { inv: Investigation; d: Derived }) {
  const startedAt = useStore((s) => s.startedAt); const revealedAt = useStore((s) => s.revealedAt); const dashboard = useStore((s) => s.dashboard);
  const setTrendView = useStore((s) => s.setTrendView); const selectAlert = useStore((s) => s.selectAlert);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const now = useIncidentNow(2000);
  const eq = inv.context.equipmentId;
  const ws = WATCHERS.filter((w) => (eq ? w.equipmentId === eq : dashboard.includes(w.equipmentId)) && w.unit !== 'status');
  const alerts = d.alerts.filter((a) => ATTENTION.includes(a.condition) && (!eq || a.def.equipmentId === eq)).sort((a, b) => SEVERITY_ORDER[a.def.severity] - SEVERITY_ORDER[b.def.severity]).slice(0, 4);
  return (
    <div className="concern-current" data-testid="current-evidence">
      <div className="label">Current evidence · {eq ?? 'all monitored equipment'}</div>
      <div className="sidenote">Shown for context. It neither confirms this report nor rules it out.</div>
      {alerts.map((a) => <button key={a.id} className="concern-row" onClick={() => selectAlert(a.id)} data-testid="current-alert"><SeverityChip s={a.def.severity} /><span className="grow">{a.def.title}</span><span className="num sidenote">{clock(a.time)}</span></button>)}
      <div className="concern-readings">{ws.map((w) => { const s = sampleAt(w, now, clk); return <button key={w.id} onClick={() => setTrendView({ equipmentId: w.equipmentId, watcherId: w.id, windowMin: 15 })} data-testid="current-reading" title="Open this reading"><span className="sidenote">{w.equipmentId} {w.variable.toLowerCase()}</span><span className="num">{formatValue(w, s.value)}{w.unit === 'status' ? '' : ` ${w.unit}`}, {s.trend}{s.source === 'lost' ? ' · signal lost' : ''}</span></button>; })}</div>
    </div>
  );
}

const alertEvents = (r: IncidentRecord, alertId: string, kind: string) => r.events.filter((e) => e.kind === kind && !e.meta?.superseded && ((e as { alertId?: string }).alertId === alertId || e.meta?.alertId === alertId));

export function ConcernResponse({ inv, record, d }: { inv: Investigation; record: IncidentRecord; d: Derived }) {
  const openRecommendation = useStore((s) => s.openRecommendation);
  const openAssistantFor = useStore((s) => s.openAssistantFor);
  const setResponseTab = useStore((s) => s.setResponseTab);
  const r = latestOf(inv); const status = analysisOf(inv); const outcome = outcomeOf(inv);
  const { original, current, amendedAt } = inv.kind === 'observation' ? observationText(record, inv) : { original: inv.text, current: inv.text, amendedAt: undefined };
  const ev = record.events.find((e) => e.id === inv.observationEventId);
  const linked = r?.suggestion ?? r?.related;
  const alertId = linked?.alertId;
  const decision = alertId ? alertEvents(record, alertId, 'decision').pop() : undefined;
  const reports = alertId ? alertEvents(record, alertId, 'report') : [];
  const out = alertId ? alertEvents(record, alertId, 'outcome').pop() : undefined;
  const superseded = alertId ? record.events.find((e) => e.kind === 'recommendation' && e.meta?.superseded && e.meta?.alertId === alertId) : undefined;
  const earlier = inv.responses.slice(0, -1).reverse();
  const usedCount = r ? r.evidence.length + r.documents.length + (ev ? 1 : 0) : ev ? 1 : 0;
  const whyNone = !r ? (status === 'clarification' ? 'No recommendation yet: ECC needs the clarification first.' : status === 'failed' ? 'No recommendation: the analysis did not finish.' : 'No recommendation yet: analysis has not finished.')
    : r.humanReview ? 'No recommendation: ECC could not interpret this report, and it will not derive an operational response from its wording.'
    : outcome?.kind === 'conflict' ? 'No new recommendation: the evidence conflicts and needs review first.'
    : r.noResponseReason ?? 'No recommendation: the record holds none that applies to this, and the evidence checked does not support a new one.';
  return (
    <div className="resp" data-testid="concern-response" data-status={status}>
      <div className="resp-head">
        <div className="line">
          {inv.kind === 'observation' ? <EvidenceChip e="reported" /> : <span className="chip outline">Question</span>}
          {ev && <span className="chip outline">{OBSERVATION_SOURCE[ev.meta?.sourceType as keyof typeof OBSERVATION_SOURCE] ?? 'Reported'}</span>}
          {outcome && <span className="chip soft" data-testid="concern-outcome" data-kind={outcome.kind}>{outcome.label}</span>}
        </div>
        <h2 data-testid="concern-title">{original}</h2>
        {amendedAt != null && <div className="sidenote" data-testid="concern-amended">Amended {clock(amendedAt)}: {current}. The original wording is retained.</div>}
        <div className="sidenote" data-testid="concern-attribution">{inv.by} · {ev ? `observed ${clock(Number(ev.meta?.observedAt))} · received ${clock(inv.t)}` : `asked ${clock(inv.t)}`}{inv.context.equipmentId ? ` · ${inv.context.equipmentId}` : ''}{inv.context.location ? ` · ${inv.context.location}` : ''}</div>
        <UrgencyPair inv={inv} />
      </div>
      <NextStep inv={inv} record={record} />
      <div className="chain">
        <Stage label="Current assessment" on={!!r} status={r ? <>Simulated · as of {clock(r.asOf)}{r.revision > 1 ? ` · revision ${r.revision}` : ''}</> : undefined}>
          {r ? (
            <>
              {r.updateReason && <p className="quiet" data-testid="concern-update">{r.updateReason}</p>}
              <p data-testid="concern-finding">{r.finding}</p>
              {outcome?.reason && <p className="quiet" data-testid="concern-outcome-reason">{outcome.reason}</p>}
              {r.conflicts.map((c, i) => <div key={i} className="inv-conflict" style={{ marginTop: 6 }} data-testid="concern-conflict"><div>{c.a}</div><div>{c.b}</div><div className="sidenote">{c.note}</div></div>)}
              {r.uncertainty.map((u) => <p key={u} className="quiet">{u}</p>)}
              {status === 'assessed' && <p className="sidenote" data-testid="assessed-note">{ASSESSED_NOTE}</p>}
              {earlier.length > 0 && <details className="inv-more" data-testid="concern-earlier"><summary>{earlier.length} earlier {earlier.length === 1 ? 'assessment' : 'assessments'} kept</summary>{earlier.map((x) => <p key={x.id} className="quiet"><span className="num">{clock(x.t)}</span> {x.heading}: {x.finding}</p>)}</details>}
            </>
          ) : <p className="quiet" data-testid="concern-no-assessment">{status === 'clarification' ? 'ECC has not assessed this. It needs the clarification above first.' : status === 'failed' ? 'ECC has not assessed this. The analysis did not finish.' : status === 'investigating' ? 'ECC is working on this now.' : 'ECC has not considered this yet.'}</p>}
          {(status === 'clarification' || r?.humanReview) && <CurrentEvidence inv={inv} d={d} />}
        </Stage>
        <Stage label="Suggested response" on={!!r?.suggestion} status={r?.suggestion ? 'From an existing recommendation' : undefined}>
          {r?.suggestion ? (
            <div className={`rec ${superseded ? 'superseded' : ''}`} data-testid="concern-recommendation">
              <div className="sum">{r.suggestion.summary}</div>
              {superseded && <div className="supnote" data-testid="concern-superseded"><Icon name="warn" size={14} /><span>Superseded {clock(superseded.t)}. {superseded.detail}</span></div>}
              <button className="btn sm" onClick={() => openRecommendation(r.suggestion!.alertId, inv.id)} data-testid="concern-open-recommendation">Open recommendation</button>
            </div>
          ) : <p className="quiet" data-testid="concern-why-none">{whyNone}</p>}
          {!r?.suggestion && r?.related && <p className="quiet">A separate recommendation applies to this equipment and is not changed by this report: <button className="link" style={{ textAlign: 'left' }} onClick={() => openRecommendation(r.related!.alertId, inv.id)} data-testid="concern-related">{r.related.summary}</button></p>}
          {r?.affected?.some((a) => a.alertId !== r.suggestion?.alertId) ? <div style={{ marginTop: 6 }} data-testid="concern-affected"><div className="label">Other recommendations that rely on this</div>{r.affected.filter((a) => a.alertId !== r.suggestion?.alertId).map((a) => <button key={a.alertId} className="link" style={{ display: 'block', textAlign: 'left' }} onClick={() => openRecommendation(a.alertId, inv.id)}>{a.summary}</button>)}</div> : null}
        </Stage>
        <Stage label="Missing information" on={!!r?.missing.length} status={r?.missing.length ? `${r.missing.length} outstanding` : undefined}>
          {r?.missing.length ? <ul className="plain inv-list" data-testid="concern-missing">{r.missing.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="quiet">{r ? 'Nothing outstanding is recorded for this.' : status === 'clarification' ? inv.clarification?.question : 'Not known until analysis has run.'}</p>}
        </Stage>
        <Stage label="Supporting evidence" on={usedCount > 0} status={`${usedCount} used`}>
          <button className="link" onClick={() => setResponseTab('sources')} data-testid="concern-to-sources">See what each source supports</button>
          {r && r.documents.length > 0 && <div className="evs" style={{ marginTop: 6 }} data-testid="concern-citations">{r.documents.map((e) => <Citation key={`${e.docId}:${e.page}`} cite={{ docId: e.docId, revision: e.revision, page: e.page, quote: e.quote, locate: e.locate, title: e.title, number: e.number }} origin={`Investigation ${inv.number}`} dock testId="concern-citation" />)}</div>}
        </Stage>
        <Stage label="Decision" on={!!decision} status={<DecisionChip d={(decision as { status?: 'approved' | 'deferred' | 'declined' } | undefined)?.status ?? 'none'} />}>
          <p className="quiet" data-testid="concern-decision">{decision ? `${decision.title} · ${decision.by} · ${clock(decision.t)}` : alertId ? 'No decision recorded. Decisions are recorded on the recommendation.' : 'Nothing to decide here.'}</p>
        </Stage>
        <Stage label="Reported execution" on={reports.length > 0} status={<ExecutionChip e={reports.length ? 'reported' : 'not-started'} />}>
          <p className="quiet" data-testid="concern-execution">{reports.length ? `${reports.length} reported, latest ${clock(reports[reports.length - 1].t)}. A reported action is not an observed outcome.` : 'No action reported. Recording this entry did not execute anything.'}</p>
        </Stage>
        <Stage label="Observed outcome" on={!!out}>
          <p className="quiet" data-testid="concern-observed">{out ? out.title : 'None observed.'}</p>
        </Stage>
      </div>
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => openAssistantFor({ focus: inv.id })} data-testid="concern-open-exchange">Open the full exchange in the Assistant</button>
    </div>
  );
}

function SourceRow({ title, meta, supports, excerpt, note, children, kind }: { title: string; meta: string; supports: string; excerpt?: string; note?: string; children?: React.ReactNode; kind: string }) {
  return (
    <div className="srcrow concern-src" data-testid="source-row" data-kind={kind}>
      <div className="grow-col">
        <div className="t">{title}</div>
        <div className="m" data-testid="source-identity">{meta}</div>
        <div className="concern-supports" data-testid="source-supports"><span className="label">Supports</span> {supports}</div>
        {excerpt && <div className="concern-excerpt" data-testid="source-excerpt">{excerpt}</div>}
        {note && <div className="m" data-testid="source-note">{note}</div>}
      </div>
      <div className="src-actions">{children}</div>
    </div>
  );
}

function RecordSource({ e, r }: { e: EvidenceItem; r: InvestigationResponse }) {
  const setTrendView = useStore((s) => s.setTrendView); const selectAlert = useStore((s) => s.selectAlert);
  const [open, setOpen] = useState(false);
  const first = r.finding.split(/(?<=[.!?])\s/)[0];
  const supports = e.stance === 'conflicts' ? `Conflicts with the report: ${first}` : e.stance === 'supports' ? first : 'Context only. Not relied on for the assessment.';
  const live = e.kind === 'reading';
  return (
    <SourceRow kind={e.kind} title={e.label} meta={`${e.source ?? 'Source not recorded'}${e.t != null ? ` · ${clock(e.t)}` : ''}${e.status && e.status !== 'live' ? ` · ${e.status}` : ''}`} supports={supports} excerpt={e.text} note={live ? `Value when analysed at ${clock(r.asOf)}. Simulated reading, not a live plant source.` : e.status === 'reported' ? 'Reported, not independently verified.' : undefined}>
      {live && e.watcherId && e.equipmentId && <button className="btn sm" onClick={() => setTrendView({ equipmentId: e.equipmentId!, watcherId: e.watcherId!, windowMin: 15 })} data-testid="source-inspect">Inspect reading</button>}
      {e.kind === 'alert' && e.alertId && <button className="btn sm" onClick={() => selectAlert(e.alertId!)} data-testid="source-inspect">Open alert</button>}
      {!live && e.kind !== 'alert' && <button className="btn sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="source-inspect">{open ? 'Hide details' : 'Inspect'}</button>}
      {open && <dl className="kv src-details" data-testid="source-details"><dt>Source</dt><dd>{e.source ?? 'Not recorded'}</dd>{e.status && <><dt>Status</dt><dd>{e.status}</dd></>}{e.t != null && <><dt>Time</dt><dd className="num">{dateTime(e.t)}</dd></>}{e.equipmentId && <><dt>Equipment</dt><dd>{e.equipmentId}</dd></>}</dl>}
    </SourceRow>
  );
}

function ReportedSource({ ev, inv, record }: { ev: RecordEvent; inv: Investigation; record: IncidentRecord }) {
  const [open, setOpen] = useState(false);
  const m = ev.meta ?? {};
  const am = observationText(record, inv);
  return (
    <SourceRow kind="reported-observation" title="Reported observation · the report itself" meta={`${String(m.sourceLabel ?? 'Reported')}${m.sourceDetail ? `: ${String(m.sourceDetail)}` : ''} · observed ${clock(Number(m.observedAt))} · received ${clock(Number(m.receivedAt))}`} supports="The fact that this was reported. Not that it is true." excerpt={ev.title} note={`Submitted by ${ev.by}. Reported, not independently verified.${am.amendedAt ? ` Amended ${clock(am.amendedAt)}: ${am.current}` : ''}`}>
      <button className="btn sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="source-inspect">{open ? 'Hide details' : 'Inspect'}</button>
      {open && <dl className="kv src-details" data-testid="source-details"><dt>Entry</dt><dd>{dateTime(ev.t)}</dd><dt>Submitted by</dt><dd>{ev.by}</dd><dt>Clarification</dt><dd>{inv.clarification?.answeredAt ? `Answered ${clock(inv.clarification.answeredAt)}: ${[inv.clarification.answer, inv.clarification.answerLocation, inv.clarification.answerText].filter(Boolean).join(' · ')}` : inv.clarification ? 'Requested, not answered' : 'None'}</dd></dl>}
    </SourceRow>
  );
}

export function ConcernSources({ inv, record, d }: { inv: Investigation; record: IncidentRecord; d: Derived }) {
  const setKnowledgeView = useStore((s) => s.setKnowledgeView); const setNav = useStore((s) => s.setNav);
  const r = latestOf(inv);
  const ev = record.events.find((e) => e.id === inv.observationEventId);
  const used = new Set((r?.documents ?? []).map((x) => `${x.docId}:${x.revision}:${x.page}`));
  const other = (r?.passages ?? []).filter((p) => !(p.source.kind === 'document' && used.has(`${p.source.id}:${p.source.revision}:${p.source.page}`))).slice(0, 8);
  return (
    <div className="resp" data-testid="sources" data-scope="concern">
      <div>
        <div className="label" style={{ marginBottom: 8 }}>{r ? `Evidence used · as of ${clock(r.asOf)}` : 'Evidence used so far'}</div>
        <div className="srcs" data-testid="sources-used">
          {ev && <ReportedSource ev={ev} inv={inv} record={record} />}
          {r?.documents.map((e, idx) => {
            const doc = d.docById.get(e.docId); const newer = doc && doc.current.revision !== e.revision;
            return (
              <SourceRow key={`${e.docId}:${e.page}`} kind="document" title={e.title} meta={`${e.number ? `${e.number} · ` : ''}Rev ${e.revision} used${newer ? ` · Rev ${doc!.current.revision} now effective` : ''} · p.${e.page}`} supports={idx === 0 ? r.docPurpose ?? 'Matched by keyword' : 'Related guidance matched by keyword. Not the main basis.'} excerpt={e.quote} note={`${e.locate === 'exact' && e.quote ? 'Exact passage.' : 'Page only: no exact passage recorded.'} Matched by keyword; applicability is your judgement. Illustrative fixture, not SME-validated.`}>
                <Citation cite={{ docId: e.docId, revision: e.revision, page: e.page, quote: e.quote, locate: e.locate, title: e.title, number: e.number }} origin={`Investigation ${inv.number}`} dock actions testId="source-citation" />
              </SourceRow>
            );
          })}
          {r?.evidence.map((e) => <RecordSource key={e.id} e={e} r={r} />)}
          {!r && <p className="quiet" data-testid="sources-none">{analysisOf(inv) === 'clarification' ? 'Nothing beyond the report itself: ECC needs the clarification before it can gather evidence.' : analysisOf(inv) === 'failed' ? 'Nothing beyond the report itself: the analysis did not finish.' : 'Nothing beyond the report itself: ECC has not analysed this yet.'}</p>}
          {r && !r.documents.length && !r.evidence.length && <p className="quiet" data-testid="sources-none">No document or reading was relied on for this assessment.</p>}
        </div>
      </div>
      {other.length > 0 && (
        <details className="inv-more" data-testid="sources-other">
          <summary>Other potentially relevant · {other.length} · matched but not relied on</summary>
          {other.map((p) => <PassageCard key={p.id} p={p} origin={`Investigation ${inv.number}`} />)}
        </details>
      )}
      <p className="sidenote">General document browsing is in <button className="link" onClick={() => { setKnowledgeView('documents'); setNav('knowledge'); }} data-testid="sources-knowledge">Knowledge</button>.</p>
    </div>
  );
}

/** A user-reported row in the Observations tab: short by default, expanded when selected. */
export function UserObservationRow({ inv, record, selected }: { inv: Investigation; record: IncidentRecord; selected: boolean }) {
  const selectConcern = useStore((s) => s.selectConcern);
  const openAssistantFor = useStore((s) => s.openAssistantFor);
  const openRecommendation = useStore((s) => s.openRecommendation);
  const setResponseTab = useStore((s) => s.setResponseTab);
  const ev = record.events.find((e) => e.id === inv.observationEventId);
  const next = nextStepOf(inv, record); const run = useNextStep(inv); const outcome = outcomeOf(inv); const r = latestOf(inv);
  const m = ev?.meta ?? {};
  return (
    <div className={`obs user-obs ${selected ? 'on' : ''}`} data-time={inv.t} data-testid="observation" data-user="true" data-id={inv.id} data-selected={selected}>
      <div className="t">{clock(inv.t)}</div>
      <div>
        <button className="obs-pick" onClick={() => selectConcern(selected ? null : inv.id)} aria-expanded={selected} data-testid="observation-select">{ev?.title ?? inv.text}</button>
        <div className="m"><EvidenceChip e="reported" /><span>{String(m.sourceLabel ?? 'Reported')}</span>{inv.context.equipmentId && <><span>·</span><span>{inv.context.equipmentId}</span></>}<AnalysisChip inv={inv} />{outcome && <span data-testid="observation-outcome">{outcome.label}</span>}</div>
        {next.button && !selected && <button className="link" style={{ fontSize: 12, marginTop: 3 }} onClick={() => run(next.action)} data-testid={`row-next-${next.action}`}>{next.button}</button>}
        {selected && (
          <div className="obs-detail" data-testid="observation-detail">
            <div className="sidenote">{String(m.sourceDetail ?? '')}{m.sourceDetail ? ' · ' : ''}observed {clock(Number(m.observedAt))} · received {clock(Number(m.receivedAt))} · submitted by {ev?.by}</div>
            <UrgencyPair inv={inv} />
            <NextStep inv={inv} record={record} />
            {r && <p className="inv-finding" data-testid="observation-assessment">{r.finding}</p>}
            {outcome?.reason && <p className="sidenote">{outcome.reason}</p>}
            <div className="obs-links" data-testid="observation-links">
              <button className="link" onClick={() => openAssistantFor({ focus: inv.id })} data-testid="link-investigation">Investigation {inv.number}</button>
              <button className="link" onClick={() => setResponseTab('response')} data-testid="link-assessment">{r ? 'Assessment' : 'Response'}</button>
              <button className="link" onClick={() => setResponseTab('sources')} data-testid="link-sources">Evidence</button>
              {(r?.suggestion ?? r?.related) && <button className="link" onClick={() => openRecommendation((r!.suggestion ?? r!.related)!.alertId, inv.id)} data-testid="link-recommendation">Recommendation</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** On an alert: reports and questions whose assessment points here. */
export function LinkedConcerns({ a, record }: { a: AlertView; record: IncidentRecord | undefined }) {
  const selectConcern = useStore((s) => s.selectConcern);
  const linked = (record?.investigations ?? []).filter((i) => { const r = latestOf(i); return r?.suggestion?.alertId === a.id || r?.related?.alertId === a.id || r?.affected?.some((x) => x.alertId === a.id) || i.context.alertId === a.id; });
  if (!linked.length) return null;
  return (
    <div className="concern-linked" data-testid="linked-concerns">
      <span className="label">Linked reports and questions</span>
      {linked.map((i) => <button key={i.id} className="link" style={{ textAlign: 'left' }} onClick={() => selectConcern(i.id, 'response')} data-testid="linked-concern">{i.kind === 'observation' ? 'Report' : 'Question'}: {i.text}</button>)}
    </div>
  );
}
