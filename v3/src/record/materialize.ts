// Materializes what has become visible (derived from the scenario and the clock)
// into append-only incident-record events. Runs continuously while an incident is
// active; after that the record renders on its own without scenario.ts.
import { EMERGENCY_META, WATCHERS } from '../data/scenario';
import type { Derived } from '../lib/derive';
import { formatValue, sampleAt, type Clock } from '../lib/series';
import type { AlertUserState } from '../store';
import type { AgentEvent, AlertEvent, DecisionEvent, MeasurementEvent, PinnedEvidence, RecommendationEvent, RecordEvent, ReportEvent } from './types';

export function pinEvidence(d: Derived, refs: { docId: string; revision: string; page: number; label: string; locate: 'exact' | 'ambiguous' | 'page-only'; quote?: string; region?: PinnedEvidence['region'] }[]): PinnedEvidence[] {
  return refs.map((e) => { const doc = d.docById.get(e.docId); return { docId: e.docId, title: doc?.title ?? e.docId, number: doc?.number ?? '', revision: e.revision, page: e.page, label: e.label, locate: e.locate, quote: e.quote, region: e.region }; });
}

/** Events for everything visible now that the record does not yet contain. */
export function collectEvents(d: Derived, alertUser: Record<string, AlertUserState>, clock: Clock, now: number, existing: Set<string>, dashboard: string[]): RecordEvent[] {
  const out: RecordEvent[] = [];
  const push = (e: RecordEvent) => { if (!existing.has(e.id)) out.push(e); };
  const t1 = d.stepTime(1);
  let prevValues: Map<string, number> | null = null;

  if (d.scenario) push({ id: 'notification', t: t1, recordedAt: now, kind: 'notification', title: `Initial notification: ${EMERGENCY_META.title}`, detail: `${EMERGENCY_META.facility} · reported by ${EMERGENCY_META.reportedBy}`, source: 'field' });
  push({ id: 'equipment-initial', t: t1 + 1000, recordedAt: now, kind: 'equipment', title: `Equipment under monitoring: ${dashboard.join(', ')}`, source: 'agent' });
  for (const s of d.steps) {
    // Measurement snapshot once the step's readings have settled (its last event time).
    const settleT = d.stepEnd(s.index);
    if (settleT <= now) {
      const values = WATCHERS.filter((w) => dashboard.includes(w.equipmentId)).map((w) => { const smp = sampleAt(w, settleT, clock); return { watcherId: w.id, variable: w.variable, value: smp.value, unit: w.unit, source: smp.source }; });
      const changes: string[] = [];
      for (const v of values) {
        const w = WATCHERS.find((x) => x.id === v.watcherId)!;
        const prev = prevValues?.get(v.watcherId);
        const limit = w.limits.find((l) => l.label === w.defaultLimit) ?? w.limits[0];
        const crossed = !!limit && prev != null && ((prev <= limit.value) !== (v.value <= limit.value));
        const rel = prev != null && prev !== 0 ? Math.abs(v.value - prev) / Math.abs(prev) : prev === 0 && v.value !== 0 ? 1 : 0;
        if (prev != null && (crossed || rel >= 0.05 || (w.unit === 'status' && prev !== v.value))) changes.push(`${w.equipmentId} ${w.variable.toLowerCase()} ${formatValue(w, prev)} → ${formatValue(w, v.value)}${w.unit === 'status' ? '' : ` ${w.unit}`}${crossed ? ` · now ${v.value > limit!.value ? 'above' : 'below'} ${limit!.label} ${limit!.value}` : ''}`);
      }
      const first = prevValues == null;
      prevValues = new Map(values.map((v) => [v.watcherId, v.value]));
      const ev: MeasurementEvent = { id: `measurement-s${s.index}`, t: settleT, recordedAt: now, kind: 'measurement', title: first ? `Baseline readings · ${values.length} variables` : changes.length ? `${changes.length} significant change${changes.length > 1 ? 's' : ''} · ${values.length} variables sampled` : `No significant change · ${values.length} variables sampled`, source: 'system', values, changes };
      push(ev);
    }
    const seed = s.sitrep;
    if (d.scenario && seed && settleT <= now && d.released(settleT)) push({ id: `narrative-s${s.index}`, t: settleT, recordedAt: now, kind: 'finding', title: 'Assessment update', detail: `${seed.situation}\nResponse: ${seed.actions}\nResources: ${seed.resources}\nNext: ${seed.next}`, source: 'agent', meta: { narrative: true } });
  }
  for (const o of d.observations) push({ id: `obs-${o.id}`, t: o.time, recordedAt: now, kind: o.kind === 'agent-finding' ? 'finding' : 'observation', title: o.text, detail: `${o.source} · ${o.evidence}`, equipmentId: o.equipmentId, source: o.kind === 'agent-finding' || o.kind === 'route-assessment' ? 'agent' : 'field', meta: { evidence: o.evidence, obsKind: o.kind } });
  for (const f of d.findings) push({ id: `finding-${f.id}`, t: f.time, recordedAt: now, kind: 'finding', title: f.text, detail: f.supersedes ? 'Assessment revision; supersedes the earlier assessment' : 'Initial assessment', source: 'agent', meta: { assessment: true } });
  for (const a of d.alerts) {
    const ae: AlertEvent = { id: `alert-${a.id}`, t: a.time, recordedAt: now, kind: 'alert', title: a.def.title, detail: a.def.measurement ?? a.def.why, equipmentId: a.def.equipmentId, source: 'agent', severity: a.def.severity, evidenceStatus: a.def.evidence, state: a.condition, meta: { alertId: a.id, ...(a.processedLate ? { processedAt: a.processedLate } : {}) } };
    push(ae);
    if (a.condition === 'cleared' && a.clearedAt) push({ id: `outcome-${a.id}`, t: a.clearedAt, recordedAt: now, kind: 'outcome', title: `Cleared: ${a.def.title}`, detail: a.clearedBy ? `By: ${d.alertById.get(a.clearedBy)?.def.title}` : undefined, equipmentId: a.def.equipmentId, source: 'agent', meta: { alertId: a.id, cleared: true } });
    if (a.condition === 'unconfirmed') push({ id: `gap-${a.id}`, t: a.time, recordedAt: now, kind: 'gap', title: `Information gap: ${a.def.title} can no longer be confirmed from ECC`, equipmentId: a.def.equipmentId, source: 'agent', meta: { alertId: a.id } });
    const rec = a.def.recommendation;
    if (rec) {
      const re: RecommendationEvent = { id: `rec-${a.id}`, t: a.time, recordedAt: now, kind: 'recommendation', title: rec.summary, detail: rec.actions.join(' · '), equipmentId: a.def.equipmentId, source: 'agent', alertId: a.id, summary: rec.summary, actions: rec.actions, prerequisites: rec.prerequisites ?? [], calculation: rec.calculation ? `${rec.calculation.label}: ${rec.calculation.status === 'unavailable' ? `not computed — ${rec.calculation.reason}` : rec.calculation.value}` : undefined, evidence: pinEvidence(d, rec.evidence) };
      push(re);
      for (const p of rec.prerequisites ?? []) push({ id: `gap-${a.id}-${p.slice(0, 24)}`, t: a.time, recordedAt: now, kind: 'gap', title: `Prerequisite outstanding: ${p}`, detail: `For: ${rec.summary}`, equipmentId: a.def.equipmentId, source: 'agent', meta: { alertId: a.id, prerequisite: true } });
      if (a.supersededBy) push({ id: `rec-sup-${a.id}`, t: a.supersededBy.time, recordedAt: now, kind: 'recommendation', title: `Superseded: ${rec.summary}`, detail: `${a.supersededBy.reason} Superseding alert: ${d.alertById.get(a.supersededBy.alertId)?.def.title ?? a.supersededBy.alertId}`, equipmentId: a.def.equipmentId, source: 'agent', meta: { superseded: true, alertId: a.id } });
    }
    const u = alertUser[a.id];
    if (u?.ackAt) push({ id: `ack-${a.id}`, t: u.ackAt, recordedAt: now, kind: 'acknowledgement', title: `Acknowledged: ${a.def.title}`, equipmentId: a.def.equipmentId, source: 'user', by: 'Shift Manager', meta: { alertId: a.id } });
    if (u?.decision) {
      const de: DecisionEvent = { id: `decision-${a.id}`, t: u.decision.at, recordedAt: now, kind: 'decision', title: `${u.decision.status === 'approved' ? 'Approved' : u.decision.status === 'deferred' ? 'Deferred' : 'Declined'}: ${u.decision.recommendationSummary}`, detail: u.decision.rationale || undefined, equipmentId: a.def.equipmentId, source: 'user', by: u.decision.by, alertId: a.id, status: u.decision.status, rationale: u.decision.rationale, recommendationSummary: u.decision.recommendationSummary, knownEventCount: 0, evidence: u.decision.evidenceUsed.map((e) => { const doc = d.docById.get(e.docId); return { docId: e.docId, title: doc?.title ?? e.docId, number: doc?.number ?? '', revision: e.revision, page: e.page, label: e.label, locate: 'page-only' as const }; }) };
      push(de);
    }
    for (const r of u?.reports ?? []) { const re: ReportEvent = { id: `report-${r.id}`, t: r.at, recordedAt: now, kind: 'report', title: r.text, detail: `${r.by} · ${r.status}`, equipmentId: a.def.equipmentId, source: 'field', by: r.by, alertId: a.id, status: r.status }; push(re); }
  }
  for (const r of d.fieldReports) { const re: ReportEvent = { id: `report-s${r.step}-${r.alertId}`, t: r.time, recordedAt: now, kind: 'report', title: r.text, detail: `${r.by} · ${r.status}`, source: 'field', by: r.by, alertId: r.alertId, status: r.status }; push(re); }
  for (const t of d.tasks) {
    const ops = t.steps.flatMap((s) => s.operations);
    const failed = ops.find((o) => o.result === 'error' || o.result === 'retry' || o.result === 'empty');
    const docLabels = ops.flatMap((o) => (o.linked ?? []).filter((l) => l.kind === 'doc').map((l) => l.label));
    const headline = failed ? `${failed.name}: ${failed.result === 'retry' ? 'retried, source lost' : failed.detail.replace(/\.$/, '')}`
      : t.kind === 'procedures' && docLabels.length ? `Reviewed ${docLabels.join(', ')}`
      : `${t.steps[0]?.name ?? t.title}: ${(ops[0]?.detail ?? '').replace(/\.$/, '')}`;
    const docRefs = ops.flatMap((o) => (o.linked ?? []).filter((l) => l.kind === 'doc').map((l) => { const doc = d.docById.get(l.id); const rev = l.label.match(/Rev (\w+)/)?.[1] ?? doc?.current.revision ?? ''; const page = l.label.match(/p\.(\d+)/); return { docId: l.id, revision: rev, page: page ? +page[1] : undefined, label: l.label }; }));
    const ae: AgentEvent = { id: `agent-${t.id}`, t: t.time, recordedAt: now, kind: 'agent', title: t.title, docRefs, headline: headline.length > 96 ? `${headline.slice(0, 93)}…` : headline, detail: t.rationale, source: 'agent', taskId: t.id, taskKind: t.kind, status: t.status,
      sources: [...new Set(ops.map((o) => o.source))], documents: ops.flatMap((o) => (o.linked ?? []).filter((l) => l.kind === 'doc').map((l) => l.label)), findings: ops.flatMap((o) => (o.linked ?? []).filter((l) => l.kind === 'alert').map((l) => l.label)), failures: ops.filter((o) => o.result === 'error' || o.result === 'retry' || o.result === 'empty').map((o) => `${o.name}: ${o.detail}`),
      runId: `run-${t.id}-${(t.time / 1000 | 0).toString(36)}`, configVersion: ops[0]?.configVersion ?? '', meta: { processedAt: t.processedAt, ...(t.run ? { agentRun: t.run.number, agentConfig: t.run.config.version } : {}) },
      technical: { steps: t.steps.map((s) => ({ name: s.name, status: s.status, operations: s.operations.map((o) => ({ name: o.name, source: o.source, startedAt: t.time - t.startSec * 1000 + o.startSec * 1000, durationMs: o.durationMs, result: o.result, detail: o.detail, retries: o.retries ?? 0, logs: o.logs.map((l) => ({ t: t.time - t.startSec * 1000 + l.t * 1000, level: l.level, text: l.text })) })) })) } };
    push(ae);
  }
  for (const doc of d.docs) for (const r of doc.revisions) if (r.effectiveFrom === 'this emergency') push({ id: `knowledge-${doc.id}-${r.revision}`, t: d.stepEnd(d.stepIndex), recordedAt: now, kind: 'knowledge', title: `${doc.number} Rev ${r.revision} became ${r.status}; earlier references keep their revision`, source: 'system', meta: { docId: doc.id, revision: r.revision } });
  return out.sort((a, b) => a.t - b.t);
}
