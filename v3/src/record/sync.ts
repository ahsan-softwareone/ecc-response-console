// Keeps the current incident's record in step with what has become visible.
import { useEffect, useMemo } from 'react';
import { useDerived } from '../lib/derive';
import type { Clock } from '../lib/series';
import { now } from '../lib/time';
import { useStore } from '../store';
import { collectEvents, issueEvents } from './materialize';
import type { DecisionEvent } from './types';

export function useRecordSync() {
  const d = useDerived();
  const incidentId = useStore((s) => s.incidentId);
  const startedAt = useStore((s) => s.startedAt);
  const revealedAt = useStore((s) => s.revealedAt);
  const alertUser = useStore((s) => s.alertUser);
  const dashboard = useStore((s) => s.dashboard);
  const issueUser = useStore((s) => s.issueUser);
  const placements = useStore((s) => s.placements);
  const userIssues = useStore((s) => s.userIssues);
  const storageReady = useStore((s) => s.storageReady);
  const record = useStore((s) => s.records[incidentId]);
  const appendEvents = useStore((s) => s.appendEvents);
  const clock: Clock = useMemo(() => ({ startedAt, revealedAt }), [startedAt, revealedAt]);

  useEffect(() => {
    if (!storageReady || !record || record.status === 'closed') return;
    const existing = new Set(record.events.map((e) => e.id));
    const events = [...collectEvents(d, alertUser, clock, now(), existing, dashboard), ...issueEvents(issueUser, placements, userIssues, now(), existing)].sort((a, b) => a.t - b.t);
    if (!events.length) return;
    const all = [...record.events, ...events];
    for (const e of events) if (e.kind === 'decision') (e as DecisionEvent).knownEventCount = all.filter((x) => x.t <= e.t && x.id !== e.id).length;
    void appendEvents(incidentId, events);
  }, [d, alertUser, issueUser, placements, userIssues, clock, dashboard, storageReady, record, incidentId, appendEvents]);
}
