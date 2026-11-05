// Selectors for the Situation screen. The unit of the screen is a condition unit: one of the four
// brief conditions (fire, release, pump, personnel) carrying whatever is linked to it on record: an
// active alert, an open question or conflict, and the response chain (recommendation, decision,
// reported response). One of the units is the focal point: the next human decision, or the next
// most useful human step. Everything derives from state through the wording in brief.ts. Nothing
// here invents a severity, a threshold, a confidence or a status: the only configured severity in
// the model is `Monitor.alert`, and a unit without one shows none.
import { briefConditions, briefHealth, concerns, monitoringSummary, newerRevision, otherOpenItems, responseLines, stage, type BriefCondition, type Concern, type ConditionTone, type ResponseLine } from './brief';
import { resolveRecord } from './content';
import { PERSONNEL_REC } from './scenario';
import { fmt } from './time';
import type { ActionStatus, Alert, AssessmentRow, Citation, Decision, EccState, Issue, KRevision, Minutes, Recommendation, ResponseAction, Source, Trust } from './types';
import { ACTION_STATUS_LABEL, OUTCOME_LABEL } from './types';

/** Rail ids for a condition unit investigation. Not incident records, so never on the record. */
export const SITUATION_RAIL_PREFIX = 'view:situation:';
export const situationRailId = (key: UnitKey) => `${SITUATION_RAIL_PREFIX}${key}`;
export const isSituationRailId = (id: string) => id.startsWith(SITUATION_RAIL_PREFIX);

export type UnitKey = BriefCondition['key'];

/**
 * Which brief condition a monitored point describes. A presentation mapping for this scenario so an
 * alert can sit with the condition it concerns; it does not make the alert a statement about the condition.
 */
const MONITOR_CONDITION: Record<string, UnitKey> = { 'MON-FD3107': 'fire', 'MON-PUMP': 'pump', 'MON-FLOW': 'pump' };

/** Which open question belongs to which condition. ISS-01 is the personnel gap, ISS-02 the release conflict. */
const ISSUE_CONDITION: Record<string, UnitKey> = { 'ISS-01': 'people', 'ISS-02': 'release' };

export type NextKind = 'decide' | 'verify' | 'compare' | 'response' | 'reading' | 'open';

export interface LinkedResponse {
  act: ResponseAction;
  dec?: Decision;
  rec?: Recommendation;
}

export interface ConditionUnit {
  key: UnitKey;
  railId: string;
  label: string;
  value: string;
  note?: string;
  trust: Trust;
  tone: ConditionTone;
  row: AssessmentRow;
  /** Active alerts on the monitored points that describe this condition. Configured severity lives here only. */
  alerts: Alert[];
  /** The open attention item from brief.ts, where one exists. */
  concern?: Concern;
  issue?: Issue;
  /** The recommendation-led chain for this condition (personnel: REC-02). */
  rec?: Recommendation;
  dec?: Decision;
  act?: ResponseAction;
  /** Other response items whose recorded decision rested on this assessment line. */
  linked: LinkedResponse[];
  /** Amber "unresolved attention" meaning. Not a level. */
  attention: boolean;
  /** One status line for the human step, where one exists. Amber only while something is unresolved. */
  status?: string;
  /** The status alone, for where the response's title is already shown beside it. */
  statusShort?: string;
  statusTone: 'attention' | 'neutral';
  /** The condition's own note and any open-item detail, as one sentence group. */
  state: string;
  next: { label: string; kind: NextKind };
  /** Real evidence only: reports, records, citations, readings. Never recommendations, decisions or questions. */
  evidence: string[];
  /** When the unit's picture last changed. Routine samples never move it. */
  changedAt: Minutes;
}

const EVIDENCE_KINDS = new Set(['report', 'document', 'citation', 'monitor', 'kdoc']);

export function isEvidenceId(s: EccState, id: string): boolean {
  const r = resolveRecord(s, id);
  return !!r && EVIDENCE_KINDS.has(r.kind);
}

export function evidenceOnly(s: EccState, ids: (string | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((x): x is string => !!x && isEvidenceId(s, x))));
}

