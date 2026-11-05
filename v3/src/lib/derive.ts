import { useMemo } from 'react';
import { DOCS, EQUIPMENT, STEPS } from '../data/scenario';
import type { AlertDef, ConditionState, DocRevision, Equipment, FindingDef, KnowledgeDoc, ObservationDef, ScenarioStep, TaskDef, ExecutionStatus } from '../data/types';
import { useStore } from '../store';
import { stepWindowSec } from './series';
import { useNow } from './time';
import { AGENT_BUILD, processingWindows, releaseOf, type Window } from './agent';
import type { AgentRun } from '../record/types';

export interface AlertView {
  id: string; def: AlertDef; step: number; time: number; count: number; lastTime: number;
  condition: ConditionState; clearedBy?: string; clearedAt?: number; equipment: Equipment;
  /** Set when a later revealed alert made this alert's recommendation stale. */
  supersededBy?: { alertId: string; time: number; reason: string };
  /** When the agent processed it, if later than the time it occurred (paused, stopped or not started). */
  processedLate?: number;
}
export interface ObservationView extends ObservationDef { time: number; step: number }
export interface FindingView extends FindingDef { time: number; step: number }
export interface TaskView extends TaskDef { time: number; step: number; processedAt: number; run?: AgentRun }
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
  /** True for the agreed training scenario; user-created incidents have no scripted developments. */
  scenario: boolean;
  /** Whether agent output for a source time has been processed yet. Sources are never gated. */
  released: (t: number) => { at: number; run: AgentRun | null } | null;
  /** Received from sources but not yet analysed by the agent. */
  held: { alerts: string[]; tasks: string[]; findings: string[] };
  /** Field observations and reports (source side) since a given time are read from observations/fieldReports. */
  processing: TaskView | null;
  lastCheckAt: number | null;
  lastCheckTitle: string | null;
}
export interface DeriveOpts { scenario: boolean; windows: Window[] | null; real?: { base: number; equipment: string[]; site: string } | null }
const CAP_OF_KIND: Record<string, string | undefined> = { procedures: 'procedures', equipment: 'equipment', conflict: 'conflict', assessment: 'assessment' };

/** The only agent work a user-created incident gets in this prototype: stated plainly, nothing site-specific is invented. */
function realTasks(real: NonNullable<DeriveOpts['real']>): TaskDef[] {
  const op = (name: string, source: string, detail: string, startSec: number): TaskDef['steps'][number]['operations'][number] => ({ id: 'o', name, source, startSec, durationMs: 800, result: 'ok', detail, configVersion: `${AGENT_BUILD} / incident`, logs: [{ t: startSec, level: 'info', text: detail }] });
  const eq = real.equipment.length ? real.equipment.join(', ') : 'none stated';
  return [
    { id: 'rt-1', title: 'Checking equipment context', kind: 'equipment', startSec: 2, durationSec: 4, status: 'done', rationale: 'Link the stated equipment to the asset list.', steps: [{ id: 's', name: 'Asset lookup', status: 'done', operations: [op('Asset register lookup', 'Asset register (simulated)', `Equipment stated at start: ${eq}.`, 2)] }] },
    { id: 'rt-2', title: 'Reviewing relevant procedures', kind: 'procedures', startSec: 7, durationSec: 5, status: 'done', rationale: 'Search Knowledge using the title and initial notification.', steps: [{ id: 's', name: 'Knowledge search', status: 'done', operations: [op('Search Knowledge', 'Knowledge index', 'Local keyword search; results appear in the timeline as a finding. No recommendation is generated for a user-created incident.', 7)] }] },
    { id: 'rt-3', title: 'Monitoring process values', kind: 'monitoring', startSec: 13, durationSec: 0, status: 'waiting', rationale: 'Simulated baseline readings only; no live source is connected in this prototype.', steps: [{ id: 's', name: 'Subscribe', status: 'waiting', operations: [op('Subscribe to tags', 'PI historian (simulated)', 'Simulated baseline; awaiting updates.', 13)] }] },
  ];
}

const EQ_BY_ID = new Map(EQUIPMENT.map((e) => [e.id, e]));

