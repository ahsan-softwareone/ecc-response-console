// Concise presentation of the current state for the Situation screen. Wording that shortens a
// claim lives here so its qualifiers stay correct: "reported confined" never becomes "contained",
// and a stopped pump never reads as a stopped release.
import { CONNECTIONS } from './catalog';
import { fmt, PERSONNEL_REC, SCRIPT } from './scenario';
import { ACTION_STATUS_LABEL, OUTCOME_LABEL } from './types';
import type { ActionStatus, AgentTask, ApprovalStatus, SourceLocation, Alert, Citation, Connection, DecisionOutcome, DisplaySeverity, EccState, FeedEntry, KDoc, KRevision, Minutes, Monitor, Recommendation, ResponseAction, Source, Trust } from './types';

export const TRUST_SHORT: Record<Trust, string> = {
  verified: 'Verified',
  reported: 'Reported',
  assessment: 'Agent assessment',
  conflict: 'Disputed',
  unknown: 'Unknown',
  'not-reported': 'Not reported',
  unavailable: 'Unavailable',
  stale: 'Out of date',
  'confirmed-absent': 'Checked, not present',
};

/**
 * What the condition means for the reader, separate from how far it can be trusted.
 * A verified adverse condition is still adverse. Presentation only: not a severity scale.
 */
export type ConditionTone = 'adverse' | 'uncertain' | 'neutral';

export interface BriefCondition {
  key: 'fire' | 'release' | 'pump' | 'people';
  label: string;
  value: string;
  note?: string;
  trust: Trust;
  tone: ConditionTone;
  at: Minutes;
  ref: string; // assessment row to open
}

const PHASES = ['prep-1', 'procedures-retrieved', 'prep-2', 'prep-3', 'prep-4', 'fire-team-on-scene', 'flame-out-reported'];

/** The latest scripted event that changed the picture. Source-only events leave the wording as it was. */
export function stage(s: EccState): string {
  for (let i = s.scriptIndex - 1; i >= 0; i--) if (PHASES.includes(SCRIPT[i].id)) return SCRIPT[i].id;
  return 'notification';
}

function personnelState(s: EccState) {
  const rec = s.recommendations.find((r) => r.id === PERSONNEL_REC);
  const dec = rec?.decisionId ? s.decisions.find((d) => d.id === rec.decisionId) : undefined;
  const act = dec?.actionId ? s.actions.find((a) => a.id === dec.actionId) : undefined;
  const last = act?.updates[act.updates.length - 1];
  return { rec, dec, act, last };
}