/** Joins short statements, adding the full stop a note may leave off. */
function joinSentences(...parts: (string | undefined)[]): string {
  return parts
    .filter((x): x is string => !!x)
    .map((x) => (/[.!?]$/.test(x.trim()) ? x.trim() : `${x.trim()}.`))
    .join(' ');
}

const lastUpdate = (a?: ResponseAction) => a?.updates[a.updates.length - 1];
const caution = (st: ActionStatus) => st === 'completion-reported' || st === 'could-not-complete';

function personnelChain(s: EccState) {
  const rec = s.recommendations.find((r) => r.id === PERSONNEL_REC);
  const dec = rec?.decisionId ? s.decisions.find((d) => d.id === rec.decisionId) : undefined;
  const act = dec?.actionId ? s.actions.find((a) => a.id === dec.actionId) : undefined;
  return { rec, dec, act };
}

/**
 * Response items attached to a condition because the decision that created them was recorded on
 * that assessment line (the decision's frozen basis names the line). The personnel check is attached
 * through PERSONNEL_REC instead and excluded here. Items with no decision in ECC attach to nothing.
 */
function linkedResponses(s: EccState, row: AssessmentRow): LinkedResponse[] {
  const { act: personnelAct } = personnelChain(s);
  return s.actions
    .filter((a) => a.decisionId && a.id !== personnelAct?.id)
    .map((act) => {
      const dec = s.decisions.find((d) => d.id === act.decisionId);
      const rec = dec ? s.recommendations.find((r) => r.id === dec.recommendationId) : undefined;
      return { act, dec, rec };
    })
    .filter((l) => l.dec?.basis.lines.some((line) => line.label === row.label));
}

/** The four condition units in brief order: fire, release, pump, personnel. */
export function conditionUnits(s: EccState): ConditionUnit[] {
  const alerts = monitoringSummary(s).alerts;
  const cs = concerns(s);
  const chain = personnelChain(s);
  return briefConditions(s).map<ConditionUnit>((c) => {
    const row = s.rows.find((r) => r.id === c.ref)!;
    const unitAlerts = alerts.filter((a) => MONITOR_CONDITION[a.monitorId] === c.key);
    const issue = s.issues.find((i) => ISSUE_CONDITION[i.id] === c.key);
    const concern = cs.find((x) => (x.id === 'people' && c.key === 'people') || (x.id === 'release' && c.key === 'release'));
    const { rec, dec, act } = c.key === 'people' ? chain : {};
    const linked = linkedResponses(s, row);
    const decisionWaiting = !!rec && rec.status !== 'decided';
    const cautionAct = [act, ...linked.map((l) => l.act)].find((a) => a && caution(a.status));
    const openAct = act ?? linked[0]?.act;

    // One status line, in this order: a decision waiting, a response needing attention, the open item's own status, then the response as reported.
    let status: string | undefined;
    let statusTone: ConditionUnit['statusTone'] = 'neutral';
    const shownAct = !decisionWaiting ? (cautionAct ?? (concern?.status ? undefined : !dec || act ? openAct : undefined)) : undefined;
    if (decisionWaiting) [status, statusTone] = [rec!.status === 'deferred' ? 'Recommendation deferred, still on the review list' : 'Recommendation awaiting review', 'attention'];
    else if (cautionAct) [status, statusTone] = [`${cautionAct.title}: ${ACTION_STATUS_LABEL[cautionAct.status].toLowerCase()}`, 'attention'];
    else if (concern?.status) [status, statusTone] = [concern.status, 'attention'];
    else if (dec && !act) status = `Decided: ${OUTCOME_LABEL[dec.outcome].toLowerCase()}`;
    else if (openAct) status = `${openAct.title}: ${ACTION_STATUS_LABEL[openAct.status].toLowerCase()}`;

    const next: ConditionUnit['next'] = decisionWaiting
      ? { label: 'Review and decide', kind: 'decide' }
      : cautionAct?.status === 'completion-reported'
        ? { label: 'Review reported completion', kind: 'verify' }
        : concern
          ? { label: concern.action.label, kind: issue?.type === 'conflict' ? 'compare' : 'response' }
          : openAct && openAct.status !== 'completion-verified'
            ? { label: 'Open response', kind: 'response' }
            : unitAlerts.length
              ? { label: 'Open reading', kind: 'reading' }
              : { label: 'Open assessment', kind: 'open' };

    const attention = decisionWaiting || !!cautionAct || !!concern;
    const evidence = evidenceOnly(s, [
      ...row.refs,
      ...(concern?.links ?? []),
      ...(rec?.evidence ?? []),
      ...(issue?.refs ?? []),
      ...(issue?.resolution?.refs ?? []),
      ...unitAlerts.map((a) => a.monitorId),
      ...(act?.updates.map((u) => u.reportId) ?? []),
      ...linked.flatMap((l) => l.act.updates.map((u) => u.reportId)),
    ]);
    const changedAt = Math.max(row.at, issue?.resolution?.at ?? 0, rec?.surfacedAt ?? 0, dec?.at ?? 0, lastUpdate(act)?.at ?? 0, ...linked.map((l) => Math.max(l.dec?.at ?? 0, lastUpdate(l.act)?.at ?? 0)), ...unitAlerts.map((a) => a.raisedAt));

    // For a conflict the note already states both reports; elsewhere the open item's detail adds what is missing.
    // A sentence the note already says is dropped, so the same fact is not stated twice.
    const added = concern && issue?.type !== 'conflict' ? concern.detail.split(/(?<=\.)\s+/).filter((x) => !(c.note ?? '').toLowerCase().includes(x.replace(/\.$/, '').toLowerCase())).join(' ') : undefined;
    const state = joinSentences(c.note, added);
    return { key: c.key, railId: situationRailId(c.key), label: c.label, value: c.value, note: c.note, state, trust: c.trust, tone: c.tone, row, alerts: unitAlerts, concern, issue, rec, dec, act, linked, attention, status, statusShort: shownAct ? ACTION_STATUS_LABEL[shownAct.status] : status, statusTone, next, evidence, changedAt };
  });
}

