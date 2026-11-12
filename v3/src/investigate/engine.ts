// Bounded, deterministic investigation of a question or observation. No language model is connected.
// It recognises a small set of request types and otherwise returns matching passages and says so.
// It reads only the incident record, time-gated readings and the Knowledge index, all as of now,
// so it cannot know anything the scenario has not yet revealed.
import { EQUIPMENT, WATCHERS } from '../data/scenario';
import type { WatcherDef } from '../data/types';
import { AGENT_BUILD, currentRun } from '../lib/agent';
import type { Derived } from '../lib/derive';
import { retrieval, tokenize, type Passage } from '../lib/retrieval';
import { urgentWording } from './urgency';
import { formatValue, sampleAt, type Clock, type Sample } from '../lib/series';
import { activeRecommendations, gapStatus } from '../record/timeline';
import type { AgentEvent, AlertEvent, EvidenceItem, IncidentRecord, Investigation, InvestigationResponse, PinnedEvidence, RecordEvent } from '../record/types';

export const PROGRESS = { context: 'Checking incident context', readings: 'Checking current readings', compare: 'Comparing the report with current readings', documents: 'Reviewing relevant procedures', assess: 'Preparing an assessment' } as const;

const ALIASES: [RegExp, string][] = [
  [/\bdeluge\b|\bds-?029\b/i, 'DS-029'], [/flare header|\bfh-?01\b/i, 'FH-01'], [/hp separator|\bd-?0001\b/i, 'D-0001'], [/propane accumulator|\bd-?0029\b/i, 'D-0029'],
  [/fire ?water|\bfw-?01\b/i, 'FW-01'], [/ko drum|\bv-?0007\b/i, 'V-0007'], [/propane pump|\bp-?0012a\b/i, 'P-0012A'], [/inlet compressor|\bc-?0001\b/i, 'C-0001'],
];
export function equipmentIn(text: string): string | undefined { return ALIASES.find(([re]) => re.test(text))?.[1]; }