export function briefConditions(s: EccState): BriefCondition[] {
  const st = stage(s);
  const at = (id: string) => s.rows.find((r) => r.id === id)!.at;
  const early = st === 'notification' || st === 'prep-1' || st === 'procedures-retrieved';

  const fire: BriefCondition = { key: 'fire', label: 'Fire', ref: 'ROW-fire', at: at('ROW-fire'), trust: 'reported', tone: 'adverse', value: 'Flame reported at the pump', note: 'Extent not yet established' };
  if (st === 'fire-team-on-scene') Object.assign(fire, { value: 'Reported confined to the skid', note: 'Not out' });
  else if (st === 'flame-out-reported') Object.assign(fire, { value: 'Reported out at 14:27', note: 'Not independently verified. Fire team keeping watch.', tone: 'uncertain' });
  else if (!early) Object.assign(fire, { value: 'Flame reported on the skid', note: 'Reported at 14:09' });

  const release: BriefCondition = { key: 'release', label: 'Release', ref: 'ROW-release', at: at('ROW-release'), trust: 'reported', tone: 'adverse', value: 'Liquid release reported', note: 'Current status not established' };
  if (st === 'prep-2') Object.assign(release, { value: 'Reported still coming', note: 'Field operator at 14:09' });
  else if (st === 'prep-3' || st === 'prep-4') Object.assign(release, { value: 'Not established', note: 'Field: still coming at 14:09. Control system: zero flow at 14:11.', trust: 'conflict', tone: 'uncertain' });
  else if (st === 'fire-team-on-scene') Object.assign(release, { value: 'Still coming, at a lower rate', note: 'Cause not established' });
  else if (st === 'flame-out-reported') Object.assign(release, { value: 'Residual liquid on the skid', note: 'No active release described. Line isolation not established.', tone: 'uncertain' });

  const controlDelayed = s.sources.find((x) => x.id === 'SRC-CONTROL')?.state === 'delayed';
  const pump: BriefCondition = { key: 'pump', label: 'Pump P-3104B', ref: 'ROW-equipment', at: at('ROW-equipment'), trust: 'not-reported', tone: 'uncertain', value: 'State not yet reported' };
  if (st === 'prep-3' || st === 'prep-4') Object.assign(pump, { value: 'Shown stopped on control system', note: controlDelayed ? 'As of 14:11. Readings delayed since. Not confirmed on scene.' : 'Not yet confirmed on scene', trust: 'reported', tone: 'neutral' });
  else if (st === 'fire-team-on-scene' || st === 'flame-out-reported') Object.assign(pump, { value: 'Stopped', note: 'Does not mean the release has stopped', trust: 'verified', tone: 'neutral' });

  const { dec, act, last } = personnelState(s);
  const people: BriefCondition = { key: 'people', label: 'Personnel', ref: 'ROW-personnel', at: at('ROW-personnel'), trust: 'unknown', tone: 'uncertain', value: 'Accountability unknown', note: 'No injuries reported, but nobody reported as checked' };
  if (dec?.outcome === 'defer') people.note = `Review deferred at ${fmt(dec.at)}. Nobody reported as checked.`;
  else if (dec?.outcome === 'do-not-proceed') people.note = `Decision not to proceed at ${fmt(dec.at)}. Nobody reported as checked.`;
  else if (act?.status === 'no-report') people.note = `Check decided at ${fmt(dec!.at)}. No result reported.`;
  else if (act?.status === 'in-progress' || act?.status === 'could-not-complete') Object.assign(people, { value: 'Accountability not established', note: `${last?.reportedBy}: ${last?.text}`, trust: 'reported' });
  else if (act?.status === 'completion-reported') Object.assign(people, { value: 'Check reported complete', note: `Not yet verified. ${last?.reportedBy}: ${last?.text}`, trust: 'reported' });
  else if (act?.status === 'completion-verified') Object.assign(people, { value: 'Check verified', note: `Latest report: ${last?.text}`, trust: 'verified', tone: 'neutral' });

  return [fire, release, pump, people];
}

export interface PossibleImpact {
  statement: string;
  trust: Trust;
  at: Minutes;
  ref: string;
  /** Equipment the statement concerns, to open for context. */
  assetRefs: string[];
}

/** A possible future consequence. Never to be presented alongside conditions as if it were one. */
export function possibleImpact(s: EccState): PossibleImpact {
  const row = s.rows.find((r) => r.id === 'ROW-wider')!;
  const st = stage(s);
  const known = s.assets.filter((a) => a.identified && a.relation === 'potentially-relevant').map((a) => a.id);
  if (st === 'notification' || st === 'prep-1') return { statement: 'Not yet assessed.', trust: 'unknown', at: row.at, ref: row.id, assetRefs: [] };
  const statement =
    st === 'fire-team-on-scene'
      ? 'Pipe rack PR-31 could still be exposed to heat. Fire team reports flame not reaching it from their position; the rack has not been inspected.'
      : st === 'flame-out-reported'
        ? 'Flame is reported out. Pipe rack PR-31 has not been inspected, and the condition of tank T-3201 has not been reported.'
        : 'Pipe rack PR-31 runs alongside the skid and could be exposed to heat if the flame persists. Not observed.';
  return { statement, trust: 'assessment', at: row.at, ref: row.id, assetRefs: known };
}

export interface Concern {
  id: string;
  title: string;
  detail: string;
  /** Plain status of the human step, where one exists. */
  status?: string;
  action: { label: string; ref: string };
  /** Linked records: the gap, the recommendation and their evidence stay reachable. */
  links: string[];
}

