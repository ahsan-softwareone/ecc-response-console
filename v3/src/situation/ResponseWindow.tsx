import { useMemo, useState, type ReactNode } from 'react';
import { USER } from '../data/scenario';
import type { EvidenceRef } from '../data/types';
import { SEVERITY_ORDER, useDerived, type AlertView, type Derived } from '../lib/derive';
import { formatValue, sampleAt, watcherDef, type Clock } from '../lib/series';
import { clock, now, tPlus } from '../lib/time';
import { useIncidentNow } from '../lib/derive';
import { useStore, type Decision, type FieldReport } from '../store';
import { Icon } from '../ui/Icon';
import { ConditionChip, DecisionChip, EvidenceChip, ExecutionChip, IconButton, SeverityChip, SourceDot } from '../ui/ui';
import { WindowFrame } from './WindowFrame';
import { Citation } from '../ui/Citation';

export function ResponseWindow() {
  const d = useDerived();
  const selectedId = useStore((s) => s.selectedAlertId);
  const tab = useStore((s) => s.responseTab);
  const setTab = useStore((s) => s.setResponseTab);
  const swapSides = useStore((s) => s.swapSides);
  const alert = selectedId ? d.alertById.get(selectedId) ?? null : null;

  return (
    <WindowFrame id="response" title="Investigation" headExtra={alert && (
      <div className="tabs" role="tablist" style={{ marginLeft: 8 }}>
        {(['response', 'observations', 'sources'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>{t === 'response' ? 'Response' : t === 'observations' ? 'Observations' : 'Sources'}</button>
        ))}
      </div>
    )} actions={<IconButton className="sm" name="swap" title="Swap monitoring and response sides" onClick={swapSides} />}>
      <div className="scroll">
        {!alert ? <Overview d={d} /> : tab === 'response' ? <ResponseDetail key={alert.id} a={alert} d={d} /> : tab === 'observations' ? <Observations a={alert} d={d} /> : <Sources a={alert} d={d} />}
      </div>
    </WindowFrame>
  );
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
        <button className="btn primary" disabled={!status} onClick={() => status && onRecord({ status, rationale: rationale.trim(), by: `${USER.name} · ${USER.role}`, at: now(), evidenceUsed: rec.evidence.map((e) => ({ docId: e.docId, revision: e.revision, page: e.page, label: e.label })), recommendationSummary: rec.summary })} data-testid="record-decision">Record decision</button>
        <span className="sidenote">Recorded as {USER.role}; a decision is not an executed action.</span>
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

function Observations({ a, d }: { a: AlertView; d: Derived }) {
  const rows = d.observations.filter((o) => !o.equipmentId || o.equipmentId === a.def.equipmentId);
  return (
    <div className="resp" data-testid="observations">
      <div className="label">{a.def.equipmentId} and general observations · newest first</div>
      <div className="obs-list">
        {rows.map((o) => (
          <div key={o.id} className="obs" data-time={o.time} data-testid="observation">
            <div className="t">{clock(o.time)}</div>
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

function Sources({ a, d }: { a: AlertView; d: Derived }) {
  const openViewer = useStore((s) => s.openViewer);
  const refs = a.def.recommendation?.evidence ?? [];
  const origin = `${a.def.equipmentId} · ${a.def.title}`;
  const drawings = a.equipment.drawings.map((dr) => ({ dr, doc: d.docById.get(dr.docId)! }));
  return (
    <div className="resp" data-testid="sources">
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Cited by the recommendation</div>
        <div className="srcs">
          {refs.map((e) => { const doc = d.docById.get(e.docId)!; const newer = doc.current.revision !== e.revision; return (
            <div key={evKey(e)} className="srcrow">
              <div><div className="t">{doc.title}</div><div className="m">{doc.number} · Rev {e.revision} used{newer ? ` · Rev ${doc.current.revision} now effective` : ''} · p.{e.page} {e.label} · {e.locate === 'exact' ? (e.region ? 'region' : 'exact passage') : e.locate === 'ambiguous' ? 'several matches' : 'page only'}</div></div>
              <button className="btn sm" onClick={() => openViewer({ docId: e.docId, revision: e.revision, page: e.page, label: e.label, quote: e.quote, region: e.region, locate: e.locate, origin })}>Open</button>
            </div>
          ); })}
          {refs.length === 0 && <p className="quiet">No sources cited for this alert.</p>}
        </div>
      </div>
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Drawings linked to {a.def.equipmentId}</div>
        <div className="srcs">
          {drawings.map(({ dr, doc }) => (
            <div key={doc.id} className="srcrow">
              <div><div className="t">{doc.type}</div><div className="m">{doc.title} · Rev {doc.current.revision}</div></div>
              <button className="btn sm" onClick={() => openViewer({ docId: doc.id, revision: doc.current.revision, page: dr.region?.page ?? 1, label: `${a.def.equipmentId} on ${doc.type}`, region: dr.region, locate: dr.region ? 'exact' : 'page-only', origin })}>Open</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
