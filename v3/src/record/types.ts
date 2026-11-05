// Self-contained incident record. Everything Sit. Rep, Knowledge → Incidents and the
// exports show comes from this structure, never from scenario.ts at render time.
import type { EvidenceStatus, ExecutionStatus, Severity } from '../data/types';

export type RecordKind =
  | 'notification' | 'equipment' | 'measurement' | 'observation' | 'alert' | 'finding'
  | 'recommendation' | 'decision' | 'report' | 'outcome' | 'gap' | 'agent' | 'reference'
  | 'knowledge' | 'report-version' | 'stabilization' | 'closure' | 'correction' | 'lesson' | 'acknowledgement'
  | 'agent-control' | 'config' | 'lifecycle' | 'resolution';

export interface PinnedEvidence { docId: string; title: string; number: string; revision: string; page: number; label: string; locate: 'exact' | 'ambiguous' | 'page-only'; quote?: string; region?: { page: number; x: number; y: number; w: number; h: number } }

export interface RecordEventBase {
  id: string;            // stable id (scenario id or generated)
  t: number;             // event time (ms epoch, scenario clock)
  recordedAt: number;    // when it entered the record (wall clock)
  kind: RecordKind;
  title: string;         // one-line, human readable
  detail?: string;
  equipmentId?: string;
  source: 'scenario' | 'agent' | 'user' | 'field' | 'system';
  by?: string;
  evidence?: PinnedEvidence[];
  /** For corrections: the id of the event being corrected (original is retained). */
  corrects?: string;
  meta?: Record<string, string | number | boolean | null>;
}
export interface MeasurementEvent extends RecordEventBase { kind: 'measurement'; values: { watcherId: string; variable: string; value: number; unit: string; source: string }[]; /** Significant changes since the previous snapshot, one per line. */ changes: string[] }
export interface AlertEvent extends RecordEventBase { kind: 'alert'; severity: Severity; evidenceStatus: EvidenceStatus; state: string }
export interface RecommendationEvent extends RecordEventBase { kind: 'recommendation'; alertId: string; summary: string; actions: string[]; prerequisites: string[]; calculation?: string; supersededBy?: { alertId: string; t: number; reason: string } }
export interface DecisionEvent extends RecordEventBase { kind: 'decision'; alertId: string; status: 'approved' | 'deferred' | 'declined'; rationale: string; recommendationSummary: string; knownEventCount: number }
export interface ReportEvent extends RecordEventBase { kind: 'report'; alertId: string; status: ExecutionStatus }
export interface AgentEvent extends RecordEventBase { kind: 'agent'; headline: string; /** Documents consulted, resolvable to the viewer. */ docRefs?: { docId: string; revision: string; page?: number; label: string }[]; taskId: string; taskKind: string; status: 'done' | 'error' | 'waiting'; sources: string[]; documents: string[]; findings: string[]; failures: string[]; runId: string; configVersion: string; technical: { steps: { name: string; status: string; operations: { name: string; source: string; startedAt: number; durationMs: number; result: string; detail: string; retries: number; logs: { t: number; level: string; text: string }[] }[] }[] } }
export interface ReportVersionEvent extends RecordEventBase { kind: 'report-version'; versionId: string; number: number; status: 'draft' | 'review' | 'approved'; asOf: number }
export interface ClosureEvent extends RecordEventBase { kind: 'closure'; rationale: string; outstanding: string[] }
export interface StabilizationEvent extends RecordEventBase { kind: 'stabilization'; rationale: string }
export type RecordEvent = RecordEventBase | MeasurementEvent | AlertEvent | RecommendationEvent | DecisionEvent | ReportEvent | AgentEvent | ReportVersionEvent | ClosureEvent | StabilizationEvent;

export type SitrepSectionKey = 'situation' | 'response' | 'decisions' | 'outstanding' | 'priorities';
export interface SitrepSections { situation: string; response: string; decisions: string; outstanding: string; priorities: string }
export interface ReportVersion {
  id: string; number: number; createdAt: number; asOf: number;
  status: 'draft' | 'review' | 'approved';
  author: string; approvedBy?: string; approvedAt?: number;
  /** Text as generated from the record at asOf. */
  generated: SitrepSections;
  /** Text as it stands (user edits). */
  sections: SitrepSections;
  /** Sections where a refresh produced newer text the user has not accepted or rejected. */
  pending?: Partial<SitrepSections>;
}

export type CapabilityGroup = 'procedures' | 'equipment' | 'conflict' | 'assessment';
/** Agent configuration. Prototype options only; each run keeps the version it used. */
export interface AgentConfig { version: number; autoStart: boolean; capabilities: CapabilityGroup[]; retrievalScope: 'incident-site' | 'all-sites' }
export interface AgentPause { from: number; to?: number; by: string; reason?: string; received?: string[] }
export type AgentRunStatus = 'running' | 'paused' | 'stopped' | 'error' | 'completed';
/** One recorded agent run. Starting again adds a run; earlier runs and their outputs stay. */
export interface AgentRun { id: string; number: number; startedAt: number; by: string; reason?: string; config: AgentConfig; status: AgentRunStatus; endedAt?: number; endedBy?: string; endReason?: string; pauses: AgentPause[]; cancelled?: string[] }
export interface ResolutionRecord { t: number; recordedAt: number; by: string; summary: string; rationale: string; evidence: string[]; outstanding: string[]; followUp: string[] }
export interface ClosureRecord { t: number; by: string; rationale: string; outstanding: string[]; sitrep?: string }
/** Enough simulation state to resume a set-aside or reopened incident. */
export interface SimSnapshot { startedAt: number; revealedAt: number[]; dashboard: string[]; watcherOverrides: Record<string, unknown>; alertUser: Record<string, unknown> }

export interface IncidentRecord {
  schema: 'ecc-incident/1';
  id: string;
  title: string;
  site: string;
  mode: 'real' | 'training';
  /** Seeded fixture records are illustrative, not actual events. */
  provenance?: 'seed' | 'live' | 'imported';
  startedAt: number;
  status: 'active' | 'resolved' | 'stabilizing' | 'closed' | 'left-open';
  reportedBy: string;
  equipment: string[];
  events: RecordEvent[];
  reportVersions: ReportVersion[];
  stabilization?: { t: number; by: string; rationale: string };
  closure?: ClosureRecord;
  /** Time the event occurred, as stated by the person starting the record (startedAt for older records). */
  occurredAt?: number;
  /** Time this record was created. */
  createdAt?: number;
  notification?: { text: string; via: string };
  location?: string;
  incidentType?: string;
  resolution?: ResolutionRecord;
  /** Earlier resolutions and closures kept when an incident returns to Active or is reopened. */
  resolutionHistory?: ResolutionRecord[];
  closureHistory?: ClosureRecord[];
  agentRuns?: AgentRun[];
  agentConfig?: AgentConfig;
  /** Started with reference to a historical incident. Nothing is copied from it. */
  basedOn?: { id: string; title: string };
  linkedIncidents?: { id: string; title: string; t: number; by: string }[];
  importedFrom?: string;
  sim?: SimSnapshot;
  lessons: { id: string; t: number; by: string; text: string }[];
  /** Document revisions explicitly referenced in this incident. */
  references: { docId: string; revision: string; t: number; by: string; note: string }[];
  updatedAt: number;
}
