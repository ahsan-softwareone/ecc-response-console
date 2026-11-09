// What happened to a reported observation or question, derived only from the incident record.
// "Assessed" means ECC has finished what it can do. It does not mean verified, accepted, resolved or safe.
import { agentStateOf } from '../lib/agent';
import type { IncidentRecord, Investigation, InvestigationResponse } from '../record/types';

export type AnalysisStatus = 'awaiting' | 'investigating' | 'clarification' | 'assessed' | 'failed';
export const ANALYSIS_LABEL: Record<AnalysisStatus, string> = { awaiting: 'Awaiting analysis', investigating: 'Investigating', clarification: 'Needs clarification', assessed: 'Assessed', failed: 'Analysis failed' };
export const ASSESSED_NOTE = 'Assessed means ECC has finished what it can do with its evidence. It does not mean verified, accepted, resolved or safe.';

export function analysisOf(inv: Investigation): AnalysisStatus {
  if (inv.status === 'running') return 'investigating';
  if (inv.status === 'needs-clarification') return 'clarification';
  if (inv.status === 'failed') return 'failed';
  if (inv.status === 'complete') return 'assessed';
  return 'awaiting';
}
export const latestOf = (inv: Investigation): InvestigationResponse | undefined => inv.responses[inv.responses.length - 1];

export type OutcomeKind = 'recommendation' | 'information' | 'conflict' | 'none' | 'review';
export interface Outcome { kind: OutcomeKind; label: string; reason?: string }
export function outcomeOf(inv: Investigation): Outcome | null {
  if (inv.status !== 'complete') return null;
  const r = latestOf(inv); if (!r) return null;
  if (r.humanReview) return { kind: 'review', label: 'Needs human review', reason: 'ECC could not interpret this report with its rules, so it has not assessed the claim itself.' };
  if (r.conflicts.length) return { kind: 'conflict', label: 'Conflicting evidence requires review' };
  if (r.suggestion) return { kind: 'recommendation', label: 'Recommendation available' };
  if (r.missing.length || r.state === 'insufficient' || r.state === 'empty' || r.state === 'passages') return { kind: 'information', label: 'Further information required', reason: r.missing.length ? undefined : 'The evidence available does not settle this.' };
  return { kind: 'none', label: 'No additional response identified', reason: r.noResponseReason ?? 'The evidence checked does not call for a further response.' };
}

export type NextAction = 'resume' | 'start' | 'clarify' | 'retry' | 'recommendation' | 'review' | 'information' | 'none' | 'wait' | 'closed';
export interface NextStep { action: NextAction; text: string; button?: string }
/** The one thing the user can usefully do next. */
export function nextStepOf(inv: Investigation, record: IncidentRecord): NextStep {
  const s = analysisOf(inv); const o = outcomeOf(inv); const r = latestOf(inv);
  if (s === 'awaiting') {
    if (record.status === 'closed') return { action: 'closed', text: 'Not analysed: the incident was closed first. It stays in the record.' };
    const st = agentStateOf(record);
    if (st === 'paused') return { action: 'resume', text: 'Analysis has not started because the agent is paused.', button: 'Resume agent' };
    if (st === 'stopped' || st === 'error') return { action: 'start', text: `Analysis has not started because the agent ${st === 'error' ? 'stopped with an error' : 'is stopped'}.`, button: 'Start agent again' };
    if (st === 'not-started') return { action: 'start', text: 'Analysis has not started because the agent has not started.', button: 'Start agent' };
    return { action: 'wait', text: 'Waiting to start.' };
  }
  if (s === 'investigating') return { action: 'wait', text: 'ECC is working on this now.' };
  if (s === 'clarification') return { action: 'clarify', text: inv.clarification?.question ?? 'ECC needs more detail.', button: 'Answer in Assistant' };
  if (s === 'failed') return { action: 'retry', text: `Analysis could not finish${inv.failure ? `: ${inv.failure}` : r?.retrievalError ? `: ${r.retrievalError}` : ''}. The record is safe.`, button: 'Retry analysis' };
  if (o?.kind === 'recommendation') return { action: 'recommendation', text: 'Review the recommendation and record your decision there.', button: 'Open recommendation' };
  if (o?.kind === 'conflict') return { action: 'review', text: 'Review the conflicting evidence and get an independent check.', button: 'Review evidence' };
  if (o?.kind === 'review') return { action: 'review', text: 'A person needs to review this report. ECC has not assessed the claim.', button: 'Review evidence' };
  if (o?.kind === 'information') return { action: 'information', text: 'More information is needed before this can be assessed further.', button: 'Add detail' };
  return { action: 'none', text: 'No further action is suggested. You can still report more or ask a question.' };
}

export interface FollowThrough { investigationId: string; number: number; kind: Investigation['kind']; text: string; analysis: string; outcome: string | null; reason: string | null; assessment: string | null; assessedAt: number | null; revisions: number; recommendationAlertId: string | null; recommendation: string | null; clarification: { question: string; answer: string | null } | null; observationEventId: string | null; evidenceReported: boolean; urgentWording: boolean; simulated: true }
/** Links from each observation or question to its investigation, assessment and recommendation, for history and exports. */
export function followThroughOf(inv: Investigation): FollowThrough {
  const r = latestOf(inv); const o = outcomeOf(inv);
  const c = inv.clarification;
  return { investigationId: inv.id, number: inv.number, kind: inv.kind, text: inv.text, analysis: ANALYSIS_LABEL[analysisOf(inv)], outcome: o?.label ?? null, reason: o?.reason ?? null, assessment: r?.finding ?? null, assessedAt: r?.t ?? null, revisions: inv.responses.length, recommendationAlertId: r?.suggestion?.alertId ?? r?.related?.alertId ?? null, recommendation: r?.suggestion?.summary ?? r?.related?.summary ?? null, clarification: c ? { question: c.question, answer: c.answerText ?? c.answer ?? null } : null, observationEventId: inv.observationEventId ?? null, evidenceReported: inv.kind === 'observation', urgentWording: !!inv.urgentWording, simulated: true };
}
export const followThroughLine = (inv: Investigation) => { const f = followThroughOf(inv); return `Analysis: ${f.analysis}${f.outcome ? ` · ${f.outcome}` : ''}${f.recommendation ? ` · Recommendation: ${f.recommendation}` : ''} · Investigation ${f.number} (simulated)`; };
/** Equipment a report concerns: as submitted, or as supplied in a clarification. */
export const equipmentOfInv = (inv: Investigation | undefined): string | undefined => inv?.context.equipmentId;
