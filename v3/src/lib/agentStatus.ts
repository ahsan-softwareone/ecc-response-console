// What the agent-status control shows, derived from the run record and the derived scenario state.
// Agent state, source health and equipment condition are reported separately on purpose.
import { useMemo } from 'react';
import { WATCHERS } from '../data/scenario';
import { useStore } from '../store';
import { agentStateOf, currentRun, type AgentState } from './agent';
import { useDerived, useIncidentNow } from './derive';
import { sampleAt } from './series';

const ACTIVITY: Record<string, string> = { procedures: 'Checking procedures', equipment: 'Checking equipment context', monitoring: 'Analysing trends', conflict: 'Comparing reports', assessment: 'Updating assessment', source: 'Retrying a source' };
export interface AgentDisplay { state: AgentState; attention: boolean; label: string; activity: string | null; busy: boolean; concerns: string[]; received: string[]; heldCount: number; lastCheckAt: number | null; lastCheckTitle: string | null; inFlight: string[]; suspendedSince: number | null }

export function useAgentDisplay(): AgentDisplay {
  const d = useDerived();
  const record = useStore((s) => s.records[s.incidentId]);
  const dashboard = useStore((s) => s.dashboard);
  const startedAt = useStore((s) => s.startedAt);
  const revealedAt = useStore((s) => s.revealedAt);
  const saveFailed = useStore((s) => s.save.state === 'failed');
  const simRetrieval = useStore((s) => s.simulateRetrievalFailure);
  const now = useIncidentNow(2000);
  const investigating = useStore((s) => s.investigationProgress);
  return useMemo(() => {
    const state = agentStateOf(record);
    const run = currentRun(record);
    const sources = WATCHERS.filter((w) => dashboard.includes(w.equipmentId)).map((w) => ({ w, smp: sampleAt(w, now, { startedAt, revealedAt }) }));
    const lost = sources.filter((x) => x.smp.source === 'lost'), stale = sources.filter((x) => x.smp.source === 'stale');
    const concerns = [
      ...lost.map((x) => `${x.w.equipmentId} ${x.w.variable.toLowerCase()}: signal lost, value frozen`),
      ...stale.map((x) => `${x.w.equipmentId} ${x.w.variable.toLowerCase()}: stale`),
      ...(simRetrieval ? ['Knowledge retrieval is failing (simulated)'] : []),
      ...(saveFailed ? ['Latest changes are not saved locally'] : []),
    ];
    const heldCount = d.held.alerts.length + d.held.tasks.length + d.held.findings.length;
    const openPause = run?.pauses.find((p) => p.to == null);
    const suspendedSince = state === 'paused' ? openPause?.from ?? null : state === 'stopped' || state === 'error' ? run?.endedAt ?? null : null;
    const pausedFrom = openPause?.from ?? 0;
    const received = [
      ...d.held.alerts, ...d.held.findings,
      ...d.observations.filter((o) => o.kind !== 'agent-finding' && o.kind !== 'route-assessment' && o.time >= pausedFrom).map((o) => `Field: ${o.text}`),
      ...d.fieldReports.filter((r) => r.time >= pausedFrom).map((r) => `Field report: ${r.text}`),
      ...(record?.events ?? []).filter((e) => e.meta?.userSubmitted && e.t >= pausedFrom).map((e) => `Reported: ${e.title}`),
    ];
    const attention = state === 'error' || (saveFailed && (state === 'running' || state === 'paused'));
    const asking = state === 'running' && !attention && !!investigating;
    const busy = asking || (state === 'running' && !attention && !!d.processing);
    const activity = asking ? investigating!.label : busy ? ACTIVITY[d.processing!.kind] ?? d.processing!.title : state === 'running' && !attention ? 'Monitoring · awaiting updates' : null;
    const label = state === 'none' ? 'Agent inactive' : attention ? 'Agent needs attention' : state === 'running' ? 'Agent live' : state === 'paused' ? 'Agent paused' : state === 'stopped' ? 'Agent stopped' : 'Agent not started';
    return { state, attention, label, activity, busy, concerns, received, heldCount, lastCheckAt: d.lastCheckAt, lastCheckTitle: d.lastCheckTitle, inFlight: d.processing ? [d.processing.title] : [], suspendedSince };
  }, [d, record, dashboard, startedAt, revealedAt, now, saveFailed, simRetrieval, investigating]);
}
