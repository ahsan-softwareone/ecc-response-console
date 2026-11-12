import { useMemo, useState, type ReactNode } from 'react';
import type { EvidenceRef } from '../data/types';
import { SEVERITY_ORDER, useDerived, type AlertView, type Derived } from '../lib/derive';
import { formatValue, sampleAt, watcherDef, type Clock } from '../lib/series';
import { clock, now, tPlus } from '../lib/time';
import { useIncidentNow } from '../lib/derive';
import { userLabel, useStore, type Decision, type FieldReport } from '../store';
import { Icon } from '../ui/Icon';
import { ConditionChip, DecisionChip, EvidenceChip, ExecutionChip, IconButton, SeverityChip, SourceDot } from '../ui/ui';
import { WindowFrame } from './WindowFrame';
import { Citation } from '../ui/Citation';
import { AnalysisChip, ConcernResponse, ConcernSources, LinkedConcerns, UserObservationRow } from './Concern';
import { analysisOf } from '../investigate/followThrough';
import type { IncidentRecord, Investigation } from '../record/types';

export function ResponseWindow() {
  const d = useDerived();
  const selectedId = useStore((s) => s.selectedAlertId);
  const invId = useStore((s) => s.selectedInvestigationId);
  const tab = useStore((s) => s.responseTab);
  const setTab = useStore((s) => s.setResponseTab);
  const swapSides = useStore((s) => s.swapSides);
  const record = useStore((s) => s.records[s.incidentId]);
  const alert = selectedId ? d.alertById.get(selectedId) ?? null : null;
  const inv = invId ? record?.investigations?.find((i) => i.id === invId) ?? null : null;
  const needs = (record?.investigations ?? []).filter((i) => i.kind === 'observation' && ['awaiting', 'clarification', 'failed'].includes(analysisOf(i))).length;

  return (
    <WindowFrame id="response" title="Investigation" headExtra={(
      <div className="tabs" role="tablist" style={{ marginLeft: 8 }}>
        {(['response', 'observations', 'sources'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>{t === 'response' ? 'Response' : t === 'observations' ? 'Observations' : 'Sources'}{t === 'observations' && needs > 0 && <span className="badge neutral" title={`${needs} reported ${needs === 1 ? 'observation needs' : 'observations need'} follow-through`} data-testid="observations-badge" style={{ marginLeft: 5 }}>{needs}</span>}</button>
        ))}
      </div>
    )} actions={<IconButton className="sm" name="swap" title="Swap monitoring and response sides" onClick={swapSides} />}>
      <ConcernBar alert={alert} inv={inv} />
      <div className="scroll">
        {tab === 'observations' ? <Observations a={alert} inv={inv} record={record} d={d} />
          : tab === 'sources' ? (inv && record ? <ConcernSources inv={inv} record={record} d={d} /> : alert ? <Sources a={alert} d={d} /> : <NoConcernSources />)
          : inv && record ? <ConcernResponse inv={inv} record={record} d={d} /> : alert ? <ResponseDetail key={alert.id} a={alert} d={d} /> : <Overview d={d} />}
      </div>
    </WindowFrame>
  );
}

/** What all three tabs are about. The scope is always said. */
function ConcernBar({ alert, inv }: { alert: AlertView | null; inv: Investigation | null }) {
  const selectAlert = useStore((s) => s.selectAlert);
  const selectConcern = useStore((s) => s.selectConcern);
  const origin = useStore((s) => s.concernOrigin);
  const originInv = useStore((s) => (s.concernOrigin ? s.records[s.incidentId]?.investigations?.find((i) => i.id === s.concernOrigin) : undefined));
  const clear = () => { selectAlert(null); selectConcern(null); };
  if (!alert && !inv) return <div className="concern-bar" data-testid="concern-bar" data-kind="incident"><span className="label">Scope</span><span className="grow" data-testid="concern-label">Whole incident · nothing selected</span></div>;
  return (
    <div className="concern-bar" data-testid="concern-bar" data-kind={inv ? inv.kind : 'alert'}>
      <span className="label">{inv ? (inv.kind === 'observation' ? 'Reported' : 'Question') : 'Alert'}</span>
      <span className="grow" data-testid="concern-label" title={inv ? inv.text : alert!.def.title}>{inv ? inv.text : `${alert!.def.equipmentId} · ${alert!.def.title}`}</span>
      {inv && <AnalysisChip inv={inv} />}
      {alert && originInv && <button className="link" onClick={() => selectConcern(origin, 'response')} title={`Back to: ${originInv.text}`} data-testid="concern-back">Back to {originInv.kind === 'observation' ? 'report' : 'question'}</button>}
      <button className="iconbtn sm" onClick={clear} title="Clear selection and show the whole incident" aria-label="Clear selection" data-testid="concern-clear"><Icon name="close" size={12} /></button>
    </div>
  );
}