/**
 * Open concerns, ordered people first, then the release, then response follow-up.
 * The order is a presentation assumption following the stated objectives, not a priority classification.
 */
export function concerns(s: EccState): Concern[] {
  const out: Concern[] = [];
  const gap = s.issues.find((i) => i.id === 'ISS-01');
  const { rec, dec, act, last } = personnelState(s);
  const st = stage(s);

  if (gap && gap.status !== 'answered') {
    const links = [rec?.id, gap.id, 'CIT-06', st === 'fire-team-on-scene' || st === 'flame-out-reported' ? 'RPT-006' : undefined, dec?.id, act?.id].filter((x): x is string => !!x);
    const base = st === 'fire-team-on-scene' || st === 'flame-out-reported' ? 'Permit places 4 contractors on PR-31. Fire team has not seen them.' : 'Permit places 4 contractors on PR-31. Nobody reported as checked.';
    const title = 'Personnel accountability unresolved';
    if (!rec) out.push({ id: 'people', title, detail: base, action: { label: 'Open information gap', ref: gap.id }, links });
    else if (rec.status === 'awaiting-review') out.push({ id: 'people', title, detail: base, status: 'Recommendation awaiting review', action: { label: 'Review recommendation', ref: rec.id }, links });
    else if (rec.status === 'deferred') out.push({ id: 'people', title, detail: base, status: 'Review deferred', action: { label: 'Review recommendation', ref: rec.id }, links });
    else if (dec && !act) out.push({ id: 'people', title, detail: 'No check is being tracked. Status not established.', status: `Decided: ${OUTCOME_LABEL[dec.outcome].toLowerCase()}`, action: { label: 'Open decision', ref: dec.id }, links });
    else if (act?.status === 'completion-reported') out.push({ id: 'people', title: 'Accountability check awaiting confirmation', detail: `${last?.reportedBy}: ${last?.text}`, status: ACTION_STATUS_LABEL[act.status], action: { label: 'Review reported completion', ref: act.id }, links });
    else if (act) out.push({ id: 'people', title, detail: last ? `${last.reportedBy}: ${last.text}` : `Check decided at ${fmt(dec!.at)}. No result reported.`, status: ACTION_STATUS_LABEL[act.status], action: { label: 'Open response', ref: act.id }, links });
  }

  const conflict = s.issues.find((i) => i.id === 'ISS-02');
  if (conflict && conflict.status !== 'answered') {
    const links = [conflict.id, ...conflict.refs];
    if (conflict.status === 'open') out.push({ id: 'release', title: 'Reports disagree on the release', detail: 'Field operator saw liquid at 14:09. Control system showed zero flow at 14:11.', action: { label: 'Compare reports', ref: conflict.id }, links });
    else if (st === 'flame-out-reported') out.push({ id: 'release', title: 'Line isolation not established', detail: 'Residual liquid reported on the skid. No report establishes the line is isolated.', action: { label: 'Compare reports', ref: conflict.id }, links: [...links, 'RPT-007'] });
    else out.push({ id: 'release', title: 'Release continuing with the pump stopped', detail: 'Why liquid is still coming is not established.', action: { label: 'Compare reports', ref: conflict.id }, links });
  }

  s.actions
    .filter((a) => a.id !== act?.id)
    .forEach((a) => {
      const u = a.updates[a.updates.length - 1];
      if (a.status === 'completion-reported') out.push({ id: a.id, title: `${a.title}: awaiting confirmation`, detail: `${u?.reportedBy} reports it complete. Nobody has confirmed it.`, status: ACTION_STATUS_LABEL[a.status], action: { label: 'Review reported completion', ref: a.id }, links: [a.id, u?.reportId ?? ''].filter(Boolean) });
      if (a.status === 'could-not-complete') out.push({ id: a.id, title: `${a.title}: could not complete`, detail: `${u?.reportedBy}: ${u?.text}`, status: ACTION_STATUS_LABEL[a.status], action: { label: 'Open response', ref: a.id }, links: [a.id, u?.reportId ?? ''].filter(Boolean) });
    });
  return out;
}

