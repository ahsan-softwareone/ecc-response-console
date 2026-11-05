import { useMemo } from 'react';
import { DOCS, EQUIPMENT, STEPS } from '../data/scenario';
import type { AlertDef, ConditionState, DocRevision, Equipment, FindingDef, KnowledgeDoc, ObservationDef, ScenarioStep, TaskDef, ExecutionStatus } from '../data/types';
import { useStore } from '../store';
import { stepWindowSec } from './series';
import { useNow } from './time';

export interface AlertView {
  id: string; def: AlertDef; step: number; time: number; count: number; lastTime: number;
  condition: ConditionState; clearedBy?: string; clearedAt?: number; equipment: Equipment;
  /** Set when a later revealed alert made this alert's recommendation stale. */
  supersededBy?: { alertId: string; time: number; reason: string };
}
export interface ObservationView extends ObservationDef { time: number; step: number }
export interface FindingView extends FindingDef { time: number; step: number }
export interface TaskView extends TaskDef { time: number; step: number }
export interface ScenarioFieldReport { alertId: string; time: number; text: string; by: string; status: ExecutionStatus; step: number }
export interface DocView extends KnowledgeDoc { revisions: DocRevision[]; current: DocRevision }

export interface Derived {
  steps: ScenarioStep[];
  stepIndex: number;             // 1-based current step
  phase: ScenarioStep['phase'];
  stepTime: (k: number) => number; // absolute time step k (1-based) began
  stepEnd: (k: number) => number;  // absolute time step k's event window ended (= when it was revealed)
  alerts: AlertView[];
  alertById: Map<string, AlertView>;
  observations: ObservationView[];
  findings: FindingView[];
  tasks: TaskView[];
  fieldReports: ScenarioFieldReport[];
  docs: DocView[];
  docById: Map<string, DocView>;
  equipmentById: Map<string, Equipment>;
  roleOf: (equipmentId: string) => string;
}

const EQ_BY_ID = new Map(EQUIPMENT.map((e) => [e.id, e]));

/** Everything visible is derived from revealed steps AND gated on the clock: nothing appears before its own timestamp. */
export function derive(startedAt: number, revealedAt: number[], now: number): Derived {
  const steps = STEPS.slice(0, revealedAt.length);
  const stepTime = (k: number) => startedAt + (revealedAt[k - 1] ?? 0);
  const stepEnd = (k: number) => stepTime(k) + stepWindowSec(STEPS[k - 1]) * 1000;

  const alerts: AlertView[] = [];
  const byId = new Map<string, AlertView>();
  for (const s of steps) {
    const t0 = stepTime(s.index);
    for (const a of s.alerts) {
      if (t0 + a.offsetSec * 1000 > now) continue;
      const initial: ConditionState = a.condition ?? (a.kind === 'recovery' ? 'recovered' : a.kind === 'report' ? 'reported' : 'active');
      const v: AlertView = { id: a.id, def: a, step: s.index, time: t0 + a.offsetSec * 1000, count: 1, lastTime: t0 + a.offsetSec * 1000, condition: initial, equipment: EQ_BY_ID.get(a.equipmentId)! };
      alerts.push(v); byId.set(a.id, v);
      for (const c of a.clears ?? []) { const target = byId.get(c); if (target) { target.condition = 'cleared'; target.clearedBy = a.id; target.clearedAt = v.time; } }
      for (const sup of a.supersedes ?? []) { const target = byId.get(sup.alertId); if (target && !target.supersededBy) target.supersededBy = { alertId: a.id, time: v.time, reason: sup.reason }; }
    }
    for (const r of s.reiterations ?? []) {
      const target = byId.get(r.alertId);
      if (t0 + r.offsetSec * 1000 > now) continue;
      if (target && target.condition === 'active') { target.count += 1; target.lastTime = t0 + r.offsetSec * 1000; }
    }
  }
  // Source loss marks the alert condition as unconfirmed when its watcher is lost.
  for (const s of steps) for (const [wid, kp] of Object.entries(s.readings)) {
    if (stepTime(s.index) + (kp.rampSec ?? 0) * 1000 > now) continue;
    if (kp.source === 'lost') for (const a of alerts) if (a.def.watcherId === wid && a.condition === 'active' && a.step < s.index) a.condition = 'unconfirmed';
  }
  alerts.sort((a, b) => b.time - a.time);

  const due = <T extends { time: number }>(x: T) => x.time <= now;
  const observations: ObservationView[] = steps.flatMap((s) => s.observations.map((o) => ({ ...o, time: stepTime(s.index) + o.offsetSec * 1000, step: s.index }))).filter(due).sort((a, b) => b.time - a.time);
  const findings: FindingView[] = steps.flatMap((s) => s.findings.map((f) => ({ ...f, time: stepTime(s.index) + f.offsetSec * 1000, step: s.index }))).filter(due).sort((a, b) => b.time - a.time);
  const tasks: TaskView[] = steps.flatMap((s) => s.tasks.map((t) => ({ ...t, time: stepTime(s.index) + t.startSec * 1000, step: s.index }))).filter(due).sort((a, b) => b.time - a.time);
  const fieldReports: ScenarioFieldReport[] = steps.flatMap((s) => (s.fieldReports ?? []).map((r) => ({ ...r, time: stepTime(s.index) + r.offsetSec * 1000, step: s.index }))).filter(due);

  const docs: DocView[] = DOCS.map((d) => {
    let revisions = d.revisions.map((r) => ({ ...r }));
    for (const s of steps) for (const ev of s.knowledge ?? []) {
      if (ev.docId !== d.id || stepEnd(s.index) > now) continue;
      revisions = revisions.map((r) => (r.revision === ev.revision ? { ...r, status: ev.status, effectiveFrom: 'this emergency' } : r.status === 'effective' && ev.status === 'effective' ? { ...r, status: 'superseded' } : r));
    }
    const current = revisions.find((r) => r.status === 'effective') ?? revisions[0];
    return { ...d, revisions, current };
  });

  const last = steps[steps.length - 1];
  const roleOf = (id: string) => {
    const e = EQ_BY_ID.get(id);
    if (!e) return '';
    let role = '';
    for (const r of e.relevance) if (r.step <= last.index) role = r.role;
    return role;
  };

  return { steps, stepIndex: last.index, phase: last.phase, stepTime, stepEnd, alerts, alertById: byId, observations, findings, tasks, fieldReports, docs, docById: new Map(docs.map((d) => [d.id, d])), equipmentById: EQ_BY_ID, roleOf };
}

export function useDerived(): Derived {
  const startedAt = useStore((s) => s.startedAt);
  const revealedAt = useStore((s) => s.revealedAt);
  const now = useNow(1000);
  return useMemo(() => derive(startedAt, revealedAt, now), [startedAt, revealedAt, now]);
}

export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
export const SEVERITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' } as const;
export const EVIDENCE_LABEL = { verified: 'Verified', reported: 'Reported', inferred: 'Inferred', unverified: 'Unverified' } as const;
export const CONDITION_LABEL = { active: 'Active', cleared: 'Cleared', unconfirmed: 'Unconfirmed', recovered: 'Recovered', reported: 'Reported' } as const;
/** Conditions that still need attention (used by card indicators). */
export const ATTENTION: ConditionState[] = ['active', 'unconfirmed'];
export const DECISION_LABEL = { none: 'No decision', approved: 'Approved', deferred: 'Deferred', declined: 'Declined' } as const;
export const EXECUTION_LABEL = { 'not-started': 'Not reported', reported: 'Reported', verified: 'Verified in field' } as const;