export function conditionUnit(s: EccState, railId: string): ConditionUnit | undefined {
  const key = railId.slice(SITUATION_RAIL_PREFIX.length);
  return conditionUnits(s).find((u) => u.key === key);
}

export type FocalKind = 'decision' | 'verification' | 'condition' | 'alert';

/**
 * The focal unit. Ordering assumption, documented for validation:
 *   1. a recommendation waiting for a decision (the next human decision);
 *   2. a response reported complete and awaiting a person's verification;
 *   3. the leading open concern, in the order brief.ts states them (people, release);
 *   4. a condition with an active alert at the highest configured severity.
 * Nothing qualifying means no focal unit; the screen never says all clear.
 */
export function focalUnit(s: EccState): { unit: ConditionUnit; kind: FocalKind } | undefined {
  const units = conditionUnits(s);
  const decide = units.find((u) => u.next.kind === 'decide');
  if (decide) return { unit: decide, kind: 'decision' };
  const verify = units.find((u) => u.next.kind === 'verify');
  if (verify) return { unit: verify, kind: 'verification' };
  for (const c of concerns(s)) {
    const u = units.find((x) => x.concern?.id === c.id);
    if (u) return { unit: u, kind: 'condition' };
  }
  const alert = units.find((u) => u.alerts.some((a) => a.display === 'urgent'));
  if (alert) return { unit: alert, kind: 'alert' };
  return undefined;
}

/** Response items not attached to any condition: no decision in ECC, or a decision recorded on no condition line. */
export function unattachedResponse(s: EccState): ResponseLine[] {
  const attached = new Set(conditionUnits(s).flatMap((u) => [u.act?.id, ...u.linked.map((l) => l.act.id), u.dec && !u.act ? u.dec.id : undefined]));
  return responseLines(s).filter((r) => !attached.has(r.id));
}

export interface QuietItem {
  id: string;
  label: string;
  detail?: string;
  ref: string;
}

/**
 * Open questions and source limits that are real but need no decision now. Shown quietly, never dropped.
 * A limited source already carried by an open question (its record comes from that source) is listed once.
 */