const OTHER_OPEN_LABEL: Record<string, string> = {
  'ISS-03': 'Maintenance history unavailable',
  'ISS-04': 'Wind reading out of date',
};

/** Open questions that are real but do not need a decision. Quiet, never dropped. */
export function otherOpenItems(s: EccState): { id: string; label: string }[] {
  return s.issues.filter((i) => i.status !== 'answered' && OTHER_OPEN_LABEL[i.id]).map((i) => ({ id: i.id, label: OTHER_OPEN_LABEL[i.id] }));
}

export interface ResponseLine {
  id: string;
  title: string;
  /** The human decision, shown apart from what has been reported in the field. */
  decision?: { id: string; outcome: DecisionOutcome; outcomeLabel: string; by: string; role: string; at: Minutes };
  /** Null where the decision creates nothing to track. */
  response: { id: string; status: ActionStatus; statusLabel: string; lastBy?: string; lastAt?: Minutes } | null;
}

/** What has been decided and what has been reported done. The system performs none of it. */
export function responseLines(s: EccState): ResponseLine[] {
  const decisionOf = (id?: string) => {
    const d = s.decisions.find((x) => x.id === id);
    return d && { id: d.id, outcome: d.outcome, outcomeLabel: OUTCOME_LABEL[d.outcome], by: d.recordedBy, role: d.recordedByRole, at: d.at };
  };
  const fromActions = s.actions.map<ResponseLine>((a) => {
    const u = a.updates[a.updates.length - 1];
    return { id: a.id, title: a.title, decision: decisionOf(a.decisionId), response: { id: a.id, status: a.status, statusLabel: ACTION_STATUS_LABEL[a.status], lastBy: u?.reportedBy, lastAt: u?.at } };
  });
  const decidedNoAction = s.recommendations
    .filter((r) => r.decisionId && !s.decisions.find((d) => d.id === r.decisionId)?.actionId)
    .map<ResponseLine>((r) => ({ id: r.decisionId!, title: r.responseTitle, decision: decisionOf(r.decisionId), response: null }));
  return [...fromActions, ...decidedNoAction];
}

/** One plain sentence on the state of the brief. Detail stays in Agent activity. */
export function agentHeadline(s: EccState): string {
  if (s.preparing) {
    const active = s.prepSteps.find((p) => p.status === 'active');
    return active ? `Preparing brief: ${active.label.charAt(0).toLowerCase()}${active.label.slice(1)}` : 'Preparing brief';
  }
  return `Brief updated ${fmt(Math.max(...s.rows.map((r) => r.at)))}`;
}

// --- Feed ------------------------------------------------------------------------------------

/** Newest first. Superseded entries stay, marked, so the history of the picture is kept. */
export function feedEntries(s: EccState): FeedEntry[] {
  return [...s.feed].sort((a, b) => b.publishedAt - a.publishedAt || b.seq - a.seq);
}

const reviewSeq = (s: EccState) => {
  if (s.reviewedAt === null) return 0;
  return s.changesSeenSeq;
};

export function isUnreviewed(s: EccState, e: FeedEntry): boolean {
  return e.seq > reviewSeq(s);
}

/** Consequential entries stay marked until the user sets a review point or a later entry supersedes them. */
export function openConsequential(s: EccState): FeedEntry[] {
  return feedEntries(s).filter((e) => e.consequential && isUnreviewed(s, e) && !e.supersededBy);
}

export interface CatchUp {
  /** Null means since the incident began. */
  since: Minutes | null;
  entries: FeedEntry[];
  consequential: FeedEntry[];
  revisions: FeedEntry[];
  decisionsAndResponse: FeedEntry[];
}

export function catchUp(s: EccState): CatchUp {
  const entries = feedEntries(s).filter((e) => isUnreviewed(s, e));
  return {
    since: s.reviewedAt,
    entries,
    consequential: openConsequential(s),
    revisions: entries.filter((e) => e.feedKind === 'assessment'),
    decisionsAndResponse: entries.filter((e) => e.feedKind === 'decision' || e.feedKind === 'response'),
  };
}

// --- Observability ---------------------------------------------------------------------------