function NoConcernSources() {
  const setKnowledgeView = useStore((s) => s.setKnowledgeView); const setNav = useStore((s) => s.setNav);
  return <div className="resp" data-testid="sources" data-scope="none"><p className="quiet" data-testid="sources-select">Select an alert or a reported observation to see the evidence used for it.</p><p className="sidenote">General document browsing is in <button className="link" onClick={() => { setKnowledgeView('documents'); setNav('knowledge'); }}>Knowledge</button>.</p></div>;
}

function Overview({ d }: { d: Derived }) {
  const selectAlert = useStore((s) => s.selectAlert);
  const latest = d.findings[0];
  const open = d.alerts.filter((a) => a.condition !== 'cleared').sort((a, b) => SEVERITY_ORDER[a.def.severity] - SEVERITY_ORDER[b.def.severity] || b.time - a.time);
  return (
    <div className="overview" data-testid="overview">
      <div>
        <h3>Current assessment</h3>
        <div className="finding">
          {latest ? <><p>{latest.text}</p><div className="m">ECC agent · {clock(latest.time)} · {tPlus(latest.time, useStore.getState().startedAt)} · revision {d.findings.length}</div></> : <p className="quiet">Assessment in progress.</p>}
        </div>
      </div>
      <div>
        <h3>Open alerts</h3>
        <div className="list">
          {open.map((a) => (
            <button key={a.id} onClick={() => selectAlert(a.id)}>
              <SeverityChip s={a.def.severity} /><b>{a.def.equipmentId}</b><span className="t">{a.def.title}</span>{a.supersededBy && <span className="chip outline">Superseded</span>}<span className="num sidenote">{clock(a.time)}</span>
            </button>
          ))}
          {open.length === 0 && <div className="empty">No open alerts</div>}
        </div>
      </div>
      <p className="sidenote">Select an alert to see its condition, the applicable protocol, the suggested response and the decision record.</p>
    </div>
  );
}

