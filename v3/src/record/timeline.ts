// Selectors over the self-contained incident record: the timeline, "what was
// known at" a time, supersession/gap derivations and SITREP generation as of a time.
import type { DecisionEvent, IncidentRecord, RecommendationEvent, RecordEvent, RecordKind, SitrepSections } from './types';

export type Category = 'ECC feedback' | 'Told / followed up' | 'Issue' | 'Incident severity' | 'Investigation' | 'Agent control' | 'Configuration' | 'Lifecycle' | 'Resolution' | 'Notification' | 'Equipment' | 'Measurement' | 'Observation' | 'Acknowledgement' | 'Alert' | 'Finding' | 'Recommendation' | 'Decision' | 'Reported action' | 'Outcome' | 'Information gap' | 'Agent activity' | 'Reference' | 'Knowledge' | 'Report version' | 'Stabilization' | 'Closure' | 'Correction' | 'Lesson learned';
export const CATEGORY: Record<RecordKind, Category> = {
  feedback: 'ECC feedback', notice: 'Told / followed up', issue: 'Issue', severity: 'Incident severity', investigation: 'Investigation', 'agent-control': 'Agent control', config: 'Configuration', lifecycle: 'Lifecycle', resolution: 'Resolution',
  notification: 'Notification', equipment: 'Equipment', measurement: 'Measurement', observation: 'Observation', acknowledgement: 'Acknowledgement', alert: 'Alert', finding: 'Finding', recommendation: 'Recommendation', decision: 'Decision', report: 'Reported action', outcome: 'Outcome', gap: 'Information gap', agent: 'Agent activity', reference: 'Reference', knowledge: 'Knowledge', 'report-version': 'Report version', stabilization: 'Stabilization', closure: 'Closure', correction: 'Correction', lesson: 'Lesson learned',
};
export const CATEGORIES: Category[] = ['Incident severity', 'Issue', 'Notification', 'Equipment', 'Measurement', 'Observation', 'Investigation', 'Acknowledgement', 'Alert', 'Finding', 'Recommendation', 'Decision', 'Reported action', 'Outcome', 'Information gap', 'Agent activity', 'Reference', 'Knowledge', 'Report version', 'Stabilization', 'Closure', 'Correction', 'Lesson learned', 'Agent control', 'Configuration', 'Lifecycle', 'Resolution'];

export interface TimelineRow { ev: RecordEvent; category: Category; correctedBy?: RecordEvent }
export interface TimelineFilter { query?: string; categories?: Category[]; asOf?: number }

export function timeline(r: IncidentRecord, f: TimelineFilter = {}, newestFirst = false): TimelineRow[] {
  const corrections = new Map<string, RecordEvent>();
  for (const e of r.events) if (e.corrects) corrections.set(e.corrects, e);
  const q = f.query?.trim().toLowerCase();
  let rows = r.events.map((ev) => ({ ev, category: CATEGORY[ev.kind], correctedBy: corrections.get(ev.id) }));
  if (f.asOf != null) rows = rows.filter((x) => x.ev.t <= f.asOf!);
  if (f.categories?.length) rows = rows.filter((x) => f.categories!.includes(x.category));
  if (q) rows = rows.filter((x) => `${x.ev.title} ${x.ev.detail ?? ''} ${x.ev.equipmentId ?? ''} ${x.ev.by ?? ''} ${x.category}`.toLowerCase().includes(q));
  rows.sort((a, b) => (newestFirst ? b.ev.t - a.ev.t : a.ev.t - b.ev.t) || (newestFirst ? b.ev.recordedAt - a.ev.recordedAt : a.ev.recordedAt - b.ev.recordedAt));
  return rows;
}

export function knownAt(r: IncidentRecord, t: number): RecordEvent[] { return r.events.filter((e) => e.t <= t).sort((a, b) => a.t - b.t); }

const fmt = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** The supersession entry (if any, within asOf) for the recommendation attached to an alert. */
export function supersessionOf(r: IncidentRecord, alertId: string, asOf: number): { t: number; reason: string } | null {
  const e = r.events.find((x) => x.kind === 'recommendation' && x.meta?.superseded && x.meta?.alertId === alertId && x.t <= asOf);
  return e ? { t: e.t, reason: e.detail ?? '' } : null;
}
/** Whether an alert's condition was cleared (an outcome entry) within asOf. */
export function clearedAt(r: IncidentRecord, alertId: string, asOf: number): number | null {
  const e = r.events.find((x) => x.kind === 'outcome' && x.meta?.cleared && x.meta?.alertId === alertId && x.t <= asOf);
  return e ? e.t : null;
}

/** Note appended to a decision whose recommendation was superseded after it (within asOf). */
export function decisionNote(r: IncidentRecord, d: DecisionEvent, asOf: number): string | null {
  const s = supersessionOf(r, d.alertId, asOf);
  if (!s) return null;
  const after = s.t > d.t; // one scenario clock: time order is knowledge order
  return after ? `Superseded ${fmt(s.t)}, after this decision: ${s.reason}` : `Recommendation had been superseded at ${fmt(s.t)} before this decision`;
}