const DELUGE_DOWN = /\b(not working|isn'?t working|not flowing|no flow|no water|fail(ed|ing|s|ure)?|unavailable|out of service|not available|dead|down|inoperable|not operating)\b/i;


export type Intent = 'concern' | 'similar' | 'procedure' | 'route' | 'pressure' | 'explain-alert' | 'equipment-status' | 'clarify' | 'keyword' | 'deluge-report' | 'claim';

interface Claim { variable: 'pressure' | 'temperature' | 'level' | 'flow' | 'running'; direction: 'rising' | 'falling' | 'steady' | 'zero' | 'nonzero' | 'stopped' | 'running' }
export function parseClaim(text: string): Claim | null {
  const t = text.toLowerCase();
  if (/\b(no flow|zero flow|not flowing)\b/.test(t)) return { variable: 'flow', direction: 'zero' };
  if (/\b(is flowing|has flow|flow confirmed|flow established|water flowing|flowing)\b/.test(t)) return { variable: 'flow', direction: 'nonzero' };
  if (/\b(stopped|tripped|not running|shut down)\b/.test(t)) return { variable: 'running', direction: 'stopped' };
  if (/\b(is running|still running)\b/.test(t)) return { variable: 'running', direction: 'running' };
  const variable = /pressure/.test(t) ? 'pressure' : /temp/.test(t) ? 'temperature' : /\blevel\b/.test(t) ? 'level' : /\bflow\b/.test(t) ? 'flow' : null;
  if (!variable) return null;
  if (/\b(ris|increas|going up|climb)/.test(t)) return { variable, direction: 'rising' };
  if (/\b(fall|drop|decreas|going down|reduc)/.test(t)) return { variable, direction: 'falling' };
  if (/\b(steady|stable|normal|flat|unchanged)\b/.test(t)) return { variable, direction: 'steady' };
  return null;
}
export function classifyQuestion(text: string, inv: Pick<Investigation, 'context'>): Intent {
  const t = text.toLowerCase();
  const eq = equipmentIn(text) ?? inv.context.equipmentId;
  if (/\b(similar|previous|past|prior|earlier|historical)\b/.test(t) && /\b(incident|event|occurrence)s?\b/.test(t)) return 'similar';
  if (/\b(procedure|guidance|protocol|erp)\b|which .*\bappl(y|ies)\b|what applies/.test(t)) return 'procedure';
  if (/\b(alternative|alternate|upstream|bypass)\b/.test(t) && /\broute\b/.test(t) && /\b(missing|need|needed|required|before|prerequisite|outstanding|information)\b/.test(t)) return 'route';
  if (/\bpressure\b/.test(t) && /\b(why|ris|increas|going up|climb|continu)/.test(t)) return 'pressure';
  if (inv.context.alertId && /\b(why|what|explain|mean|cause|this)\b/.test(t)) return 'explain-alert';
  if (eq && /\b(status|happening|going on|condition|current|state|doing)\b/.test(t)) return 'equipment-status';
  if (!eq && !inv.context.alertId && /\b(this|it|that one)\b/.test(t) && tokenize(t).length <= 4) return 'clarify';
  return 'keyword';
}

export interface EngineDeps { record: IncidentRecord; inv: Investigation; derived: Derived; clock: Clock; now: number; dashboard: string[]; progress: (label: string) => Promise<void>; stillRunning: () => boolean; updateReason?: string; startedAt: number }
export type EngineResult =
  | { kind: 'clarify'; question: string; options: { label: string; equipmentId: string }[]; needsBasis?: boolean }
  | { kind: 'aborted' }
  | { kind: 'done'; response: InvestigationResponse; task: AgentEvent; event: RecordEvent };

const eqName = (id: string) => EQUIPMENT.find((e) => e.id === id)?.name ?? id;
const unitOf = (w: WatcherDef) => (w.unit === 'status' ? '' : ` ${w.unit}`);
const sourceNote = (s: Sample) => (s.source === 'lost' ? ' (signal lost, value frozen)' : s.source === 'stale' ? ' (stale)' : '');
const shown = (w: WatcherDef, s: Sample) => `${formatValue(w, s.value)}${unitOf(w)}${w.unit === 'status' ? '' : `, ${s.trend}`}${sourceNote(s)}`;
function readingItem(w: WatcherDef, s: Sample, stance: EvidenceItem['stance']): EvidenceItem {
  return { id: `reading-${w.id}`, kind: 'reading', stance, label: `${w.equipmentId} ${w.variable.toLowerCase()}`, text: shown(w, s), t: s.observedAt, source: 'Simulated reading', status: s.source === 'live' ? 'live' : s.source, watcherId: w.id, equipmentId: w.equipmentId };
}
function eventItem(e: RecordEvent, stance: EvidenceItem['stance']): EvidenceItem {
  const kind: EvidenceItem['kind'] = e.kind === 'alert' ? 'alert' : e.kind === 'report' ? 'report' : e.kind === 'observation' ? 'observation' : e.kind === 'gap' ? 'gap' : e.kind === 'outcome' ? 'outcome' : 'finding';
  const LABEL: Record<string, string> = { alert: 'Alert', report: 'Reported action', observation: e.meta?.userSubmitted ? 'Reported observation' : 'Observation', gap: 'Information gap', outcome: 'Outcome', finding: 'Agent finding' };
  const status = e.kind === 'alert' ? (e as AlertEvent).evidenceStatus : typeof e.meta?.evidence === 'string' ? e.meta.evidence : undefined;
  return { id: e.id, kind, stance, label: LABEL[kind], text: e.title, t: e.t, source: e.detail?.split(' · ')[0] ?? (e.source === 'agent' ? 'ECC agent' : e.by), status, equipmentId: e.equipmentId, alertId: e.meta?.alertId ? String(e.meta.alertId) : (e as { alertId?: string }).alertId, eventId: e.id };
}
/** An event's equipment, following a report back to its alert. */
function eqOf(r: IncidentRecord, e: RecordEvent): string | undefined {
  if (e.equipmentId) return e.equipmentId;
  const alertId = (e as { alertId?: string }).alertId ?? (e.meta?.alertId ? String(e.meta.alertId) : undefined);
  return alertId ? r.events.find((x) => x.id === `alert-${alertId}`)?.equipmentId : undefined;
}
const EVIDENCE_KINDS = new Set(['alert', 'observation', 'finding', 'report', 'gap', 'outcome']);
const eventsFor = (r: IncidentRecord, eq: string, asOf: number) => r.events.filter((e) => e.t <= asOf && EVIDENCE_KINDS.has(e.kind) && eqOf(r, e) === eq);
/** What a response depends on. When this changes, the agent revises the assessment and keeps the earlier one. */
export function basisOf(r: IncidentRecord, inv: Investigation, tracks: string[], asOf: number): string {
  const ids = tracks.flatMap((eq) => eventsFor(r, eq, asOf).map((e) => e.id));
  const corrections = r.events.filter((e) => e.kind === 'correction' && e.corrects && e.corrects === inv.observationEventId).map((e) => e.id);
  return [...new Set([...ids, ...corrections])].sort().join('|');
}
export function newEvidenceSince(r: IncidentRecord, inv: Investigation, basis: string): RecordEvent[] {
  const have = new Set(basis.split('|'));
  const tracks = inv.responses[inv.responses.length - 1]?.tracks ?? [];
  return r.events.filter((e) => !have.has(e.id) && ((EVIDENCE_KINDS.has(e.kind) && eqOf(r, e) != null && tracks.includes(eqOf(r, e)!)) || (e.kind === 'correction' && e.corrects === inv.observationEventId)));
}
/** The latest wording of a reported observation: the original stays in the record. */
export function observationText(r: IncidentRecord, inv: Investigation): { original: string; current: string; amendedAt?: number } {
  const ev = r.events.find((e) => e.id === inv.observationEventId);
  const am = r.events.filter((e) => e.corrects && e.corrects === inv.observationEventId).pop();
  return { original: ev?.title ?? inv.text, current: am?.title ?? ev?.title ?? inv.text, amendedAt: am?.t };
}

interface Partial0 { related?: InvestigationResponse['related']; noResponseReason?: string; humanReview?: boolean; docPurpose?: string; state: InvestigationResponse['state']; heading: string; finding: string; evidence: EvidenceItem[]; conflicts: InvestigationResponse['conflicts']; missing: string[]; uncertainty: string[]; suggestion?: InvestigationResponse['suggestion']; affected?: InvestigationResponse['affected']; reconciliation?: InvestigationResponse['reconciliation']; tracks: string[]; docQuery?: string; docTypes?: Investigation['scope']['types']; passagesFirst?: boolean }

const openGaps = (r: IncidentRecord, asOf: number, eq?: string) => { const st = gapStatus(r, asOf); return r.events.filter((e) => e.kind === 'gap' && e.t <= asOf && st.get(e.id) === 'open' && (!eq || eqOf(r, e) === eq)); };
function latestRecommendation(r: IncidentRecord, asOf: number, eq: string): InvestigationResponse['suggestion'] {
  const rec = activeRecommendations(r, asOf).find((x) => x.equipmentId === eq);
  return rec ? { alertId: rec.alertId, summary: rec.summary, equipmentId: eq } : undefined;
}

function pressure(deps: EngineDeps, eq: string): Partial0 {
  const { record: r, clock, now } = deps;
  const w = WATCHERS.find((x) => x.id === `${eq}:pressure`);
  if (!w) return { state: 'insufficient', heading: 'Not enough evidence', finding: `ECC has no pressure reading for ${eq}.`, evidence: [], conflicts: [], missing: [`A pressure reading for ${eq}`], uncertainty: [], tracks: [eq] };
  const s = sampleAt(w, now, clock);
  const windowMin = Math.min(6, Math.max(1, Math.round((now - clock.startedAt) / 60000)));
  const prev = sampleAt(w, now - windowMin * 60000, clock);
  const delta = s.value - prev.value;
  const tw = WATCHERS.find((x) => x.id === `${eq}:temperature`); const ts = tw ? sampleAt(tw, now, clock) : null;
  const limit = w.limits.find((l) => l.kind === 'high' && s.value <= l.value);
  const evidence: EvidenceItem[] = [readingItem(w, s, 'supports'), ...(tw && ts ? [readingItem(tw, ts, 'context')] : [])];
  const events = eventsFor(r, eq, now);
  const assessment = [...events].reverse().find((e) => e.kind === 'finding' && /heat|cause|consistent|inferred/i.test(e.title));
  const uncertainty: string[] = [];
  for (const e of events) if (e.kind === 'observation' || e.kind === 'finding') { if (e.meta?.evidence === 'unverified') uncertainty.push(e.title); }
  for (const e of events.filter((x) => x.kind === 'alert' || x.kind === 'observation' || x.kind === 'report').slice(-4)) evidence.push(eventItem(e, 'supports'));
  if (assessment) evidence.push(eventItem(assessment, 'supports'));
  if (s.source === 'lost' || s.source === 'stale') uncertainty.push(`The ${eq} pressure signal is ${s.source}; the value shown may not be current.`);
  const sign = delta >= 0 ? '+' : '−';
  const rate = Math.abs(delta) >= 0.05 ? ` (${sign}${Math.abs(delta).toFixed(w.decimals)}${unitOf(w)} over the last ${windowMin} min)` : '';
  const rising = s.trend === 'rising';
  const cause = assessment ? ` The agent's recorded assessment: "${assessment.title}" This is inferred from readings, not measured directly.` : ' The record does not yet contain an assessment of the cause.';
  const finding = rising
    ? `${eq} pressure is ${formatValue(w, s.value)}${unitOf(w)} and rising${rate}.${cause}`
    : `The current reading does not show a rise: ${eq} pressure is ${formatValue(w, s.value)}${unitOf(w)}, ${s.trend}${rate}.${assessment ? cause : ''}`;
  const missing = openGaps(r, now, eq).map((g) => g.title);
  if (rising && limit) uncertainty.push(`Next configured limit: ${limit.label} ${limit.value}${unitOf(w)} (illustrative, not SME-validated). ECC has no validated time-to-limit method, so no time is stated.`);
  return { state: 'answered', heading: rising ? 'Assessment' : 'Answer', finding, evidence, conflicts: [], missing, uncertainty, suggestion: rising ? latestRecommendation(r, now, eq) : undefined, noResponseReason: rising ? undefined : 'The current reading does not show the rise asked about.', docPurpose: 'Guidance on rising vessel pressure, the relief route and depressurization', tracks: [eq], docQuery: `${eq} ${eqName(eq)} pressure rising depressurization relief route heat exposure` };
}

function delugeReport(deps: EngineDeps, reportText: string): Partial0 {
  const { record: r, clock, now, inv } = deps;
  const flowW = WATCHERS.find((x) => x.id === 'DS-029:flow')!, statusW = WATCHERS.find((x) => x.id === 'DS-029:status')!;
  const flow = sampleAt(flowW, now, clock), status = sampleAt(statusW, now, clock);
  const commanded = status.value === 1;
  const others = eventsFor(r, 'DS-029', now).filter((e) => e.id !== inv.observationEventId && !e.meta?.userSubmitted);
  const noFlowAlert = others.find((e) => e.kind === 'alert' && /no flow|no-flow/i.test(e.title));
  const fieldActivated = others.find((e) => e.kind === 'observation' && /activated/i.test(e.title));
  const evidence: EvidenceItem[] = [readingItem(statusW, status, commanded ? 'supports' : 'conflicts'), readingItem(flowW, flow, commanded ? 'supports' : 'context'), ...others.slice(-3).map((e) => eventItem(e, e === fieldActivated ? 'conflicts' : 'supports'))];
  const reportBy = `Report: "${reportText}"`;
  const conflicts: InvestigationResponse['conflicts'] = [];
  if (!commanded && !noFlowAlert) conflicts.push({ a: reportBy, b: `DS-029 status signal: ${formatValue(statusW, status.value)}, no fault shown`, note: `Flow of ${formatValue(flowW, flow.value)} m³/h is what standby would show, so it neither confirms nor contradicts the report.` });
  if (fieldActivated) conflicts.push({ a: `Field report: "${fieldActivated.title}"`, b: `DS-029 flow reading: ${formatValue(flowW, flow.value)} m³/h with status ${formatValue(statusW, status.value)}`, note: 'Both stay in the record until flow is confirmed at the protected equipment.' });
  const affected = activeRecommendations(r, now).filter((x) => /deluge|ds-029/i.test(`${x.summary} ${x.actions.join(' ')}`)).map((x) => ({ alertId: x.alertId, summary: x.summary }));
  const consistent = commanded || !!noFlowAlert;
  const summary = consistent
    ? `The report is consistent with the readings: DS-029 reads ${formatValue(statusW, status.value)} with flow ${formatValue(flowW, flow.value)} m³/h.`
    : `The report and the readings disagree. DS-029 still reads ${formatValue(statusW, status.value)} with no fault shown, so ECC cannot tell from its signals whether the deluge would work.`;
  const stillOpen = fieldActivated ? ` A separate field report says the deluge was activated ("${fieldActivated.title}"), so that conflict stays open.` : '';
  const change = affected.length ? ` ${affected.length === 1 ? 'One current recommendation relies' : `${affected.length} current recommendations rely`} on the deluge; review ${affected.length === 1 ? 'it' : 'them'} with this report in mind.` : ' No current recommendation relies on the deluge.';
  return { state: conflicts.length ? 'conflict' : 'answered', heading: conflicts.length ? 'Conflicting evidence' : 'Finding', finding: `${summary}${stillOpen}${change}`, evidence, conflicts, missing: [...openGaps(r, now, 'DS-029').map((g) => g.title), ...(consistent ? [] : ['Independent confirmation of the deluge condition'])], uncertainty: [], suggestion: latestRecommendation(r, now, 'DS-029'), affected: affected.length ? affected : undefined, reconciliation: conflicts.some((c) => c.a === reportBy) ? 'conflict' : consistent ? 'consistent' : 'not-compared', docPurpose: 'Guidance on confirming water flow at the protected equipment', tracks: ['DS-029'], docQuery: 'deluge water flow confirm protected equipment cooling' };
}

function claimCheck(deps: EngineDeps, reportText: string, eq: string, claim: Claim): Partial0 {
  const { record: r, clock, now, inv } = deps;
  const word: Record<Claim['variable'], RegExp> = { pressure: /pressure/i, temperature: /temperature/i, level: /level/i, flow: /flow/i, running: /running/i };
  const w = WATCHERS.find((x) => x.equipmentId === eq && word[claim.variable].test(x.variable));
  const others = eventsFor(r, eq, now).filter((e) => e.id !== inv.observationEventId).slice(-3);
  if (!w) return { state: 'insufficient', heading: 'Not enough evidence', finding: `ECC has no ${claim.variable} reading for ${eq}, so it cannot compare this report with a source. The report stays in the record as reported evidence.`, evidence: others.map((e) => eventItem(e, 'context')), conflicts: [], missing: [`A ${claim.variable} reading for ${eq}`], uncertainty: [], reconciliation: 'not-compared', tracks: [eq] };
  const s = sampleAt(w, now, clock);
  const agrees = claim.direction === 'rising' || claim.direction === 'falling' || claim.direction === 'steady' ? s.trend === claim.direction
    : claim.direction === 'zero' ? s.value === 0 : claim.direction === 'nonzero' ? s.value > 0 : claim.direction === 'stopped' ? s.value === 0 : s.value === 1;
  const reading = `${eq} ${w.variable.toLowerCase()}: ${shown(w, s)}`;
  const conflicts = agrees ? [] : [{ a: `Report: "${reportText}"`, b: `Reading: ${reading}`, note: s.source === 'lost' || s.source === 'stale' ? `The signal is ${s.source}, which may explain the difference.` : 'Neither is treated as settled. Check the reading against an independent source.' }];
  return { state: agrees ? 'answered' : 'conflict', heading: agrees ? 'Finding' : 'Conflicting evidence', finding: agrees ? `The report is consistent with the current reading (${reading}). It remains reported evidence.` : `The report conflicts with the current reading (${reading}). Both remain visible.`, evidence: [readingItem(w, s, agrees ? 'supports' : 'conflicts'), ...others.map((e) => eventItem(e, 'context'))], conflicts, missing: agrees ? [] : [`Independent confirmation of ${eq} ${w.variable.toLowerCase()}`], uncertainty: [], suggestion: agrees ? undefined : latestRecommendation(r, now, eq), related: agrees ? latestRecommendation(r, now, eq) : undefined, noResponseReason: agrees ? 'The report matches the current reading and adds nothing the record does not already show.' : undefined, reconciliation: agrees ? 'consistent' : 'conflict', docPurpose: `Keyword match for ${eq} ${w.variable.toLowerCase()}`, tracks: [eq], docQuery: `${eq} ${eqName(eq)} ${w.variable}` };
}

function equipmentStatus(deps: EngineDeps, eq: string): Partial0 {
  const { record: r, clock, now } = deps;
  const ws = WATCHERS.filter((w) => w.equipmentId === eq);
  const rows = ws.map((w) => ({ w, s: sampleAt(w, now, clock) }));
  const evs = eventsFor(r, eq, now);
  const alerts = evs.filter((e) => e.kind === 'alert');
  const line = rows.map(({ w, s }) => `${w.variable.toLowerCase()} ${shown(w, s)}`).join('; ');
  return { state: 'answered', heading: 'Answer', finding: `${eq} ${eqName(eq)}: ${line || 'no readings available'}. ${alerts.length ? `${alerts.length} alert${alerts.length > 1 ? 's' : ''} recorded; latest: ${alerts[alerts.length - 1].title}.` : 'No alerts recorded.'}`, evidence: [...rows.map(({ w, s }) => readingItem(w, s, 'context')), ...evs.slice(-4).map((e) => eventItem(e, 'context'))], conflicts: [], missing: openGaps(r, now, eq).map((g) => g.title), uncertainty: [], noResponseReason: 'This is a status summary; it does not call for a response of its own.', tracks: [eq] };
}

/** A worry or prediction ECC cannot test. It stays a reported concern: current evidence sits beside it and does not answer it. */
function concern(deps: EngineDeps, original: string, answer: string | undefined, eq: string | undefined): Partial0 {
  const { record: r, clock, now, dashboard } = deps;
  const ids = eq ? [eq] : dashboard;
  const reading = WATCHERS.filter((w) => ids.includes(w.equipmentId) && w.unit !== 'status').map((w) => readingItem(w, sampleAt(w, now, clock), 'context'));
  const alerts = r.events.filter((e) => e.kind === 'alert' && e.t <= now && (!eq || e.equipmentId === eq)).slice(-4).map((e) => eventItem(e, 'context'));
  return { state: 'insufficient', heading: 'Reported concern · not assessed', finding: `ECC cannot test "${original}" with its rules, so it is recorded as a reported concern, not an equipment condition.${answer ? ` Further detail given: "${answer}".` : ''} Current evidence is listed separately. It neither confirms the concern nor rules it out.`, evidence: [...reading, ...alerts], conflicts: [], missing: answer ? [] : ['What was observed, and when'], uncertainty: ['Steady or falling readings do not dismiss an unsupported report. No severity or instruction has been inferred from its wording.'], humanReview: true, reconciliation: 'not-compared', tracks: eq ? [eq] : [] };
}

function explainAlert(deps: EngineDeps): Partial0 | null {
  const { inv, record: r, now, derived } = deps;
  const a = inv.context.alertId ? derived.alertById.get(inv.context.alertId) : undefined;
  if (!a) return null;
  const eq = a.def.equipmentId;
  const ev = r.events.find((e) => e.id === `alert-${a.id}`);
  return { state: 'answered', heading: 'Answer', finding: `${a.def.why} ${a.def.consequence}`, evidence: [...(ev ? [eventItem(ev, 'supports')] : []), ...(a.def.watcherId ? (() => { const w = WATCHERS.find((x) => x.id === a.def.watcherId); return w ? [readingItem(w, sampleAt(w, now, deps.clock), 'supports')] : []; })() : [])], conflicts: [], missing: openGaps(r, now, eq).map((g) => g.title), uncertainty: a.def.evidence === 'verified' ? [] : [`This alert's evidence status is ${a.def.evidence}.`], suggestion: latestRecommendation(r, now, eq), tracks: [eq] };
}

function routeInfo(deps: EngineDeps): Partial0 {
  const { record: r, now } = deps;
  const gaps = openGaps(r, now).filter((g) => /route|isolation|relief|availab/i.test(`${g.title} ${g.detail ?? ''}`));
  const assess = r.events.filter((e) => e.t <= now && e.meta?.obsKind === 'route-assessment').slice(-1);
  return { state: gaps.length || assess.length ? 'answered' : 'insufficient', heading: gaps.length || assess.length ? 'Answer' : 'Not enough evidence', finding: gaps.length ? `The record shows ${gaps.length} open item${gaps.length > 1 ? 's' : ''} bearing on a relief route. See below.` : assess.length ? `Latest route assessment: "${assess[0].title}"` : 'The record has no route assessment or route prerequisite yet. The procedure passage below states the general requirement.', evidence: [...gaps.map((g) => eventItem(g, 'supports')), ...assess.map((e) => eventItem(e, 'supports'))], conflicts: [], missing: gaps.map((g) => g.title), uncertainty: [], docPurpose: 'The requirement for using an alternative relief route', tracks: ['FH-01', 'D-0001'], docQuery: 'alternative relief route availability isolation status confirmed' };
}

const docLabel = (derived: Derived, p: Passage) => { const d = derived.docById.get(p.source.id); return `${d?.number ?? p.source.title} Rev ${p.source.revision} p.${p.source.page}`; };
/** A document is relied on only at its revision currently in effect. */
function applicable(derived: Derived, p: Passage) {
  if (p.source.kind !== 'document') return false;
  const d = derived.docById.get(p.source.id);
  return d ? d.current.revision === p.source.revision : p.source.approval === 'approved';
}
function pin(derived: Derived, p: Passage): PinnedEvidence {
  const d = derived.docById.get(p.source.id);
  const quote = p.source.quote && !/^ILLUSTRATIVE FIXTURE/.test(p.source.quote) ? p.source.quote : undefined;
  return { docId: p.source.id, title: d?.title ?? p.source.title, number: d?.number ?? '', revision: p.source.revision ?? '', page: p.source.page ?? 1, label: '', locate: quote ? 'exact' : 'page-only', quote };
}
const trimPassage = (p: Passage): Passage => ({ ...p, text: '' });

const pause = (ms: number) => new Promise((res) => window.setTimeout(res, ms));

export async function runEngine(deps: EngineDeps): Promise<EngineResult> {
  const { record: r, inv, derived, now, dashboard, progress } = deps;
  const run = currentRun(r);
  const config = run?.config;
  const obs = inv.kind === 'observation' ? observationText(r, inv) : null;
  const reportText = obs?.current ?? '';
  const question = inv.kind === 'question' ? inv.text : (r.events.find((e) => e.id === inv.observationEventId)?.meta?.question as string | undefined) ?? '';
  const answerText = inv.clarification?.answerText ?? '';
  const analysed = `${reportText} ${answerText} ${question}`.trim();
  const eq = equipmentIn(analysed) ?? inv.context.equipmentId ?? (inv.context.alertId ? derived.alertById.get(inv.context.alertId)?.def.equipmentId : undefined);
  const ops: AgentEvent['technical']['steps'] = [];
  const timed = async <T,>(name: string, opName: string, source: string, fn: () => T | Promise<T>, detail: (x: T) => string, logs: (x: T) => string[] = () => [], fail?: (x: T) => boolean): Promise<T> => {
    const t0 = performance.now(); const at = now;
    const x = await fn();
    const failed = !!fail?.(x);
    ops.push({ name, status: failed ? 'error' : 'done', operations: [{ name: opName, source, startedAt: at, durationMs: Math.round(performance.now() - t0), result: failed ? 'error' : 'ok', detail: detail(x), retries: 0, logs: logs(x).map((text) => ({ t: at, level: failed ? 'error' : 'info', text })) }] });
    return x;
  };

  await progress(PROGRESS.context);
  const intent: Intent = await timed('Interpret the request', 'Match against recognised request types', 'ECC investigation rules (simulated)', () => {
    if (inv.kind === 'observation') {
      if (/\bdeluge\b|\bds-?029\b/i.test(`${reportText} ${answerText}`) && DELUGE_DOWN.test(`${reportText} ${answerText}`)) return 'deluge-report' as Intent;
      if (parseClaim(`${reportText} ${answerText}`)) return 'claim' as Intent;
      if (question) { const q = classifyQuestion(question, inv); if (q !== 'keyword') return q; }
      // Nothing here can be tested: no equipment or location, a prediction, or no factual basis.
      if (urgentWording(reportText) || (!eq && !inv.context.location)) return 'concern' as Intent;
      return 'keyword' as Intent;
    }
    return classifyQuestion(question, inv);
  }, (x) => `Request type: ${x}.`);
  if (!deps.stillRunning()) return { kind: 'aborted' };

  // A concise clarification, only where the answer depends on it.
  const monitored = dashboard.filter((id) => WATCHERS.some((w) => w.equipmentId === id));
  if (intent === 'clarify' && !eq) return { kind: 'clarify', question: 'Which equipment do you mean?', options: monitored.map((id) => ({ label: `${id} ${eqName(id)}`, equipmentId: id })) };
  if (intent === 'concern' && !inv.clarification?.answeredAt) return { kind: 'clarify', question: eq || inv.context.location ? 'What was observed, and when?' : 'Which equipment or location? What was observed, and when?', options: eq ? [] : monitored.map((id) => ({ label: `${id} ${eqName(id)}`, equipmentId: id })), needsBasis: true };
  if (intent === 'claim' && !eq) { const c = parseClaim(`${reportText} ${answerText}`)!; const word = c.variable === 'running' ? /running/i : new RegExp(c.variable, 'i'); return { kind: 'clarify', question: 'Which equipment does this report refer to?', options: monitored.filter((id) => WATCHERS.some((w) => w.equipmentId === id && word.test(w.variable))).map((id) => ({ label: `${id} ${eqName(id)}`, equipmentId: id })) }; }
  let pressureEq = eq;
  if (intent === 'pressure' && !pressureEq) {
    const candidates = monitored.filter((id) => WATCHERS.some((w) => w.id === `${id}:pressure`));
    const rising = candidates.filter((id) => sampleAt(WATCHERS.find((w) => w.id === `${id}:pressure`)!, now, deps.clock).trend === 'rising');
    if (rising.length === 1) pressureEq = rising[0];
    else return { kind: 'clarify', question: 'Which equipment do you mean?', options: candidates.map((id) => ({ label: `${id} ${eqName(id)}`, equipmentId: id })) };
  }

  await pause(PACE); await progress(inv.kind === 'observation' ? PROGRESS.compare : PROGRESS.readings);
  const comparisonOff = !!config && !config.capabilities.includes('conflict') && (intent === 'deluge-report' || intent === 'claim');
  const base: Partial0 | null = await timed('Check incident evidence', 'Read incident record and current readings', 'Incident record · PI historian (simulated)', () => {
    if (comparisonOff) return { state: 'insufficient' as const, heading: 'Comparison not run', finding: `Report comparison is turned off in this agent run (config v${config!.version}). The report is recorded as reported evidence and has not been compared with readings.`, evidence: [], conflicts: [], missing: [], uncertainty: [], reconciliation: 'not-compared' as const, tracks: [] };
    if (intent === 'pressure') return pressure(deps, pressureEq!);
    if (intent === 'deluge-report') return delugeReport(deps, reportText);
    if (intent === 'claim') return claimCheck(deps, reportText, eq!, parseClaim(`${reportText} ${answerText}`)!);
    if (intent === 'concern') return concern(deps, reportText, answerText || undefined, eq);
    if (intent === 'equipment-status') return equipmentStatus(deps, eq!);
    if (intent === 'explain-alert') return explainAlert(deps);
    if (intent === 'route') return routeInfo(deps);
    if (intent === 'clarify') return eq ? equipmentStatus(deps, eq) : null;
    return null;
  }, (x) => (x ? `${x.evidence.length} evidence items read as of the current scenario time.` : 'No structured check applies; using Knowledge search.'), (x) => (x?.evidence ?? []).map((e) => `${e.label}: ${e.text}`));
  if (!deps.stillRunning()) return { kind: 'aborted' };

  await pause(PACE); await progress(PROGRESS.documents);
  const proceduresOn = !config || config.capabilities.includes('procedures');
  const types = intent === 'similar' ? ['incident' as const] : intent === 'procedure' && !inv.scope.types.length ? ['procedure' as const, 'limits' as const, 'policy' as const] : inv.scope.types;
  const similarQuery = intent === 'similar' ? `${question.replace(/\b(similar|previous|past|prior|earlier|historical|incidents?|events?|recorded|have|been|any|at|this|site|been)\b/gi, ' ')} ${eq ?? ''} ${r.title}` : '';
  const query = intent === 'similar' ? similarQuery : base?.docQuery ? `${question || reportText} ${base.docQuery}` : `${question || reportText} ${eq ?? ''}`.trim();
  const search = await timed('Search Knowledge', `Keyword search within ${inv.scope.sites.length ? inv.scope.sites.join(', ') : 'all sites'}`, 'Knowledge index', async () => (proceduresOn ? retrieval.search(query, { sites: inv.scope.sites, contentTypes: types, incidentTimeCutoff: { incidentId: r.id, t: now }, limit: 40 }) : { ok: true as const, passages: [] as Passage[], indexedPassages: retrieval.size }), (x) => (!proceduresOn ? 'Document review is off in this agent run.' : x.ok ? `${x.passages.length} passages matched.` : `Failed: ${x.error}.`), (x) => [`query: ${query}`, ...(x.ok ? x.passages.slice(0, 4).map((p) => `${p.source.title}${p.source.page ? ` p.${p.source.page}` : ''}`) : [])], (x) => !x.ok);
  if (!deps.stillRunning()) return { kind: 'aborted' };

  await pause(PACE); await progress(PROGRESS.assess);
  // Incident entries can outrank documents, so citations are chosen from the wider result and fewer passages are kept for display.
  const allPassages = search.ok ? search.passages : [];
  const passages = allPassages.slice(0, 14);
  const relied = allPassages.filter((p) => applicable(derived, p));
  const seen = new Set<string>();
  // Written guidance first. A drawing is cited only when no procedure or limit matched.
  const written = relied.filter((p) => p.source.contentType === 'procedure' || p.source.contentType === 'limits' || p.source.contentType === 'policy');
  // One page per document, the best match: citations are the evidence used, not everything that matched.
  const topDocs = (written.length ? written : relied).filter((p) => { if (seen.has(p.source.id)) return false; seen.add(p.source.id); return true; }).slice(0, 2);
  const docsNote = !proceduresOn ? `Document review is turned off in this agent run (config v${config?.version}).` : !search.ok ? `Knowledge could not be searched: ${search.error}. Documents were not checked.` : null;
  const siteLabel = inv.scope.sites.length ? inv.scope.sites.join(', ') : 'all sites';

  let out: Partial0;
  if (base) out = base;
  else if (intent === 'procedure') {
    const best = topDocs.find((p) => p.source.contentType === 'procedure') ?? null;
    out = best
      ? { state: 'answered', heading: 'Closest guidance', finding: `Closest match in ${siteLabel}: ${derived.docById.get(best.source.id)?.title ?? best.source.title} (${docLabel(derived, best)}).${best.source.quote ? ` It says: "${best.source.quote}"` : ''} This is a keyword match. Whether it applies to your situation is your judgement.`, evidence: [], conflicts: [], missing: [], uncertainty: ['ECC does not establish which procedure formally applies.'], noResponseReason: 'This answers a question about guidance; it is not a response recommendation.', docPurpose: 'Closest procedure match to the question, by keyword', tracks: [], passagesFirst: true }
      : { state: search.ok ? (passages.length ? 'insufficient' : 'empty') : 'error', heading: 'Not enough evidence', finding: `No procedure in effect matched within ${siteLabel}.`, evidence: [], conflicts: [], missing: [], uncertainty: [], tracks: [], passagesFirst: true };
  } else if (intent === 'similar') {
    const others = passages.filter((p) => p.source.id !== r.id);
    const titles = [...new Set(others.map((p) => (p.source.kind === 'incident' ? p.source.title : `${derived.docById.get(p.source.id)?.number ?? ''} ${p.source.title}`.trim())))];
    out = titles.length
      ? { state: 'answered', heading: 'Answer', finding: `${titles.length} record${titles.length > 1 ? 's' : ''} in ${siteLabel} matched by keyword: ${titles.slice(0, 4).join('; ')}. Similarity is keyword-based only. These are historical evidence, not protocol.`, evidence: [], conflicts: [], missing: [], uncertainty: [], noResponseReason: 'Historical records are precedent only and do not call for a response.', tracks: [], passagesFirst: true }
      : { state: search.ok ? 'empty' : 'error', heading: 'Nothing found', finding: `No other incident in ${siteLabel} matched. Other sites were not searched${inv.scope.sites.length ? '; change the site scope to include them' : ''}.`, evidence: [], conflicts: [], missing: [], uncertainty: [], tracks: [], passagesFirst: true };
  } else {
    // Unrecognised requests: matched passages and a plain limitation, never a composed answer.
    const qTerms = [...new Set(tokenize(question || reportText))];
    const best = passages.reduce((m, p) => { const toks = new Set(tokenize(p.snippet)); return Math.max(m, qTerms.filter((t) => toks.has(t)).length / (qTerms.length || 1)); }, 0);
    const weak = passages.length > 0 && best < 0.5;
    const recorded = inv.kind === 'observation' ? 'The observation is recorded. ECC has no rule to compare this report with its sources. ' : '';
    out = { state: !search.ok ? 'error' : !passages.length ? 'empty' : weak ? 'insufficient' : 'passages', heading: weak || !passages.length ? 'Not enough evidence' : 'Matching passages', finding: `${recorded}${!search.ok ? 'Knowledge could not be searched.' : !passages.length ? `Nothing in ${siteLabel} matched, so ECC has no supported answer.` : weak ? 'ECC cannot answer this from the available evidence. The passages below only partly match your words and do not answer the question.' : 'ECC cannot interpret this request, so it has not composed an answer. These passages match your words; read them to judge whether they help.'}`, evidence: eq ? eventsFor(r, eq, now).slice(-3).map((e) => eventItem(e, 'context')) : [], conflicts: [], missing: [], uncertainty: [], reconciliation: inv.kind === 'observation' ? 'not-compared' : undefined, tracks: inv.kind === 'observation' && eq ? [eq] : [], passagesFirst: true };
  }
  if (docsNote && base) out = { ...out, uncertainty: [docsNote, ...out.uncertainty] };

  const responseId = `${inv.id}-r${inv.responses.length + 1}`;
  const revision = inv.responses.length + 1;
  const t = Math.max(now, deps.startedAt);
  const documents = !proceduresOn ? [] : out.passagesFirst && intent !== 'procedure' ? [] : topDocs.map((p) => pin(derived, p));
  const response: InvestigationResponse = {
    id: responseId, revision, startedAt: deps.startedAt, t, asOf: now, state: out.state, heading: out.heading, finding: out.finding, evidence: out.evidence, documents, passages: passages.map(trimPassage), indexed: search.ok ? search.indexedPassages : 0, retrievalError: search.ok ? undefined : search.error,
    conflicts: out.conflicts, missing: [...new Set(out.missing)], uncertainty: out.uncertainty, suggestion: out.suggestion, related: out.related, noResponseReason: out.noResponseReason, humanReview: out.humanReview, docPurpose: out.docPurpose ?? (documents.length ? 'Matched by keyword' : undefined), affected: out.affected, reconciliation: out.reconciliation,
    checked: ops.map((s) => ({ label: s.name, detail: s.operations[0].detail })), tracks: out.tracks, basis: basisOf(r, inv, out.tracks, now), updateReason: deps.updateReason,
    run: { number: run?.number ?? 0, configVersion: config?.version ?? 0 },
  };
  await timed('Prepare the response', 'Assemble cited response', 'ECC investigation rules (simulated)', () => response, (x) => `${x.heading}: ${x.documents.length} documents cited, ${x.evidence.length} evidence items, ${x.conflicts.length} conflicts.`);
  if (!deps.stillRunning()) return { kind: 'aborted' };

  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const subject = short(question || reportText, 70);
  const task: AgentEvent = {
    id: `agent-${responseId}`, t, recordedAt: t, kind: 'agent', title: `Investigating: ${subject}`, source: 'agent', detail: `${revision > 1 ? 'Revised after new evidence. ' : ''}${inv.kind === 'observation' ? 'Reported observation' : 'User question'} from ${inv.by}: "${subject}"`,
    headline: `${revision > 1 ? 'Revised the investigation of' : 'Investigated'} "${short(subject, 56)}": ${out.heading.toLowerCase()}`, taskId: responseId, taskKind: 'investigation', status: search.ok ? 'done' : 'error',
    docRefs: documents.map((e) => ({ docId: e.docId, revision: e.revision, page: e.page, label: `${e.number} Rev ${e.revision} p.${e.page}` })), sources: [...new Set(ops.flatMap((s) => s.operations.map((o) => o.source)))], documents: documents.map((e) => `${e.number || e.title} Rev ${e.revision} p.${e.page}`), findings: [short(out.finding, 110)], failures: search.ok ? [] : [`Search Knowledge: ${search.error}`],
    runId: `inv-${inv.number}-${revision}`, configVersion: `${AGENT_BUILD} / config v${config?.version ?? 0}`, meta: { processedAt: deps.startedAt, investigationId: inv.id, ...(run ? { agentRun: run.number, agentConfig: run.config.version } : {}) }, technical: { steps: ops },
  };
  const event: RecordEvent = { id: `inv-r-${responseId}`, t, recordedAt: t, kind: 'investigation', title: `${revision > 1 ? 'Updated assessment' : out.heading}: ${short(out.finding, 150)}`, detail: `Simulated investigation of "${subject}" · as of the record at this time${out.conflicts.length ? ` · ${out.conflicts.length} conflict${out.conflicts.length > 1 ? 's' : ''} unreconciled` : ''}`, equipmentId: out.tracks[0], source: 'agent', evidence: documents, meta: { investigationId: inv.id, revision, state: out.state, ...(run ? { agentRun: run.number, agentConfig: run.config.version } : {}) } };
  return { kind: 'done', response, task, event };
}

export const PACE = 320;
