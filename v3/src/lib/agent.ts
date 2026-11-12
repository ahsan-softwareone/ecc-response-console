// Agent run model. Agent output is released by the run windows recorded on the incident;
// source acquisition (readings, field reports) is never gated by these windows.
import type { AgentConfig, AgentRun, CapabilityGroup, IncidentRecord } from '../record/types';

export const AGENT_BUILD = 'ecc-agent 0.9.3';
/** Capability groups map onto the simulated agent's existing task kinds. Monitoring, alerting and source checks always run. */
export const CAPABILITIES: { id: CapabilityGroup; label: string; note: string }[] = [
  { id: 'procedures', label: 'Procedure and document review', note: 'Off: no suggested responses or document review tasks' },
  { id: 'equipment', label: 'Equipment context', note: 'Off: no equipment lookup tasks' },
  { id: 'conflict', label: 'Conflicting-report comparison', note: 'Off: no comparison tasks' },
  { id: 'assessment', label: 'Assessment updates', note: 'Off: no assessment findings' },
];
export const DEFAULT_AGENT_CONFIG: AgentConfig = { version: 1, autoStart: true, capabilities: CAPABILITIES.map((c) => c.id), retrievalScope: 'incident-site' };
export const configLabel = (c: AgentConfig) => `config v${c.version}`;
export function describeConfig(c: AgentConfig): string {
  const caps = c.capabilities.length === CAPABILITIES.length ? 'all capabilities' : c.capabilities.length ? CAPABILITIES.filter((x) => c.capabilities.includes(x.id)).map((x) => x.label).join(', ') : 'no optional capabilities';
  return `${caps} · search ${c.retrievalScope === 'incident-site' ? 'incident site' : 'all sites'}`;
}

export interface Window { from: number; to: number; run: AgentRun }
/** The intervals during which the agent was actually processing. */
export function processingWindows(runs: AgentRun[]): Window[] {
  const out: Window[] = [];
  for (const run of runs) {
    let from = run.startedAt;
    for (const p of run.pauses) { out.push({ from, to: p.from, run }); from = p.to ?? Infinity; }
    if (from !== Infinity) out.push({ from, to: run.endedAt ?? Infinity, run });
  }
  return out.filter((w) => w.to > w.from).sort((a, b) => a.from - b.from);
}
/** When an item with source time t is processed: at t inside a window, otherwise when processing next begins. Null until then. */
export function releaseOf(t: number, windows: Window[]): { at: number; run: AgentRun } | null {
  for (const w of windows) {
    if (t < w.from) return { at: w.from, run: w.run };
    if (t < w.to) return { at: t, run: w.run };
  }
  return null;
}

export type AgentState = 'none' | 'not-started' | 'running' | 'paused' | 'stopped' | 'error';
export function agentStateOf(r: IncidentRecord | undefined): AgentState {
  if (!r) return 'none';
  const run = currentRun(r);
  if (!run) return 'not-started';
  if (run.status === 'running') return 'running';
  if (run.status === 'paused') return 'paused';
  if (run.status === 'error') return 'error';
  return 'stopped';
}
export const currentRun = (r: IncidentRecord | undefined): AgentRun | undefined => r?.agentRuns?.[r.agentRuns.length - 1];

export const LIFECYCLE_LABEL: Record<IncidentRecord['status'], string> = { active: 'Active', stabilizing: 'Active', resolved: 'Resolved', closed: 'Closed', 'left-open': 'Active · set aside' };
export const isOpen = (r: IncidentRecord | undefined) => !!r && r.status !== 'closed';
/** Incident type for historical filtering: as stated, or inferred from the title for older records. */
export function incidentTypeOf(r: IncidentRecord): string {
  if (r.incidentType) return r.incidentType;
  const t = r.title.toLowerCase();
  if (/drone|security|intrusion/.test(t)) return 'Security';
  if (/fire|flame|smoke/.test(t)) return 'Fire';
  if (/leak|release|spill|h2s|gas/.test(t)) return 'Release';
  if (/trip|pump|compressor|failure|outage/.test(t)) return 'Equipment';
  return 'Other';
}
export const INCIDENT_TYPES = ['Fire', 'Smoke', 'Gas or liquid release', 'Explosion', 'Injury', 'Security', 'Equipment failure', 'Other', 'Not sure'];