export type GapStatus = 'open' | 'resolved' | 'no-longer-applicable';
/** Status of each information-gap entry as of a time. */
export function gapStatus(r: IncidentRecord, asOf: number): Map<string, GapStatus> {
  const out = new Map<string, GapStatus>();
  for (const g of r.events) {
    if (g.kind !== 'gap' || g.t > asOf) continue;
    const alertId = g.meta?.alertId ? String(g.meta.alertId) : null;
    let st: GapStatus = 'open';
    if (alertId) {
      if (g.meta?.prerequisite && supersessionOf(r, alertId, asOf)) st = 'no-longer-applicable';
      else if (clearedAt(r, alertId, asOf)) st = 'resolved';
    }
    out.set(g.id, st);
  }
  return out;
}

/** Recommendations still applicable as of a time: not superseded and their alert not cleared. */
export function activeRecommendations(r: IncidentRecord, asOf: number): RecommendationEvent[] {
  return r.events.filter((e): e is RecommendationEvent => e.kind === 'recommendation' && !e.meta?.superseded && e.t <= asOf).filter((e) => !supersessionOf(r, e.alertId, asOf) && !clearedAt(r, e.alertId, asOf)).sort((a, b) => b.t - a.t);
}

/** SITREP sections generated from the record as of a time. Point-in-time: nothing after asOf enters. */
export function generateSitrep(r: IncidentRecord, asOf: number): SitrepSections {
  const evs = knownAt(r, asOf);
  const narrative = [...evs].reverse().find((e) => e.kind === 'finding' && e.meta?.narrative);
  const assessment = [...evs].reverse().find((e) => e.kind === 'finding' && e.meta?.assessment);
  const alerts = evs.filter((e) => e.kind === 'alert') as (RecordEvent & { severity: string; state: string })[];
  const open = alerts.filter((a) => !clearedAt(r, String(a.meta?.alertId), asOf) && (a.severity === 'critical' || a.severity === 'high') && a.state !== 'recovered' && a.state !== 'reported');
  const decisions = evs.filter((e): e is DecisionEvent => e.kind === 'decision');
  const reports = evs.filter((e) => e.kind === 'report');
  const outcomes = evs.filter((e) => e.kind === 'outcome');
  const gaps = gapStatus(r, asOf);
  const openGaps = evs.filter((e) => e.kind === 'gap' && gaps.get(e.id) === 'open');
  const recs = activeRecommendations(r, asOf);
  const narrativeText = narrative?.detail?.split('\n') ?? [];
  const nextLine = narrativeText.find((l) => l.startsWith('Next: '))?.slice(6);
  const situationLines = [assessment ? assessment.title : (narrativeText[0] ?? 'No assessment recorded yet.'), open.length ? `Open Critical/High conditions: ${open.map((a) => a.title).join('; ')}.` : 'No open Critical or High conditions.', r.stabilization && r.stabilization.t <= asOf ? `Stabilization recorded ${fmt(r.stabilization.t)} by ${r.stabilization.by}: ${r.stabilization.rationale}` : ''].filter(Boolean);
  const response = [narrativeText.find((l) => l.startsWith('Response: '))?.slice(10) ?? '', reports.length ? `Reported actions: ${reports.map((e) => `${fmt(e.t)} ${e.title} (${e.by ?? 'field'}, ${(e as { status?: string }).status ?? 'reported'})`).join('; ')}.` : 'No field actions reported.', outcomes.length ? `Observed outcomes: ${outcomes.map((e) => `${fmt(e.t)} ${e.title}`).join('; ')}.` : 'No observed outcomes yet.'].filter(Boolean).join('\n');
  const decisionsText = decisions.length ? decisions.map((d) => { const note = decisionNote(r, d, asOf); return `${fmt(d.t)} ${d.title} — ${d.by}${d.rationale ? `: ${d.rationale}` : ''}${note ? ` [${note}]` : ''}`; }).join('\n') : 'No decisions recorded.';
  const outstanding = [...open.map((a) => `${a.severity === 'critical' ? 'Critical' : 'High'}: ${a.title}`), ...openGaps.map((g) => g.title)];
  // Reported observations and unreconciled conflicts only. The question-and-answer exchange stays in the record, not the SITREP.
  const reported = evs.filter((e) => e.kind === 'observation' && e.meta?.userSubmitted);
  for (const inv of r.investigations ?? []) {
    const latest = [...inv.responses].reverse().find((x) => x.t <= asOf);
    if (latest) for (const c of latest.conflicts) outstanding.push(`Unreconciled evidence: ${c.a} / ${c.b}`);
  }
  const reportedLines = reported.map((e) => `Reported, not independently verified: "${e.title}" (${String(e.meta?.sourceLabel ?? 'reported')}, received ${fmt(e.t)}).`);
  const priorities = [nextLine ? `Next: ${nextLine}` : '', ...recs.map((x) => `${x.summary}${x.prerequisites.length ? ` (outstanding: ${x.prerequisites.join('; ')})` : ''}`)].filter(Boolean);
  const situation = [...situationLines, ...reportedLines].join('\n');
  return { situation, response, decisions: decisionsText, outstanding: outstanding.length ? outstanding.join('\n') : 'None recorded.', priorities: priorities.length ? priorities.join('\n') : 'No current recommendation.' };
}

export function recordSummary(r: IncidentRecord) {
  const c = (k: RecordKind) => r.events.filter((e) => e.kind === k).length;
  return { alerts: c('alert'), decisions: c('decision'), reports: c('report'), findings: c('finding'), recommendations: c('recommendation'), agent: c('agent'), corrections: c('correction') };
}
