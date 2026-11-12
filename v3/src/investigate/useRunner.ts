// Picks up queued investigations while the agent is running. Nothing runs while it is paused,
// stopped or not started, and an investigation interrupted by a pause goes back to the queue.
import { useEffect, useRef, useState } from 'react';
import { agentStateOf, processingWindows } from '../lib/agent';
import { derive } from '../lib/derive';
import { now } from '../lib/time';
import { useStore } from '../store';
import { basisOf, newEvidenceSince, runEngine } from './engine';
import { retrieval } from '../lib/retrieval';
import type { Investigation } from '../record/types';

export function useInvestigationRunner() {
  const record = useStore((s) => s.records[s.incidentId]);
  const ready = useStore((s) => s.storageReady);
  const indexReady = useStore((s) => s.indexReady);
  const busy = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ready || !indexReady || busy.current || !record || record.status === 'closed' || agentStateOf(record) !== 'running' || retrieval.size === 0) return;
    const invs = record.investigations ?? [];
    let next: Investigation | undefined = invs.find((i) => i.status === 'queued' || i.status === 'running');
    let reason: string | undefined;
    if (!next) {
      // New evidence on tracked equipment leads to a revised assessment. The earlier one is kept.
      for (const i of invs) {
        const last = i.responses[i.responses.length - 1];
        if (i.status !== 'complete' || !last?.tracks.length) continue;
        if (basisOf(record, i, last.tracks, now()) === last.basis) continue;
        const fresh = newEvidenceSince(record, i, last.basis);
        next = i; reason = fresh.length ? `New evidence: ${fresh.slice(0, 2).map((e) => e.title).join('; ')}${fresh.length > 2 ? ` and ${fresh.length - 2} more` : ''}` : 'New evidence on this equipment';
        break;
      }
    }
    if (!next) return;
    busy.current = true;
    const id = record.id; const invId = next.id; const updateReason = reason;
    void (async () => {
      const store = useStore.getState();
      await store.setInvestigationStatus(id, invId, 'running');
      const stillRunning = () => { const st = useStore.getState(); return st.incidentId === id && agentStateOf(st.records[id]) === 'running'; };
      try {
        const st = useStore.getState(); const r = st.records[id]; const inv = r?.investigations?.find((x) => x.id === invId);
        if (!r || !inv) return;
        const t = now();
        const derived = derive(st.startedAt, st.revealedAt, t, { scenario: st.incidentMode === 'training', windows: r.agentRuns ? processingWindows(r.agentRuns) : [], real: st.incidentMode === 'real' ? { base: Math.max(st.startedAt, r.createdAt ?? 0), equipment: st.dashboard, site: r.site } : null });
        const res = await runEngine({ record: r, inv, derived, clock: { startedAt: st.startedAt, revealedAt: st.revealedAt }, now: t, dashboard: st.dashboard, startedAt: t, updateReason, stillRunning, progress: async (label) => { useStore.getState().setInvestigationProgress({ id: invId, label }); } });
        const after = useStore.getState();
        if (res.kind === 'aborted') await after.setInvestigationStatus(id, invId, inv.responses.length ? 'complete' : 'queued');
        else if (res.kind === 'clarify') await after.askClarification(id, invId, res.question, res.options, res.needsBasis);
        else await after.completeInvestigation(id, invId, res.response, res.task, res.event);
      } catch (e) {
        // The observation or question is already saved. Only this analysis attempt failed.
        await useStore.getState().failInvestigation(id, invId, e instanceof Error ? e.message : String(e));
      } finally {
        useStore.getState().setInvestigationProgress(null);
        busy.current = false;
        setTick((x) => x + 1);
      }
    })();
  }, [record, ready, indexReady, tick]);
}