/** Everything visible is derived from revealed steps AND gated on the clock: nothing appears before its own timestamp. */
export function derive(startedAt: number, revealedAt: number[], now: number, opts: DeriveOpts = { scenario: true, windows: null }): Derived {
  const { scenario, windows } = opts;
  const release = (t: number): { at: number; run: AgentRun | null } | null => (windows ? releaseOf(t, windows) : { at: t, run: null });
  const released = (t: number) => { const r = release(t); return r && r.at <= now ? r : null; };
  const allows = (run: AgentRun | null, cap: string | undefined) => !cap || !run || (run.config.capabilities as string[]).includes(cap);
  const held: Derived['held'] = { alerts: [], tasks: [], findings: [] };
  const steps = STEPS.slice(0, scenario ? revealedAt.length : 1);
  const stepTime = (k: number) => startedAt + (revealedAt[k - 1] ?? 0);
  const stepEnd = (k: number) => stepTime(k) + stepWindowSec(STEPS[k - 1]) * 1000;

  const alerts: AlertView[] = [];
  const byId = new Map<string, AlertView>();
  for (const s of steps) {
    const t0 = stepTime(s.index);
    if (!scenario) continue;
    for (const a0 of s.alerts) {
      if (t0 + a0.offsetSec * 1000 > now) continue;
      const rel = released(t0 + a0.offsetSec * 1000);
      if (!rel) { held.alerts.push(a0.title); continue; }
      // Without the procedures capability this run suggests no response; the alert itself still stands.
      const a: AlertDef = a0.recommendation && !allows(rel.run, 'procedures') ? { ...a0, recommendation: undefined } : a0;
      const initial: ConditionState = a.condition ?? (a.kind === 'recovery' ? 'recovered' : a.kind === 'report' ? 'reported' : 'active');
      const v: AlertView = { id: a.id, def: a, step: s.index, time: t0 + a.offsetSec * 1000, count: 1, lastTime: t0 + a.offsetSec * 1000, condition: initial, equipment: EQ_BY_ID.get(a.equipmentId)!, processedLate: rel.at > t0 + a.offsetSec * 1000 ? rel.at : undefined };
      alerts.push(v); byId.set(a.id, v);
      for (const c of a.clears ?? []) { const target = byId.get(c); if (target) { target.condition = 'cleared'; target.clearedBy = a.id; target.clearedAt = v.time; } }
      for (const sup of a.supersedes ?? []) { const target = byId.get(sup.alertId); if (target && !target.supersededBy) target.supersededBy = { alertId: a.id, time: v.time, reason: sup.reason }; }
    }
    for (const r of s.reiterations ?? []) {
      const target = byId.get(r.alertId);
      if (t0 + r.offsetSec * 1000 > now || !released(t0 + r.offsetSec * 1000)) continue;
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
  const scripted = scenario ? steps : [];
  // Agent-produced observations wait for processing; field and security reports are source-side and never wait.
  const observations: ObservationView[] = scripted.flatMap((s) => s.observations.map((o) => ({ ...o, time: stepTime(s.index) + o.offsetSec * 1000, step: s.index }))).filter(due).filter((o) => {
    if (o.kind !== 'agent-finding' && o.kind !== 'route-assessment') return true;
    const rel = released(o.time);
    if (!rel) { held.findings.push(o.text); return false; }
    return allows(rel.run, 'assessment');
  }).sort((a, b) => b.time - a.time);
  const findings: FindingView[] = scripted.flatMap((s) => s.findings.map((f) => ({ ...f, time: stepTime(s.index) + f.offsetSec * 1000, step: s.index }))).filter(due).filter((f) => {
    const rel = released(f.time);
    if (!rel) { held.findings.push(f.text); return false; }
    return allows(rel.run, 'assessment');
  }).sort((a, b) => b.time - a.time);
  const taskDefs: { def: TaskDef; t: number; step: number }[] = scenario
    ? steps.flatMap((s) => s.tasks.map((def) => ({ def, t: stepTime(s.index) + def.startSec * 1000, step: s.index })))
    : opts.real ? realTasks(opts.real).map((def) => ({ def, t: opts.real!.base + def.startSec * 1000, step: 1 })) : [];
  const tasks: TaskView[] = [];
  for (const { def, t, step } of taskDefs) {
    if (t > now) continue;
    const rel = released(t);
    if (!rel) { held.tasks.push(def.title); continue; }
    if (!allows(rel.run, CAP_OF_KIND[def.kind])) continue;
    tasks.push({ ...def, time: t, step, processedAt: rel.at, run: rel.run ?? undefined });
  }
  tasks.sort((a, b) => b.time - a.time);
  const inFlight = tasks.filter((t) => t.status !== 'waiting' && t.processedAt + t.durationSec * 1000 > now).sort((a, b) => b.processedAt - a.processedAt);
  const finished = tasks.filter((t) => t.status !== 'waiting' && t.processedAt + t.durationSec * 1000 <= now).sort((a, b) => (b.processedAt + b.durationSec * 1000) - (a.processedAt + a.durationSec * 1000));
  const fieldReports: ScenarioFieldReport[] = scripted.flatMap((s) => (s.fieldReports ?? []).map((r) => ({ ...r, time: stepTime(s.index) + r.offsetSec * 1000, step: s.index }))).filter(due);

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
    if (!scenario) return '';
    for (const r of e.relevance) {
      if (r.step > last.index) continue;
      // A status change is evidence too: it takes effect with the step's first alert on this equipment, not when the step opens.
      const offsets = STEPS[r.step - 1].alerts.filter((a) => a.equipmentId === id).map((a) => a.offsetSec);
      const at = r.step === 1 ? stepTime(1) : offsets.length ? stepTime(r.step) + Math.min(...offsets) * 1000 : stepEnd(r.step);
      // Status text is the agent's reading of events, so it waits for processing like the alerts do. Step 1 is the starting description.
      if (at <= now && (r.step === 1 || released(at))) role = r.role;
    }
    return role;
  };

  return { steps, stepIndex: last.index, phase: last.phase, stepTime, stepEnd, alerts, alertById: byId, observations, findings, tasks, fieldReports, docs, docById: new Map(docs.map((d) => [d.id, d])), equipmentById: EQ_BY_ID, roleOf, scenario, released, held, processing: inFlight[0] ?? null, lastCheckAt: finished[0] ? finished[0].processedAt + finished[0].durationSec * 1000 : null, lastCheckTitle: finished[0]?.title ?? null };
}

export function useDerived(): Derived {
  const startedAt = useStore((s) => s.startedAt);
  const revealedAt = useStore((s) => s.revealedAt);
  const incidentMode = useStore((s) => s.incidentMode);
  const ready = useStore((s) => s.storageReady);
  const runs = useStore((s) => s.records[s.incidentId]?.agentRuns);
  const site = useStore((s) => s.records[s.incidentId]?.site ?? '');
  const created = useStore((s) => s.records[s.incidentId]?.createdAt ?? 0);
  const equipment = useStore((s) => s.dashboard);
  const now = useIncidentNow(1000);
  // Until storage has loaded nothing is released, so a paused incident never flashes output on reload.
  const windows = useMemo(() => (runs ? processingWindows(runs) : ready ? null : []), [runs, ready]);
  return useMemo(() => derive(startedAt, revealedAt, now, { scenario: incidentMode === 'training', windows, real: incidentMode === 'real' ? { base: Math.max(startedAt, created), equipment, site } : null }), [startedAt, revealedAt, now, incidentMode, windows, created, equipment, site]);
}

/** The incident's clock: monitoring and agent work end at closure, so a closed record stays still. */
export function useIncidentNow(stepMs = 1000): number {
  const n = useNow(stepMs);
  const frozen = useStore((s) => s.records[s.incidentId]?.closure?.t);
  return frozen != null ? Math.min(n, frozen) : n;
}

export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
export const SEVERITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' } as const;
export const EVIDENCE_LABEL = { verified: 'Verified', reported: 'Reported', inferred: 'Inferred', unverified: 'Unverified' } as const;
export const CONDITION_LABEL = { active: 'Active', cleared: 'Cleared', unconfirmed: 'Unconfirmed', recovered: 'Recovered', reported: 'Reported' } as const;
/** Conditions that still need attention (used by card indicators). */
export const ATTENTION: ConditionState[] = ['active', 'unconfirmed'];
export const DECISION_LABEL = { none: 'No decision', approved: 'Approved', deferred: 'Deferred', declined: 'Declined' } as const;
export const EXECUTION_LABEL = { 'not-started': 'No execution report', reported: 'Execution reported', verified: 'Execution verified' } as const;