export interface BriefHealth {
  state: 'preparing' | 'current' | 'limited';
  label: string;
  updatedAt: Minutes;
  limits: { source: Source; effect: string }[];
}

/** Whether the brief is current or limited by its sources. Never a claim of being live. */
export function briefHealth(s: EccState): BriefHealth {
  const updatedAt = Math.max(...s.rows.map((r) => r.at));
  const limits = s.sources.filter((x) => x.state !== 'connected').map((source) => ({ source, effect: source.effect ?? 'This source is limiting the brief.' }));
  if (s.preparing) return { state: 'preparing', label: 'Preparing brief', updatedAt, limits };
  if (limits.length) return { state: 'limited', label: `Brief limited by ${limits.length} ${limits.length === 1 ? 'source' : 'sources'}`, updatedAt, limits };
  return { state: 'current', label: 'No source limitations', updatedAt, limits };
}

/** Timeline order: when it entered the record, newest first, ties by record order. Event time stays as metadata. */
export function timeline(s: EccState) {
  return [...s.log].sort((a, b) => b.at - a.at || b.seq - a.seq);
}

export function incomingReports(s: EccState) {
  return [...s.reports].sort((a, b) => b.receivedAt - a.receivedAt || s.reports.indexOf(b) - s.reports.indexOf(a));
}