export function quietItems(s: EccState): QuietItem[] {
  const open = otherOpenItems(s).map<QuietItem>((o) => ({ id: o.id, label: o.label, detail: s.issues.find((i) => i.id === o.id)?.detail, ref: o.id }));
  const covered = new Set(
    s.issues
      .filter((i) => i.status !== 'answered')
      .flatMap((i) => i.refs.map((r) => s.docs.find((d) => d.id === r)?.sourceSystem))
      .filter((x): x is string => !!x),
  );
  const limits = briefHealth(s)
    .limits.filter((l) => !covered.has(l.source.name))
    .map<QuietItem>((l) => ({ id: l.source.id, label: `${l.source.name} ${sourceWord(l.source)}`, detail: l.effect, ref: s.monitors.find((m) => m.sourceId === l.source.id)?.id ?? l.source.id }));
  return [...open, ...limits];
}

const sourceWord = (x: Source) => (x.state === 'delayed' ? 'delayed' : x.state === 'stale' ? 'out of date' : x.state === 'unavailable' ? 'unavailable' : x.state === 'recovering' ? 'recovering' : 'connected');

/** The procedure a recommendation cites, with its revision kept and any newer one offered, never substituted. */
export function citedProcedure(s: EccState, rec: Recommendation): { citation: Citation; label: string; newer?: KRevision } | undefined {
  const citation = rec.procedureRef ? s.citations.find((c) => c.id === rec.procedureRef) : undefined;
  if (!citation) return undefined;
  const doc = citation.docId ? s.knowledge.find((d) => d.id === citation.docId) : undefined;
  const section = doc ? citation.title.replace(`${doc.docNumber}, `, '') : citation.title;
  const label = doc ? [doc.docNumber, citation.revision].filter(Boolean).join(' ') + `, ${section}` : citation.title;
  return { citation, label, newer: newerRevision(s, citation) };
}

/**
 * About two sentences on the current development, by stage, with the qualifiers kept. Times come from the
 * reports on record. The header already names the incident and the place, so neither is repeated here.
 */
export function briefNarrative(s: EccState): string {
  const st = stage(s);
  const t = (id: string, fallback: string) => {
    const r = s.reports.find((x) => x.id === id);
    return r?.observedAt !== undefined && r.observedAt !== null ? fmt(r.observedAt) : fallback;
  };
  const alarm = s.monitors.find((m) => m.id === 'MON-FD3107')?.alert ? ' Fire detector FD-3107 remains in alarm.' : '';
  const initial = 'Flame and a liquid release are reported at the pump; the extent is not established.';
  switch (st) {
    case 'notification':
      return `${initial} No injuries reported, which does not establish that anyone has been checked.`;
    case 'prep-1':
      return `${initial} P-3104B and Area 31 identified; records are being retrieved.`;
    case 'procedures-retrieved':
      return `${initial} Drawings place pipe rack PR-31 alongside the skid; neither PR-31 nor tank T-3201 is reported involved.`;
    case 'prep-2':
      return `Field operator reports flame on the skid and liquid still coming from the seal at ${t('RPT-002', '14:09')}. An open permit places 4 contractors on PR-31; nobody is reported as checked.`;
    case 'prep-3':
    case 'prep-4':
      return `Flame reported on the skid. Whether liquid is still coming is disputed: field operator at ${t('RPT-002', '14:09')}, control system zero flow at ${t('RPT-003', '14:11')}. Pump shown stopped on the control system, not confirmed on scene.`;
    case 'fire-team-on-scene':
      return `Fire team on scene reports flame confined to the skid at ${t('RPT-006', '14:19')}, not out. Pump stopped; liquid still coming from the seal at a lower rate, cause not established.`;
    case 'flame-out-reported':
      return `Fire team reports flame out at ${t('RPT-007', '14:27')}, not independently verified.${alarm} Residual liquid on the skid; whether the line is isolated is not established.`;
  }
  return s.headline.statement;
}

/** When the brief last changed: the newest assessment line or headline. */
export function briefAt(s: EccState): Minutes {
  return Math.max(s.headline.at, ...briefConditions(s).map((c) => c.at));
}
