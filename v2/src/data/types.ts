// Core data model. The six "independent dimensions" from the brief are kept as
// separate fields and separate types so they never collapse into one colour.

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type EvidenceStatus = 'verified' | 'reported' | 'inferred' | 'unverified';
export type SourceHealth = 'live' | 'stale' | 'lost';
export type ConditionState = 'active' | 'cleared' | 'unconfirmed' | 'recovered' | 'reported';
export type DecisionStatus = 'none' | 'approved' | 'deferred' | 'declined';
export type ExecutionStatus = 'not-started' | 'reported' | 'verified';
export type Trend = 'rising' | 'falling' | 'steady';

export type Unit = 'bar' | '°C' | 'm³/h' | '%' | 'status';

export interface Equipment {
  id: string;          // tag, e.g. D-0001
  name: string;        // HP Separator
  area: string;        // Unit / area label
  kind: string;        // Vessel, Fire protection, Piping
  /** Role in this emergency, revealed per step (index = first step where relevant). */
  relevance: { step: number; role: string }[];
  drawings: { docId: string; region?: Region; page?: number }[];
}

export interface Region { page: number; x: number; y: number; w: number; h: number } // fractions of page

export interface LimitDef { label: string; value: number; kind: 'high' | 'low'; basis: string }

export interface WatcherDef {
  id: string;              // equipmentId:variable
  equipmentId: string;
  variable: string;        // Pressure
  unit: Unit;
  decimals: number;
  baseline: number;        // value before any step
  limits: LimitDef[];      // illustrative configured limits
  defaultLimit?: string;   // label of limit shown by default
  defaultOnCard: boolean;  // visible by default on card
  statusLabels?: [string, string]; // for unit 'status': [0 label, 1 label]
}

export interface ReadingKeypoint {
  value: number;
  trend: Trend;
  source?: SourceHealth;   // defaults to live
  /** Seconds after step reveal before the ramp starts (default 0). */
  rampSec?: number;
}

export interface EvidenceRef {
  docId: string;
  revision: string;             // the revision the finding actually used
  page: number;
  label: string;                // e.g. "§4.2 Preparation"
  /** Exact quote to locate in the text layer. */
  quote?: string;
  /** Explicit region for drawings. */
  region?: Region;
  /** 'exact' | 'ambiguous' | 'page-only' */
  locate: 'exact' | 'ambiguous' | 'page-only';
}

export interface Recommendation {
  summary: string;
  actions: string[];            // generic, illustrative wording
  prerequisites?: string[];     // missing prerequisites / uncertainty
  evidence: EvidenceRef[];
  calculation?: { label: string; status: 'unavailable'; reason: string } | { label: string; status: 'available'; value: string; basis: string };
}

export interface AlertDef {
  id: string;
  equipmentId: string;
  severity: Severity;
  title: string;                 // concise log description
  offsetSec: number;             // seconds after the step reveal
  watcherId?: string;
  measurement?: string;          // "18.3 bar vs High limit 18.0 bar"
  why: string;                   // why the alert was generated
  consequence: string;           // what may happen if the condition persists
  evidence: EvidenceStatus;      // evidence status of the triggering condition
  recommendation?: Recommendation;
  /** Alerts whose condition this alert clears. */
  clears?: string[];
  /** Condition state of this alert at creation. */
  condition?: ConditionState;
  /** What kind of row this is: an active condition (default), a recovery, or an unverified report. */
  kind?: 'condition' | 'recovery' | 'report';
  /** Earlier recommendations this alert makes stale (evaluated only from revealed steps). */
  supersedes?: { alertId: string; reason: string }[];
}

export interface ObservationDef {
  id: string;
  equipmentId?: string;
  offsetSec: number;
  kind: 'reading' | 'field-report' | 'security-report' | 'agent-finding' | 'route-assessment';
  text: string;
  evidence: EvidenceStatus;
  source: string;                // "Field — Fire team leader", "PI tag D0001.PT"
  sourceHealth?: SourceHealth;
}

export interface LogLine { t: number; level: 'info' | 'warn' | 'error'; text: string }
export interface OperationDef {
  id: string;
  name: string;                  // "Search Knowledge: depressurization"
  source: string;                // "Knowledge index" / "PI historian (simulated)"
  startSec: number; durationMs: number;
  result: 'ok' | 'error' | 'retry' | 'empty';
  detail: string;
  retries?: number;
  configVersion: string;
  linked?: { kind: 'alert' | 'doc' | 'observation'; id: string; label: string }[];
  logs: LogLine[];
}
export interface TaskStepDef { id: string; name: string; status: 'done' | 'error' | 'waiting'; operations: OperationDef[] }
export interface TaskDef {
  id: string;
  title: string;                 // "Reviewing relevant procedures"
  kind: 'procedures' | 'equipment' | 'monitoring' | 'conflict' | 'assessment' | 'source';
  startSec: number; durationSec: number;
  status: 'done' | 'error' | 'waiting';
  rationale: string;             // concise rationale (not chain-of-thought)
  steps: TaskStepDef[];
}

export interface FindingDef { id: string; offsetSec: number; text: string; supersedes?: string }

export interface KnowledgeEvent { docId: string; revision: string; status: DocRevision['status']; note: string }

export interface SitrepSeed {
  situation: string; actions: string; decisions: string; resources: string; next: string;
}

export interface ScenarioStep {
  index: number;                 // 1..7
  title: string;                 // facilitator label
  nominalOffsetMin: number;      // where the clock jumps to if the demo is ahead
  phase: 'Developing' | 'Escalating' | 'Responding' | 'Stabilizing';
  readings: Record<string, ReadingKeypoint>;
  reiterations?: { alertId: string; offsetSec: number }[]; // repeated notifications for an unchanged condition
  alerts: AlertDef[];
  observations: ObservationDef[];
  findings: FindingDef[];
  tasks: TaskDef[];
  knowledge?: KnowledgeEvent[];
  sitrep?: SitrepSeed;
  /** Field actions reported by the scenario itself (as opposed to user-entered). */
  fieldReports?: { alertId: string; offsetSec: number; text: string; by: string; status: ExecutionStatus }[];
  addEquipment?: string[];       // equipment that becomes relevant at this step
}

export interface DocRevision {
  revision: string;
  status: 'effective' | 'superseded' | 'draft';
  effectiveFrom: string;         // display only
  file: string;                  // /docs/....pdf
  pages: number;
}
export interface KnowledgeDoc {
  id: string;
  title: string;
  type: 'Procedure' | 'P&ID' | 'Area layout' | 'Dependency view' | 'Operating limits' | 'Past-incident report';
  number: string;                // doc number (fixture)
  revisions: DocRevision[];
  equipment: string[];
  summary: string;               // one line
}

export interface HistoricalEmergency {
  id: string;
  title: string;
  mode: 'real' | 'training';
  location: string;
  started: string; ended: string;
  outcome: string;
  summary: string;
  lessons: string[];
  equipment: string[];
}
