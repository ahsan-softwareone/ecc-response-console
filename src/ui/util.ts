// Small presentation helpers. No scenario text lives here; everything comes from state.
import { fmt } from '../domain/scenario';
import { resolveRecord } from '../domain/content';
import type { EccState, Issue, IssueType, LogEntry, Minutes, Report } from '../domain/types';

export { fmt };

export function elapsedLabel(now: Minutes, from: Minutes): string {
  const d = Math.max(0, now - from);
  if (d < 60) return `T+${d} min`;
  return `T+${Math.floor(d / 60)} h ${String(d % 60).padStart(2, '0')} min`;
}

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  conflict: 'Conflict',
  missing: 'Missing',
  stale: 'Out of date',
  unavailable: 'Unavailable',
};

export const ISSUE_STATUS_LABEL: Record<Issue['status'], string> = {
  open: 'Open',
  'partly-answered': 'Partly answered',
  answered: 'Answered',
};

export const OBSERVATION_LABEL = {
  direct: 'Direct observation',
  instrument: 'Instrument reading via control room',
} as const;

export const CHANNEL_LABEL: Record<Report['channel'], string> = {
  'control-room': 'Control room',
  field: 'Field',
  'fire-team': 'Fire team',
  security: 'Site Security',
  'user-entry': 'Entered in this workspace',
};

/** Where a log entry came from, for the timeline. */
export function logSource(s: EccState, e: LogEntry): string {
  if (e.kind === 'agent') return 'Agent';
  const r = e.ref ? resolveRecord(s, e.ref) : undefined;
  if (!r) return e.kind === 'assessment' || e.kind === 'recommendation' ? 'Agent' : '';
  switch (r.kind) {
    case 'report':
      return r.channel === 'user-entry' ? `${r.sourceName} (entered by ${r.enteredBy ?? 'user'})` : `${r.sourceName}, ${r.sourceRole}`;
    case 'document':
      return r.sourceSystem;
    case 'decision':
      return `${r.recordedBy}, ${r.recordedByRole}`;
    case 'action': {
      if (r.verification && r.verification.at === e.at) return r.verification.by;
      const last = r.updates.filter((u) => u.at <= e.at).pop();
      return last ? last.reportedBy : 'Record';
    }
    case 'issue':
    case 'assessment':
    case 'recommendation':
      return 'Agent';
    default:
      return 'Record';
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Pseudo rail entries that are not incident records. */
export const RAIL_DRAFT_PREFIX = 'view:draft-version:';

export function isPseudoRailId(id: string): boolean {
  return id.startsWith('view:');
}

/** A reading's age in plain words. A display choice, not a threshold on the plant. */
export function ageLabel(minutes: number): string {
  if (minutes <= 0) return 'Current';
  if (minutes < 60) return `${minutes} min old`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min old`;
}

export function durationLabel(ms?: number): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60000)} min`;
}