function Stage({ label, status, node, children }: { label: string; status?: ReactNode; node?: 'on' | 'accent' | 'crit' | 'high' | 'off'; children: ReactNode }) {
  return (
    <div className="stage" data-stage={label}>
      <div className={`node ${node ?? 'off'}`}>{node === 'accent' && <Icon name="arrowR" size={11} strokeWidth={2.5} />}</div>
      <div className="body">
        <div className="head"><span className="label">{label}</span>{status && <span className="status">{status}</span>}</div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function evKey(e: EvidenceRef) { return `${e.docId}:${e.revision}:${e.page}:${e.label}`; }

function EvidenceButton({ e, d, origin }: { e: EvidenceRef; d: Derived; origin: string }) {
  if (!d.docById.get(e.docId)) return null;
  return <Citation cite={{ docId: e.docId, revision: e.revision, page: e.page, label: e.label, quote: e.quote, region: e.region, locate: e.locate }} origin={origin} dock testId={`ev-${e.docId}`} />;
}

function ResponseDetail({ a, d }: { a: AlertView; d: Derived }) {
  const startedAt = useStore((s) => s.startedAt);
  const revealedAt = useStore((s) => s.revealedAt);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const now = useIncidentNow(2000);
  const user = useStore((s) => s.alertUser[a.id]);
  const acknowledge = useStore((s) => s.acknowledge);
  const recordDecision = useStore((s) => s.recordDecision);
  const addReport = useStore((s) => s.addReport);
  const setReportStatus = useStore((s) => s.setReportStatus);
  const selectAlert = useStore((s) => s.selectAlert);
  const openAssistantFor = useStore((s) => s.openAssistantFor);
  const record = useStore((s) => s.records[s.incidentId]);

  const w = a.def.watcherId ? watcherDef(a.def.watcherId) : undefined;
  const sample = w ? sampleAt(w, now, clk) : null;
  const rec = a.def.recommendation;
  const sup = a.supersededBy ? { ...a.supersededBy, alert: d.alertById.get(a.supersededBy.alertId) } : null;
  const coveredBy = !rec ? d.alerts.find((o) => o.def.equipmentId === a.def.equipmentId && o.def.recommendation && o.step <= a.step && o.id !== a.id) : null;
  const protocolRefs = rec?.evidence.filter((e) => d.docById.get(e.docId)?.type === 'Procedure' || d.docById.get(e.docId)?.type === 'Operating limits') ?? [];
  const drawingRefs = rec?.evidence.filter((e) => !protocolRefs.includes(e)) ?? [];
  const origin = `${a.def.equipmentId} · ${a.def.title}`;
  const decision = user?.decision;
  const scenarioReports = d.fieldReports.filter((r) => r.alertId === a.id);
  const reports: (FieldReport & { scenario?: boolean })[] = [
    ...scenarioReports.map((r, i) => ({ id: `s-${a.id}-${i}`, at: r.time, by: r.by, text: r.text, status: r.status, scenario: true })),
    ...(user?.reports ?? []),
  ].sort((x, y) => x.at - y.at);
  const execStatus = reports.some((r) => r.status === 'verified') ? 'verified' : reports.length ? 'reported' : 'not-started';

  // Observed outcome: compare the watcher now with its value at the reference point.
  const refTime = Math.max(decision?.at ?? 0, ...reports.map((r) => r.at));
  const outcome = (() => {
    if (a.condition === 'cleared' && a.clearedBy) { const c = d.alertById.get(a.clearedBy); return { text: `Condition cleared at ${clock(a.clearedAt!)}`, sub: c ? `By: ${c.def.title}` : '', ok: true }; }
    if (!w || !sample) return null;
    if (!refTime) return { text: 'No decision or field report recorded yet', sub: `Current ${w.variable.toLowerCase()} ${formatValue(w, sample.value)} ${w.unit === 'status' ? '' : w.unit}, ${sample.trend}`, ok: false };
    const before = sampleAt(w, refTime, clk);
    return { text: `${w.variable} ${formatValue(w, before.value)} → ${formatValue(w, sample.value)} ${w.unit === 'status' ? '' : w.unit} since ${clock(refTime)}`, sub: `Trend ${sample.trend} · condition still ${a.condition}`, ok: false };
  })();

  return (
    <div className="resp" data-testid="response-detail" data-alert={a.id}>
      <LinkedConcerns a={a} record={record} />
      <div className="resp-head">
        <div className="line">
          <SeverityChip s={a.def.severity} />
          <b>{a.def.equipmentId}</b><span>{a.equipment.name}</span>
          <span className="sep">·</span>
          <span className="num">{clock(a.time)} · {tPlus(a.time, startedAt)}</span>
          {a.count > 1 && <span className="sidenote">· repeated ×{a.count}, last {clock(a.lastTime)}</span>}
        </div>
        <h2>{a.def.title}</h2>
        <div className="line">
          <ConditionChip c={a.condition} />
          <EvidenceChip e={a.def.evidence} />
          <DecisionChip d={decision?.status ?? 'none'} />
          <ExecutionChip e={execStatus} />
          <span className="sep">·</span>
          {user?.ackAt ? <span className="sidenote num">Acknowledged {clock(user.ackAt)}</span> : <button className="btn sm" onClick={() => acknowledge(a.id)} data-testid="ack">Acknowledge</button>}
          <button className="link" onClick={() => openAssistantFor({ mode: 'ask', context: { alertId: a.id, equipmentId: a.def.equipmentId } })} data-testid="ask-about-alert">Ask about this</button>
        </div>
      </div>

      <div className="chain">
        <Stage label="Observed condition" node={a.def.severity === 'critical' ? 'crit' : a.def.severity === 'high' ? 'high' : 'on'} status={<EvidenceChip e={a.def.evidence} />}>
          {w && sample && (
            <div className="reading" style={{ marginBottom: 6 }}>
              <span className={`big ${isBreach(w, sample.value) ? 'breach' : ''}`}>{formatValue(w, sample.value)}{w.unit !== 'status' && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>{w.unit}</span>}</span>
              <span className="lim">{w.variable} now · {sample.trend}</span>
              {sample.source === 'lost' && <SourceDot h="lost" />}
              {w.limits[0] && <span className="lim">· {w.limits.map((l) => `${l.label} ${l.value.toFixed(w.decimals)}`).join(' · ')} (illustrative)</span>}
            </div>
          )}
          {a.def.measurement && <p><b>At alert:</b> {a.def.measurement}</p>}
          <p>{a.def.why}</p>
          <dl className="kv"><dt>If it persists</dt><dd>{a.def.consequence}</dd></dl>
        </Stage>

        <Stage label="Applicable protocol" node={protocolRefs.length ? 'on' : 'off'} status={protocolRefs.length ? `${protocolRefs.length} reference${protocolRefs.length > 1 ? 's' : ''}` : undefined}>
          {protocolRefs.length ? (
            <div className="evs" style={{ marginTop: 0 }}>{protocolRefs.map((e) => <EvidenceButton key={evKey(e)} e={e} d={d} origin={origin} />)}</div>
          ) : <p className="quiet">{coveredBy ? <>Covered by the response to <button className="link" onClick={() => selectAlert(coveredBy.id)}>{coveredBy.def.title}</button></> : 'No procedure reference for this alert'}</p>}
          {protocolRefs.some((e) => d.docById.get(e.docId)!.current.revision !== e.revision) && (
            <p className="quiet" style={{ marginTop: 8 }}>A newer revision is now effective. This record keeps the revision it used.</p>
          )}
        </Stage>

        <Stage label="Suggested response" node={rec ? (sup ? 'off' : 'accent') : 'off'} status={rec ? (sup ? <span className="chip outline" data-testid="superseded">Superseded {clock(sup.time)}</span> : 'Agent recommendation') : undefined}>
          {rec && sup && (
            <div className="supnote" data-testid="superseded-note">
              <Icon name="warn" size={14} />
              <span>Superseded at {clock(sup.time)} by <button className="link" onClick={() => selectAlert(sup.alertId)}>{sup.alert?.def.title ?? sup.alertId}</button>. {sup.reason}{sup.alert?.def.recommendation && <> Current recommendation: <button className="link" onClick={() => selectAlert(sup.alertId)}>open</button>.</>}</span>
            </div>
          )}
          {rec ? (
            <div className={`rec ${sup ? 'superseded' : ''}`} data-testid="recommendation">
              <div className="sum">{rec.summary}</div>
              <ol>{rec.actions.map((s, i) => <li key={i}>{s}</li>)}</ol>
              {rec.prerequisites?.map((p, i) => <div key={i} className="pre"><Icon name="warn" size={14} /><span>{p}</span></div>)}
              {rec.calculation && (
                <div className="calc" data-testid="calc">
                  <b>{rec.calculation.label}:</b> {rec.calculation.status === 'unavailable' ? <>not computed — {rec.calculation.reason}</> : <>{rec.calculation.value} · {rec.calculation.basis}</>}
                </div>
              )}
              {drawingRefs.length > 0 && <div className="evs">{drawingRefs.map((e) => <EvidenceButton key={evKey(e)} e={e} d={d} origin={origin} />)}</div>}
            </div>
          ) : <p className="quiet">{coveredBy ? 'See the covering response above.' : 'No response suggested for this alert.'}</p>}
        </Stage>

        <Stage label="Decision" node={decision ? 'on' : 'off'} status={<DecisionChip d={decision?.status ?? 'none'} />}>
          {decision ? (
            <>
              <div className="recorded" data-testid="decision-recorded">
                <div className="h"><b>{decision.status === 'approved' ? 'Approved' : decision.status === 'deferred' ? 'Deferred' : 'Declined'}</b><span className="m">{decision.by} · {clock(decision.at)}</span></div>
                {decision.rationale && <div>{decision.rationale}</div>}
                <div className="m" style={{ marginTop: 6 }}>Decided on: {decision.recommendationSummary}</div>
                {decision.evidenceUsed.length > 0 && <div className="evs" style={{ marginTop: 6 }} data-testid="decision-evidence"><span className="sidenote" style={{ alignSelf: 'center' }}>Evidence at decision:</span>{decision.evidenceUsed.map((e, i) => <Citation key={i} cite={{ docId: e.docId, revision: e.revision, page: e.page, label: e.label }} origin={`${origin} · decision`} dock />)}</div>}
              </div>
              {sup && sup.time > decision.at && (
                <div className="supnote" data-testid="decision-review-flag"><Icon name="warn" size={14} /><span>The recommendation this decision was based on was superseded at {clock(sup.time)}, after the decision. The decision stands as recorded and needs review.</span></div>
              )}
            </>
          ) : sup ? <p className="quiet" data-testid="no-decision-superseded">No decision was recorded before this recommendation was superseded. Decide on the current recommendation instead.</p>
            : rec ? <DecisionForm onRecord={(dec) => recordDecision(a.id, dec)} rec={rec} /> : <p className="quiet">Nothing to decide for this alert.</p>}
        </Stage>

        <Stage label="Reported execution" node={reports.length ? 'on' : 'off'} status={<ExecutionChip e={execStatus} />}>
          <div className="reports">
            {reports.map((r) => (
              <div key={r.id} className="report" data-testid="field-report">
                <div><div>{r.text}</div><div className="m">{r.by} · {clock(r.at)}{!decision && ' · no recorded decision at the time'}</div></div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <ExecutionChip e={r.status} />
                  {r.status === 'reported' && !r.scenario && <button className="btn sm" onClick={() => setReportStatus(a.id, r.id, 'verified')}>Mark verified</button>}
                  {r.status === 'reported' && r.scenario && <span className="sidenote">awaiting independent verification</span>}
                </div>
              </div>
            ))}
            {reports.length === 0 && <p className="quiet">No field action reported.</p>}
            <ReportForm onAdd={(r) => addReport(a.id, r)} />
          </div>
        </Stage>

        <Stage label="Observed outcome" node={outcome?.ok ? 'on' : 'off'}>
          {outcome ? <><p>{outcome.text}</p>{outcome.sub && <p className="quiet">{outcome.sub}</p>}</> : <p className="quiet">No measurable outcome for this alert.</p>}
          {reports.length > 0 && !outcome?.ok && <p className="quiet">A reported action is not an observed outcome.</p>}
        </Stage>
      </div>
    </div>
  );
}

function isBreach(w: NonNullable<ReturnType<typeof watcherDef>>, v: number) {
  const l = w.limits.find((x) => x.label === w.defaultLimit) ?? w.limits[0];
  if (!l) return false;
  return l.kind === 'high' ? v > l.value : v < l.value;
}

function DecisionForm({ onRecord, rec }: { onRecord: (d: Decision) => void; rec: NonNullable<AlertView['def']['recommendation']> }) {
  const [status, setStatus] = useState<Decision['status'] | null>(null);
  const [rationale, setRationale] = useState('');
  return (
    <div className="decision" data-testid="decision-form">
      <div className="opts">
        {(['approved', 'deferred', 'declined'] as const).map((s) => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} data-testid={`decide-${s}`}>{s === 'approved' ? 'Approve recommendation' : s === 'deferred' ? 'Defer' : 'Decline'}</button>
        ))}
      </div>
      <textarea className="textarea" placeholder="Rationale (recorded with the decision)" value={rationale} onChange={(e) => setRationale(e.target.value)} data-testid="rationale" />
      <div className="row">
        <button className="btn primary" disabled={!status} onClick={() => status && onRecord({ status, rationale: rationale.trim(), by: userLabel(), at: now(), evidenceUsed: rec.evidence.map((e) => ({ docId: e.docId, revision: e.revision, page: e.page, label: e.label })), recommendationSummary: rec.summary })} data-testid="record-decision">Record decision</button>
        <span className="sidenote">Recorded as {userLabel().split(' · ')[1]}; a decision is not an executed action.</span>
      </div>
    </div>
  );
}

