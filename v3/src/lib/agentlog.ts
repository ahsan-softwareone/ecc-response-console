// Derivations over agent-activity record entries: category, outcome, equipment,
// and a plain-language (business) account with failures described by impact.
import { EQUIPMENT } from '../data/scenario';
import type { AgentEvent } from '../record/types';

export const AGENT_CATEGORIES = ['Procedures & documents', 'Equipment context', 'Process monitoring', 'Conflicting reports', 'Assessment updates', 'Calculations', 'Source availability & retries'] as const;
export type AgentCategory = typeof AGENT_CATEGORIES[number];
export type Outcome = 'completed' | 'ongoing' | 'failed' | 'retried';
export const OUTCOME_LABEL: Record<Outcome, string> = { completed: 'Completed', ongoing: 'Ongoing', failed: 'Failed', retried: 'Retried' };

const ops = (t: AgentEvent) => t.technical.steps.flatMap((s) => s.operations);

/** Category from what the task actually did (sources used, kind), not its generic label. */
export function categoryOf(t: AgentEvent): AgentCategory {
  const o = ops(t); const srcs = o.map((x) => x.source);
  if (t.taskKind === 'equipment') return 'Equipment context';
  if (t.taskKind === 'conflict') return 'Conflicting reports';
  if (t.taskKind === 'monitoring') return 'Process monitoring';
  if (srcs.length && srcs.every((s) => s.startsWith('Calculation'))) return 'Calculations';
  if (srcs.length && srcs.every((s) => s.startsWith('Knowledge'))) return 'Procedures & documents';
  if (o.some((x) => x.result === 'retry') || t.taskKind === 'source') return 'Source availability & retries';
  if (t.taskKind === 'assessment') return 'Assessment updates';
  return 'Procedures & documents';
}

export function outcomeOf(t: AgentEvent): Outcome {
  if (t.status === 'waiting') return 'ongoing';
  if (ops(t).some((x) => x.result === 'retry')) return 'retried';
  if (t.status === 'error' || ops(t).some((x) => x.result === 'error' || x.result === 'empty')) return 'failed';
  return 'completed';
}

const TAG_RE = /\b([A-Z]{1,3}-\d{3,4}[A-Z]?)\b/g;
const INSTRUMENT: Record<string, string> = { TT: 'temperature', PT: 'pressure', LT: 'level', FT: 'flow', ZS: 'status' };
/** Equipment mentioned by the task (instrument tags map to their equipment). */
export function equipmentOf(t: AgentEvent): string[] {
  const text = [t.title, t.detail ?? '', ...t.findings, ...t.failures, ...ops(t).flatMap((o) => [o.name, o.detail, ...o.logs.map((l) => l.text)])].join(' ');
  const out = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[1];
    if (EQUIPMENT.some((e) => e.id === tag)) out.add(tag);
    else { const num = tag.split('-')[1]; const eq = EQUIPMENT.find((e) => e.id.endsWith(`-${num}`) || e.id.endsWith(`-${num.padStart(4, '0')}`)); if (eq) out.add(eq.id); }
  }
  return [...out];
}

/** Impact-based description of a failed or retried operation, without tool vocabulary. */
export function impactOf(t: AgentEvent): string[] {
  return ops(t).filter((o) => o.result === 'retry' || o.result === 'error' || o.result === 'empty').map((o) => {
    const tag = o.name.match(/\b([A-Z]{2})-(\d{3,4})\b/);
    if (o.result === 'retry' && tag) { const eq = EQUIPMENT.find((e) => e.id.endsWith(`-${tag[2]}`)); return `${eq?.id ?? tag[0]} ${INSTRUMENT[tag[1]] ?? 'reading'} could not be read; its value is frozen at the last good reading.`; }
    if (o.source.startsWith('Calculation')) return 'No validated calculation method is available, so no figure is stated.';
    if (o.result === 'empty') return `Nothing was found: ${o.detail}`;
    return `Could not complete: ${o.detail}`;
  });
}