/** Execution records in start-time order: the declared basis for all activity lists. */
export function execRecords(s: EccState) {
  return [...s.activity].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

export function taskSteps(s: EccState, taskId: string) {
  return execRecords(s).filter((r) => r.taskId === taskId);
}

/** Outputs a task produced: its records' feed entries, once each. */
export function taskOutputs(s: EccState, taskId: string): FeedEntry[] {
  const ids = new Set(taskSteps(s, taskId).flatMap((r) => r.outputs));
  return feedEntries(s).filter((f) => ids.has(f.id));
}

export function agentTasks(s: EccState): AgentTask[] {
  const rank: Record<AgentTask['status'], number> = { blocked: 0, waiting: 1, running: 2, completed: 3, 'not-started': 4 };
  return [...s.tasks].sort((a, b) => rank[a.status] - rank[b.status] || (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

// --- Monitoring --------------------------------------------------------------------------------

export function latestSample(m: Monitor) {
  return m.samples[m.samples.length - 1];
}

export function monitorAge(s: EccState, m: Monitor): number {
  return s.now - latestSample(m).observedAt;
}

export interface MonitoringSummary {
  monitored: number;
  alerts: Alert[];
  degraded: Source[];
  /** Readings older than this many minutes are shown as old. Display choice only, not a threshold on the plant. */
  oldest: { monitor: Monitor; ageMinutes: number } | null;
}

export function monitoringSummary(s: EccState): MonitoringSummary {
  const alerts = s.monitors.flatMap((m) => (m.alert ? [m.alert] : [])).sort((a, b) => SEV_RANK[a.display] - SEV_RANK[b.display] || a.raisedAt - b.raisedAt);
  const ids = new Set(s.monitors.map((m) => m.sourceId));
  const degraded = s.sources.filter((x) => ids.has(x.id) && x.state !== 'connected');
  const aged = s.monitors.map((monitor) => ({ monitor, ageMinutes: monitorAge(s, monitor) })).sort((a, b) => b.ageMinutes - a.ageMinutes);
  return { monitored: s.monitors.length, alerts, degraded, oldest: aged[0] ?? null };
}

const SEV_RANK: Record<DisplaySeverity, number> = { urgent: 0, warning: 1, advisory: 2 };

/** The attention item an entry relates to, so the feed can link instead of repeating. */
export function linkedConcern(s: EccState, e: FeedEntry): Concern | undefined {
  return concerns(s).find((c) => c.links.includes(e.action?.ref ?? '') || c.action.ref === e.action?.ref || e.citations.some((x) => c.action.ref === x));
}

export function isScenarioFinished(s: EccState): boolean {
  return s.scriptIndex >= SCRIPT.length;
}

/** The feed entry an execution record produced, and the records behind a feed entry. */
export function execForFeed(s: EccState, id: string) {
  const e = s.feed.find((f) => f.id === id);
  return e ? s.activity.filter((r) => e.activity.includes(r.id)) : [];
}

// --- Citations and knowledge ------------------------------------------------------------------

export function citationRevision(s: EccState, c: Citation): KRevision | undefined {
  return c.docId ? s.knowledge.find((d) => d.id === c.docId)?.revisions.find((r) => r.rev === c.revision) : undefined;
}

/** A newer effective revision than the one cited. The citation itself is never changed. */
export function newerRevision(s: EccState, c: Citation): KRevision | undefined {
  const doc = c.docId ? s.knowledge.find((d) => d.id === c.docId) : undefined;
  const cur = doc?.revisions.find((r) => r.approval === 'effective');
  return cur && cur.rev !== c.revision ? cur : undefined;
}

/** Published citations in this incident that used a document. Used by the agent, not merely uploaded. */
export function documentUse(s: EccState, doc: KDoc): { citation: Citation; entries: FeedEntry[] }[] {
  const out: { citation: Citation; entries: FeedEntry[] }[] = [];
  s.citations
    .filter((c) => c.docId === doc.id)
    .forEach((citation) => {
      const entries = s.feed.filter((f) => f.citations.includes(citation.id));
      if (entries.length) out.push({ citation, entries });
    });
  return out;
}

// --- Assets ------------------------------------------------------------------------------------

/** Connections for an asset, by kind. Only between items the agent has identified so far. */
export function assetConnections(s: EccState, id: string): Connection[] {
  const known = (a: string) => s.assets.some((x) => x.id === a && x.identified);
  return CONNECTIONS.filter((c) => (c.from === id || c.to === id) && known(c.from) && known(c.to));
}

export function visibleConnections(s: EccState): Connection[] {
  const known = (a: string) => s.assets.some((x) => x.id === a && x.identified);
  return CONNECTIONS.filter((c) => known(c.from) && known(c.to));
}

export function assetLinks(s: EccState, id: string) {
  const tag = s.assets.find((a) => a.id === id)?.tag ?? '';
  return {
    feed: feedEntries(s).filter((e) => e.assets.includes(id)),
    issues: s.issues.filter((i) => i.refs.some((r) => s.docs.find((d) => d.id === r)?.assetIds.includes(id) || s.reports.find((x) => x.id === r)?.assetIds.includes(id))),
    rows: s.rows.filter((r) => r.refs.includes(id) || r.statement.includes(tag)),
    documents: s.knowledge.filter((d) => d.equipment.includes(tag) || (d.area !== 'All areas' && d.area.includes(tag))),
    recommendations: s.recommendations.filter((r) => r.title.includes(tag) || r.evidence.some((e) => s.reports.find((x) => x.id === e)?.assetIds.includes(id))),
    actions: s.actions.filter((a) => a.updates.some((u) => s.reports.find((x) => x.id === u.reportId)?.assetIds.includes(id))),
  };
}

// --- Actions -----------------------------------------------------------------------------------

export interface ActionGroups {
  needsDecision: Recommendation[];
  underway: ResponseAction[];
  completionReported: ResponseAction[];
  completionVerified: ResponseAction[];
  /** Decided with nothing to track, such as a decision not to proceed. */
  decidedNoResponse: Recommendation[];
}

export function actionGroups(s: EccState): ActionGroups {
  return {
    needsDecision: s.recommendations.filter((r) => r.status === 'awaiting-review' || r.status === 'deferred'),
    underway: s.actions.filter((a) => a.status === 'no-report' || a.status === 'in-progress' || a.status === 'could-not-complete'),
    completionReported: s.actions.filter((a) => a.status === 'completion-reported'),
    completionVerified: s.actions.filter((a) => a.status === 'completion-verified'),
    decidedNoResponse: s.recommendations.filter((r) => r.status === 'decided' && !s.decisions.find((d) => d.id === r.decisionId)?.actionId),
  };
}

// --- Source viewer -----------------------------------------------------------------------------

export type SourceTarget =
  | { mode: 'file'; file: string; format: 'pdf' | 'other'; title: string; typeLabel: string; revision?: string; approval?: ApprovalStatus; effectiveFrom?: string; location?: SourceLocation; excerpt?: string; supports?: string; citationId?: string; docId?: string; newer?: KRevision; retrievedAt?: Minutes; illustrative?: boolean; sheetName?: string }
  | { mode: 'report'; reportId: string; title: string; typeLabel: string }
  | { mode: 'reading'; monitorId: string; title: string; typeLabel: string; supports?: string; citationId?: string }
  | { mode: 'record'; recordId: string; title: string; typeLabel: string; supports?: string; citationId?: string }
  | { mode: 'unavailable'; title: string; typeLabel: string; reason: string; supports?: string; recordId?: string };

const fileFormat = (f: string): 'pdf' | 'other' => (f.toLowerCase().endsWith('.pdf') ? 'pdf' : 'other');

/**
 * What to open for any record, so every destination opens sources the same way.
 * Keeps the revision the citation used. A newer one is offered, never substituted.
 */
export function sourceTarget(s: EccState, id: string, rev?: string): SourceTarget | undefined {
  const report = s.reports.find((r) => r.id === id);
  if (report) return { mode: 'report', reportId: id, title: report.sourceRole, typeLabel: 'Incoming report' };
  const mon = s.monitors.find((m) => m.id === id);
  if (mon) return { mode: 'reading', monitorId: id, title: mon.name, typeLabel: 'Monitored reading' };
  const cit = s.citations.find((c) => c.id === id);
  if (cit) {
    if (cit.monitorId) return { mode: 'reading', monitorId: cit.monitorId, title: cit.title, typeLabel: 'Monitored reading', supports: cit.supports, citationId: cit.id };
    const docRev = citationRevision(s, cit);
    const file = cit.file ?? docRev?.file;
    if (!file) return cit.recordId ? { mode: 'record', recordId: cit.recordId, title: cit.title, typeLabel: 'System record', supports: cit.supports, citationId: cit.id } : { mode: 'unavailable', title: cit.title, typeLabel: 'Reference', reason: cit.openFailure ?? 'No original file is held for this reference.', supports: cit.supports };
    const doc = cit.docId ? s.knowledge.find((d) => d.id === cit.docId) : undefined;
    return { mode: 'file', file, format: fileFormat(file), title: cit.title, typeLabel: doc?.docType ?? (cit.sourceType === 'record' ? 'Record' : 'Document'), revision: cit.revision, approval: docRev?.approval, effectiveFrom: docRev?.effectiveFrom, location: cit.location, excerpt: cit.excerpt, supports: cit.supports, citationId: cit.id, docId: cit.docId, newer: newerRevision(s, cit), retrievedAt: cit.retrievedAt, illustrative: cit.illustrative, sheetName: cit.sheetName };
  }
  const k = s.knowledge.find((d) => d.id === id);
  if (k) {
    const r = k.revisions.find((x) => x.rev === rev) ?? k.revisions.find((x) => x.approval === 'effective') ?? k.revisions[0];
    if (!r?.file) return { mode: 'unavailable', title: k.title, typeLabel: k.docType, reason: r?.processingNote ?? 'No original file is held for this document.' };
    return { mode: 'file', file: r.file, format: fileFormat(r.file), title: `${k.docNumber}: ${k.title}`, typeLabel: k.docType, revision: r.rev, approval: r.approval, effectiveFrom: r.effectiveFrom, docId: k.id, illustrative: !!r.sheet };
  }
  const doc = s.docs.find((d) => d.id === id);
  if (doc) {
    if (doc.availability === 'unavailable') return { mode: 'unavailable', title: doc.title, typeLabel: doc.docType, reason: doc.summary, recordId: doc.id };
    if (id === 'DOC-06') return { mode: 'reading', monitorId: 'MON-WIND', title: doc.title, typeLabel: 'Monitored reading' };
    const cite = s.citations.find((c) => c.recordId === id);
    if (cite) return sourceTarget(s, cite.id);
    return { mode: 'record', recordId: id, title: doc.title, typeLabel: 'System record' };
  }
  return undefined;
}