function ReportForm({ onAdd }: { onAdd: (r: FieldReport) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [by, setBy] = useState('Incident Commander (field)');
  if (!open) return <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)} data-testid="report-open"><Icon name="plus" size={13} /> Record field report</button>;
  return (
    <div className="decision">
      <textarea className="textarea" placeholder="What was reported from the field" value={text} onChange={(e) => setText(e.target.value)} data-testid="report-text" />
      <div className="row">
        <input className="input" style={{ width: 240 }} value={by} onChange={(e) => setBy(e.target.value)} aria-label="Reported by" />
        <button className="btn primary" disabled={!text.trim()} onClick={() => { onAdd({ id: `r-${now()}`, at: now(), by, text: text.trim(), status: 'reported' }); setText(''); setOpen(false); }} data-testid="report-save">Record as reported</button>
        <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function Observations({ a, inv, record, d }: { a: AlertView | null; inv: Investigation | null; record: IncidentRecord | undefined; d: Derived }) {
  const [whole, setWhole] = useState(false);
  const invs = useMemo(() => (record?.investigations ?? []).filter((i) => i.kind === 'observation'), [record]);
  const concernEq = a?.def.equipmentId ?? inv?.context.equipmentId;
  const scoped = !!concernEq && !whole;
  const scripted = d.observations.filter((o) => !scoped || !o.equipmentId || o.equipmentId === concernEq);
  // A report with no equipment is not about this alert's equipment, so it shows only in the whole-incident scope.
  const reported = invs.filter((i) => !scoped || i.context.equipmentId === concernEq || i.id === inv?.id);
  const rows = [...scripted.map((o) => ({ time: o.time, id: o.id, o, i: null as Investigation | null })), ...reported.map((i) => ({ time: i.t, id: i.id, o: null, i }))].sort((x, y) => y.time - x.time);
  const hiddenReports = invs.length - reported.length;
  return (
    <div className="resp" data-testid="observations" data-scope={scoped ? 'equipment' : 'incident'}>
      <div className="obs-scope">
        <div className="label" data-testid="observations-scope">{scoped ? `${concernEq} and general observations · newest first` : 'All observations · whole incident · newest first'}</div>
        {concernEq && <span className="seg sm"><button aria-pressed={scoped} onClick={() => setWhole(false)} data-testid="obs-scope-equipment">{concernEq}</button><button aria-pressed={!scoped} onClick={() => setWhole(true)} data-testid="obs-scope-incident">Whole incident</button></span>}
      </div>
      {scoped && hiddenReports > 0 && <button className="link" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={() => setWhole(true)} data-testid="obs-hidden-reports">{hiddenReports} other reported {hiddenReports === 1 ? 'observation' : 'observations'} outside this scope</button>}
      <p className="sidenote" style={{ margin: 0 }} data-testid="observations-note">Each row is its own record. A scripted finding near a report in time is not a response to it.</p>
      <div className="obs-list">
        {rows.map(({ id, o, i, time }) => i && record ? <UserObservationRow key={id} inv={i} record={record} selected={inv?.id === i.id} /> : o && (
          <div key={id} className="obs" data-time={time} data-testid="observation" data-user="false">
            <div className="t">{clock(time)}</div>
            <div>
              <div>{o.text}</div>
              <div className="m"><EvidenceChip e={o.evidence} /><span>{KIND[o.kind]}</span><span>·</span><span>{o.source}</span>{o.sourceHealth && <SourceDot h={o.sourceHealth} />}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const KIND = { reading: 'Reading', 'field-report': 'Field report', 'security-report': 'Security report', 'agent-finding': 'Agent finding', 'route-assessment': 'Route assessment' } as const;

export function Sources({ a, d }: { a: AlertView; d: Derived }) {
  const openViewer = useStore((s) => s.openViewer);
  const setTrendView = useStore((s) => s.setTrendView);
  const startedAt = useStore((s) => s.startedAt); const revealedAt = useStore((s) => s.revealedAt);
  const clk: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);
  const nowT = useIncidentNow(2000);
  const refs = a.def.recommendation?.evidence ?? [];
  const origin = `${a.def.equipmentId} · ${a.def.title}`;
  const drawings = a.equipment.drawings.map((dr) => ({ dr, doc: d.docById.get(dr.docId)! })).filter(({ doc }) => !refs.some((e) => e.docId === doc.id));
  const w = a.def.watcherId ? watcherDef(a.def.watcherId) : undefined;
  const reports = d.fieldReports.filter((r) => r.alertId === a.id);
  return (
    <div className="resp" data-testid="sources" data-scope="alert">
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Evidence used · readings and reports behind this alert</div>
        <div className="srcs" data-testid="sources-used">
          {w && (() => { const s = sampleAt(w, nowT, clk); return (
            <div className="srcrow concern-src" data-testid="source-row" data-kind="reading">
              <div className="grow-col"><div className="t">{a.def.equipmentId} {w.variable.toLowerCase()}</div><div className="m" data-testid="source-identity">Simulated reading · now {formatValue(w, s.value)}{w.unit === 'status' ? '' : ` ${w.unit}`}, {s.trend}{s.source === 'lost' ? ' · signal lost, value frozen' : ''}</div><div className="concern-supports" data-testid="source-supports"><span className="label">Supports</span> The observed condition of this alert.</div>{a.def.measurement && <div className="concern-excerpt" data-testid="source-excerpt">At alert, {clock(a.time)}: {a.def.measurement}</div>}</div>
              <div className="src-actions"><button className="btn sm" onClick={() => setTrendView({ equipmentId: a.def.equipmentId, watcherId: w.id, windowMin: 15 })} data-testid="source-inspect">Inspect reading</button></div>
            </div>
          ); })()}
          {reports.map((r, i) => (
            <div key={i} className="srcrow concern-src" data-testid="source-row" data-kind="report">
              <div className="grow-col"><div className="t">Reported action</div><div className="m" data-testid="source-identity">{r.by} · {clock(r.time)} · {r.status}</div><div className="concern-supports"><span className="label">Supports</span> What was reported from the field. Not an observed outcome.</div><div className="concern-excerpt">{r.text}</div></div>
            </div>
          ))}
          {!w && !reports.length && <p className="quiet">This alert rests on the report behind it ({a.def.evidence}). No process reading is linked.</p>}
        </div>
      </div>
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Cited by the recommendation</div>
        <div className="srcs">
          {refs.map((e) => { const doc = d.docById.get(e.docId)!; const newer = doc.current.revision !== e.revision; return (
            <div key={evKey(e)} className="srcrow concern-src" data-testid="source-row" data-kind="document">
              <div className="grow-col"><div className="t">{doc.title}</div><div className="m" data-testid="source-identity">{doc.number} · Rev {e.revision} used{newer ? ` · Rev ${doc.current.revision} now effective` : ''} · p.{e.page} {e.label} · {e.locate === 'exact' ? (e.region ? 'region' : 'exact passage') : e.locate === 'ambiguous' ? 'several matches' : 'page only'}</div><div className="concern-supports" data-testid="source-supports"><span className="label">Supports</span> {a.def.recommendation!.summary}</div>{e.quote && <div className="concern-excerpt" data-testid="source-excerpt">{e.quote}</div>}</div>
              <div className="src-actions"><Citation cite={{ docId: e.docId, revision: e.revision, page: e.page, label: e.label, quote: e.quote, region: e.region, locate: e.locate }} origin={origin} dock actions testId="source-citation" /></div>
            </div>
          ); })}
          {refs.length === 0 && <p className="quiet">No sources cited for this alert.</p>}
        </div>
      </div>
      {drawings.length > 0 && (
        <details className="inv-more" data-testid="sources-other">
          <summary>Other potentially relevant · drawings linked to {a.def.equipmentId} · not cited</summary>
          <div className="srcs" style={{ marginTop: 6 }}>
            {drawings.map(({ dr, doc }) => (
              <div key={doc.id} className="srcrow">
                <div><div className="t">{doc.type}</div><div className="m">{doc.title} · Rev {doc.current.revision}</div></div>
                <button className="btn sm" onClick={() => openViewer({ docId: doc.id, revision: doc.current.revision, page: dr.region?.page ?? 1, label: `${a.def.equipmentId} on ${doc.type}`, region: dr.region, locate: dr.region ? 'exact' : 'page-only', origin })}>Open</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