/** Plain-language account for the business view. */
/** Business view speaks in equipment and measurements, never instrument tags: TT-0029 reads as "D-0029 temperature". */
function plainTags(text: string): string {
  return text.replace(/\b([A-Z]{2})-(\d{3,4})\b/g, (tag, kind: string, num: string) => {
    const eq = INSTRUMENT[kind] ? EQUIPMENT.find((e) => e.id.endsWith(`-${num}`)) : undefined;
    return eq ? `${eq.id} ${INSTRUMENT[kind]}` : tag;
  });
}

export function businessAccount(t: AgentEvent): { headline: string; steps: { name: string; done: boolean }[] } {
  const cat = categoryOf(t); const o = ops(t); const first = o[0];
  let headline = t.detail ?? t.title;
  if (cat === 'Procedures & documents' && t.documents.length) headline = t.taskKind === 'source' ? (first?.detail ?? headline) : `Reviewed ${t.documents.join(', ')}.`;
  if (cat === 'Equipment context' && o.length) headline = `Identified the equipment involved: ${o[o.length - 1].detail}`;
  if (cat === 'Process monitoring') headline = t.status === 'waiting' ? `Monitoring process values for the equipment on the dashboard.` : `Analysed process trends: ${first?.detail ?? ''}`;
  if (cat === 'Conflicting reports') headline = `Compared the field report with instrument readings: ${o[o.length - 1]?.detail ?? ''}`;
  if (cat === 'Calculations') headline = 'Looked for a validated calculation method; none is available, so no figure is stated.';
  if (cat === 'Source availability & retries') {
    const r = o.find((x) => x.result === 'retry'); const tag = r?.name.match(/\b([A-Z]{2})-(\d{3,4})\b/);
    const eq = tag ? EQUIPMENT.find((e) => e.id.endsWith(`-${tag[2]}`)) : undefined;
    headline = r && tag ? `Retried the ${eq?.id ?? tag[0]} ${INSTRUMENT[tag[1]] ?? 'reading'} ${r.retries ? `${r.retries} times ` : ''}after it stopped updating; it could not be read, so its value stays frozen at the last good reading.` : (impactOf(t)[0] ?? headline);
  }
  if (cat === 'Assessment updates') headline = `${t.detail ?? ''} ${o[o.length - 1]?.detail ?? ''}`.trim();
  return { headline: plainTags(headline.replace(/\s+/g, ' ').replace(/\(simulated\)/g, '').trim()), steps: t.technical.steps.map((s) => ({ name: plainTags(s.name), done: s.status === 'done' })) };
}

/** An operation inside a failed step is an error, whatever its own result: a tag lost after retries, or a method that does not exist, is a failure and must be found by filtering on errors. */
export function operationLevel(step: { status: string }, op: { result: string }): 'error' | 'warn' | 'info' {
  if (step.status === 'error' || op.result === 'error') return 'error';
  return op.result === 'retry' || op.result === 'empty' ? 'warn' : 'info';
}

export interface FlatRow { t: number; level: string; taskId: string; task: string; source: string; message: string; runId: string; durationMs?: number; retries?: number; kind: 'operation' | 'log' }
/** Flat chronological technical log across all tasks: one row per operation and per log line. */
export function flatLog(tasks: AgentEvent[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const t of tasks) for (const s of t.technical.steps) for (const o of s.operations) {
    rows.push({ t: o.startedAt, level: operationLevel(s, o), taskId: t.taskId, task: t.title, source: o.source, message: `${o.name} — ${o.result}: ${o.detail}`, runId: t.runId, durationMs: o.durationMs, retries: o.retries, kind: 'operation' });
    for (const l of o.logs) rows.push({ t: l.t, level: l.level, taskId: t.taskId, task: t.title, source: o.source, message: l.text, runId: t.runId, kind: 'log' });
  }
  return rows.sort((a, b) => a.t - b.t);
}
