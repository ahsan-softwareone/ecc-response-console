// Domain model for the ECC prototype. The vocabulary here encodes the trust
// distinctions the UI must preserve; do not collapse these into a generic "status".

export type Minutes = number; // scenario clock, minutes after midnight

export type ViewId = 'situation' | 'assets' | 'information' | 'actions' | 'reports' | 'activity' | 'knowledge' | 'admin' | 'settings';

/**
 * How far a statement can be relied on. These are never interchangeable:
 * `not-reported` (nobody has said), `unknown` (we cannot establish it),
 * `unavailable` (the source could not be reached) and `confirmed-absent`
 * (someone checked and it is not there) mean different things.
 */
export type Trust =
  | 'verified'
  | 'reported'
  | 'assessment'
  | 'conflict'
  | 'unknown'
  | 'not-reported'
  | 'unavailable'
  | 'stale'
  | 'confirmed-absent';

export const TRUST_LABEL: Record<Trust, string> = {
  verified: 'Verified',
  reported: 'Reported, not verified',
  assessment: 'Agent assessment',
  conflict: 'Disputed',
  unknown: 'Unknown',
  'not-reported': 'Not reported',
  unavailable: 'Source unavailable',
  stale: 'Out of date',
  'confirmed-absent': 'Checked, not present',
};

export interface Person {
  id: string;
  name: string;
  role: string;
}

export type ReportChannel = 'control-room' | 'field' | 'fire-team' | 'security' | 'user-entry';

export interface Report {
  id: string; // RPT-nnn
  kind: 'report';
  channel: ReportChannel;
  sourceName: string;
  sourceRole: string;
  /** Source observation type: what a person saw vs. what an instrument displayed. */
  observation: 'direct' | 'instrument';
  observedAt: Minutes | null; // event time; null = source gave none
  receivedAt: Minutes;
  text: string;
  trust: 'reported' | 'verified';
  assetIds: string[];
  /** Who typed it into the record, for updates entered by a user. */
  enteredBy?: string;
  actionId?: string;
}

export interface RecordField {
  label: string;
  value: string;
}

export interface Doc {
  id: string; // DOC-nn
  kind: 'document';
  docType: 'Equipment record' | 'Connectivity record' | 'Plot plan' | 'Work permit' | 'Maintenance history' | 'Weather station' | 'Procedure (placeholder)';
  title: string;
  sourceSystem: string;
  availability: 'available' | 'unavailable' | 'stale';
  retrievedAt: Minutes;
  summary: string;
  fields: RecordField[];
  note?: string;
  attempts?: number;
  assetIds: string[];
  /** The original behind this operational record, when there is one. */
  file?: string;
  monitorId?: string;
}

export type IssueType = 'conflict' | 'missing' | 'stale' | 'unavailable';

export interface Issue {
  id: string; // ISS-nn
  kind: 'issue';
  type: IssueType;
  status: 'open' | 'partly-answered' | 'answered';
  title: string; // phrased as the open question
  detail: string;
  whyItMatters: string;
  whatWouldHelp: string;
  refs: string[];
  raisedAt: Minutes;
  /** For conflicts: the reports to compare side by side. */
  reportIds?: [string, string];
  /** For conflicts: what the reports disagree on, and how they were later reconciled. */
  pointOfConflict?: string;
  resolution?: { at: Minutes; text: string; trust: Trust; refs: string[] };
}

export type AssetRelation = 'reported-involved' | 'verified-involved' | 'potentially-relevant' | 'context';

export const RELATION_LABEL: Record<AssetRelation, string> = {
  'reported-involved': 'Reported involved',
  'verified-involved': 'Verified involved',
  'potentially-relevant': 'Potentially relevant, not reported involved',
  context: 'Context only',
};

export interface Condition {
  at: Minutes;
  statement: string;
  trust: Trust;
  refs: string[];
}

export interface Asset {
  id: string; // AST-<tag>
  kind: 'asset';
  tag: string;
  name: string;
  assetType: 'equipment' | 'area';
  area: string;
  relation: AssetRelation;
  whyIncluded: string;
  condition: Condition; // current condition, as observed or reported
  conditionHistory: Condition[];
  /** A possible future consequence. Never a statement about the current condition. */
  possibleConsequence?: string;
  refs: string[];
  /** Hidden from every view until the agent has identified it during brief preparation. */
  identified: boolean;
}

/** One line of the current assessment. Each answers a question the user is asking. */
export interface AssessmentRow {
  id: string; // ROW-<key>
  kind: 'assessment';
  label: string;
  statement: string;
  trust: Trust;
  at: Minutes;
  refs: string[];
  history: { at: Minutes; statement: string; trust: Trust; refs: string[] }[];
}

export type RecStatus = 'awaiting-review' | 'deferred' | 'decided';

export interface Recommendation {
  id: string; // REC-nn
  kind: 'recommendation';
  title: string; // always phrased "Consider ...": a suggestion, not an instruction
  shortTitle: string; // name used on links and in the record
  why: string;
  uncertainty: string;
  evidence: string[];
  procedureRef?: string;
  surfacedAt: Minutes;
  status: RecStatus;
  decisionId?: string;
  /** Title for the response item created if a person decides to proceed. */
  responseTitle: string;
  /** Information that arrived after this was surfaced. The original text stays as written. */
  updates: { at: Minutes; text: string; refs: string[] }[];
}

export type DecisionOutcome = 'proceed' | 'proceed-with-changes' | 'do-not-proceed' | 'defer';

export const OUTCOME_LABEL: Record<DecisionOutcome, string> = {
  proceed: 'Proceed',
  'proceed-with-changes': 'Proceed with changes',
  'do-not-proceed': 'Do not proceed',
  defer: 'Defer',
};

export interface Decision {
  id: string; // DEC-nn
  kind: 'decision';
  recommendationId: string;
  outcome: DecisionOutcome;
  recordedBy: string;
  recordedByRole: string;
  at: Minutes;
  rationale: string;
  /** What the assessment said when this was decided. Frozen; never updated. */
  basis: { asOf: Minutes; lines: { label: string; statement: string; trust: Trust }[] };
  actionId?: string;
}

export type ActionStatus =
  | 'no-report' // decided, but nobody has reported anything yet
  | 'in-progress'
  | 'could-not-complete'
  | 'completion-reported' // someone says it is done; awaiting confirmation
  | 'completion-verified';

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  'no-report': 'No progress reported',
  'in-progress': 'Reported in progress',
  'could-not-complete': 'Reported could not complete',
  'completion-reported': 'Completion reported, awaiting confirmation',
  'completion-verified': 'Completion verified',
};

export interface ActionUpdate {
  at: Minutes;
  reportedBy: string;
  status: ActionStatus;
  text: string;
  reportId: string;
}

/** A response item tracks what people report. The system performs none of these. */
export interface ResponseAction {
  id: string; // ACT-nn
  kind: 'action';
  title: string;
  /** Set when it came from a recorded decision; otherwise it was only reported to the record. */
  decisionId?: string;
  status: ActionStatus;
  updates: ActionUpdate[];
  verification?: { by: string; at: Minutes; basis: string };
}

export type LogKind = 'report' | 'record' | 'assessment' | 'recommendation' | 'decision' | 'response' | 'agent';

export const LOG_KIND_LABEL: Record<LogKind, string> = {
  report: 'Report',
  record: 'Record retrieved',
  assessment: 'Assessment revised',
  recommendation: 'Recommendation',
  decision: 'Decision',
  response: 'Response update',
  agent: 'Agent activity',
};

/** The single chronological history of the incident. Timeline and feed both read this. */
export interface LogEntry {
  seq: number;
  at: Minutes; // when it entered the record
  eventAt?: Minutes; // when it happened, if different and known
  kind: LogKind;
  title: string;
  ref?: string;
  material: boolean; // material entries make a report draft out of date
}

export interface MaterialChange {
  id: string; // CHG-nn
  seq: number;
  at: Minutes;
  title: string;
  before?: string;
  after: string;
  refs: string[];
}

export interface DraftSection {
  id: string;
  title: string;
  text: string;
  /** The last agent text this section was based on, used to detect user edits. */
  baseText: string;
  /** Set when a refresh produced new agent text for a section the user had edited. */
  incomingText?: string;
  changedInLastRefresh?: boolean;
}

export interface SitrepDraft {
  version: number;
  asOf: Minutes;
  basedOnSeq: number;
  sections: DraftSection[];
  reviewed?: { by: string; at: Minutes };
  /** Earlier versions, frozen when a refresh replaced them. */
  history: { version: number; asOf: Minutes; reviewed?: { by: string; at: Minutes }; sections: { id: string; title: string; text: string }[] }[];
}

export interface AnswerPart {
  kind: 'fact' | 'assessment' | 'gap' | 'note';
  text: string;
  refs: string[];
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  at: Minutes;
  text?: string;
  parts?: AnswerPart[];
  /** The item in focus when the question was asked. */
  contextLabel?: string;
}

export interface PrepStep {
  label: string;
  status: 'pending' | 'active' | 'done' | 'attention';
  outcome?: string;
}

export interface Toast {
  id: number;
  message: string;
  ref?: string;
}

export interface EccState {
  // Scenario progression
  scriptIndex: number; // index into SCRIPT of the next event; SCRIPT.length = finished
  now: Minutes;
  preparing: boolean;
  prepSteps: PrepStep[];
  headline: { statement: string; trust: Trust; at: Minutes; refs: string[] };

  // Incident record
  reports: Report[];
  docs: Doc[];
  issues: Issue[];
  assets: Asset[];
  rows: AssessmentRow[];
  recommendations: Recommendation[];
  decisions: Decision[];
  actions: ResponseAction[];
  log: LogEntry[];
  changes: MaterialChange[];
  seq: number;
  draft: SitrepDraft | null;

  // Workspace (shared, because the Assistant and reports need the current focus)
  view: ViewId;
  rail: { tab: 'details' | 'assistant'; open: boolean; stack: string[] };
  chat: ChatMessage[];
  /** Changes with seq above this are shown as new on Situation. */
  changesSeenSeq: number;
  /** Feed entries above this are held behind a "new updates" control. */
  feedShownSeq: number;
  toast: Toast | null;
  /** Facilitator actions. Kept apart from the incident record so they never read as incident events. */
  trainingLog: { at: Minutes; text: string }[];

  // Incident stream
  feed: FeedEntry[];
  activity: ExecRecord[];
  sources: Source[];
  /** What the agent is doing right now, in plain words. */
  agentWork: string;
  monitors: Monitor[];
  tasks: AgentTask[];
  /** Training simulation, separate from whether the reader is following the feed. */
  sim: { running: boolean };
  /** The user's explicit review point. Reviewing never acknowledges an operational decision. */
  reviewedAt: Minutes | null;

  // Platform
  knowledge: KDoc[];
  citations: Citation[];
  users: AdminUser[];
  configs: AgentConfig[];
  audit: AuditEntry[];
  prototypeRole: PlatformRole;

  counters: { report: number; decision: number; action: number; change: number; msg: number; toast: number; feed: number; exec: number; upload: number };
}

export type AnyRecord = Report | Doc | Issue | Asset | AssessmentRow | Recommendation | Decision | ResponseAction | FeedEntry | Citation | KDoc | Monitor;

// --- Incident feed --------------------------------------------------------------------------

export type FeedKind = 'notification' | 'alert' | 'finding' | 'equipment' | 'assessment' | 'conflict' | 'gap' | 'recommendation' | 'source' | 'decision' | 'response';

export const FEED_KIND_LABEL: Record<FeedKind, string> = {
  notification: 'Notification',
  alert: 'Alert',
  finding: 'Finding',
  equipment: 'Equipment identified',
  assessment: 'Assessment updated',
  conflict: 'Conflicting reports',
  gap: 'Information gap',
  recommendation: 'Recommendation',
  source: 'Source limitation',
  decision: 'Decision recorded',
  response: 'Response reported',
};

/** One coherent thing learned or changed. The feed explains how the picture developed; the brief holds current truth. */
export interface FeedEntry {
  id: string; // FD-nnn
  kind: 'feed';
  feedKind: FeedKind;
  seq: number;
  title: string;
  body: string;
  why?: string;
  uncertainty?: string;
  /** Absent for entries that are not a statement about conditions, such as a recorded decision. */
  trust?: Trust;
  attribution: string;
  observedAt?: Minutes; // when the source observed it
  receivedAt?: Minutes; // when ECC received it
  publishedAt: Minutes; // when the agent published this entry
  /** Record, report or citation ids that substantiate the entry. */
  citations: string[];
  /** Stated when nothing can be cited, so a missing citation is never silent. */
  noSupportNote?: string;
  assets: string[];
  action?: { label: string; ref: string };
  activity: string[];
  /** Stays marked until the user sets a review point or a later entry supersedes it. Prototype behaviour, not an alarm policy. */
  consequential: boolean;
  /** One concise statement for the collapsed entry. */
  summary?: string;
  /** Set when the entry reports an alert: the display mapping, with the source's own value kept. */
  severity?: DisplaySeverity;
  sourceSeverity?: string;
  /** Stable name, so later entries can supersede this one and repeats can be merged. */
  key?: string;
  supersededBy?: string;
  supersedes?: string;
  before?: string; // earlier assessment wording, for revisions
  /** Low-level items this entry summarises. */
  group?: string[];
  repeatCount?: number; // merged repeats, e.g. retries
  lastRepeatAt?: Minutes;
}

// --- Citations and knowledge ----------------------------------------------------------------

export type ApprovalStatus = 'effective' | 'superseded' | 'draft';
export type ProcessingStatus = 'uploaded' | 'processing' | 'searchable' | 'partial' | 'failed';

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = { effective: 'Effective', superseded: 'Superseded', draft: 'Not approved' };
export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  searchable: 'Processed and searchable',
  partial: 'Partly processed',
  failed: 'Processing failed',
};

export type KDocType = 'Emergency procedure' | 'Policy' | 'P&ID' | 'Area layout' | 'Equipment manual' | 'Equipment record' | 'Maintenance history';

export interface KSection {
  id: string;
  page: number;
  title: string;
  text: string;
  /** Text that could not be extracted; the page exists but cannot be read here. */
  extractionFailed?: string;
}

export interface KRevision {
  rev: string;
  approval: ApprovalStatus;
  effectiveFrom?: string;
  uploadedAt: string;
  processing: ProcessingStatus;
  processingNote?: string;
  sections: KSection[];
  /** For drawings: the illustrative sheet to open. */
  sheet?: DiagramView;
  /** The original file. A revision can exist without one being openable. */
  file?: string;
}

export interface KDoc {
  id: string; // KD-xx
  kind: 'kdoc';
  title: string;
  docNumber: string;
  docType: KDocType;
  facility: string;
  area: string;
  equipment: string[];
  accessScope: string;
  revisions: KRevision[]; // newest first
}

export type DiagramView = 'pid' | 'layout' | 'dependency';

export interface Citation {
  id: string; // CIT-nn
  kind: 'citation';
  sourceType: 'document' | 'diagram' | 'record' | 'reading';
  title: string;
  /** What this reference substantiates. Retrieval alone never establishes support. */
  supports: string;
  docId?: string;
  revision?: string; // the revision used. Never updated when a newer one appears.
  sectionId?: string;
  page?: number;
  excerpt?: string;
  sheet?: DiagramView;
  sheetName?: string;
  tags?: string[]; // equipment to highlight on the sheet
  recordId?: string; // operational record (Doc) this points to
  reading?: { label: string; value: string }[];
  observedAt?: Minutes;
  retrievedAt: Minutes;
  /** Set when the reference cannot be opened: the failure is shown, not hidden. */
  openFailure?: string;
  /** Where in the original the claim is. Absent means no location is known. */
  location?: SourceLocation;
  /** An original file that is not in the knowledge library, such as a permit. */
  file?: string;
  monitorId?: string;
  illustrative?: boolean;
}

export type ConnectionKind = 'process' | 'proximity' | 'assessment';

export const CONNECTION_LABEL: Record<ConnectionKind, string> = {
  process: 'Engineering connection',
  proximity: 'Physical proximity',
  assessment: 'Agent assessment',
};

/** How two items relate. A connection never establishes current impact. */
export interface Connection {
  id: string;
  from: string;
  to: string;
  connectionKind: ConnectionKind;
  label: string;
  provenance: string[]; // citation or record ids
}

// --- Sources and agent execution ------------------------------------------------------------

export type SourceState = 'connected' | 'delayed' | 'stale' | 'unavailable' | 'recovering';

export const SOURCE_STATE_LABEL: Record<SourceState, string> = {
  connected: 'Connected',
  delayed: 'Delayed',
  stale: 'Stale',
  unavailable: 'Unavailable',
  recovering: 'Recovering',
};

export interface Source {
  id: string; // SRC-x
  name: string;
  description: string;
  state: SourceState;
  lastSuccess: Minutes | null;
  /** What the limitation means for the brief. */
  effect?: string;
}

export type ExecType = 'trigger' | 'task-started' | 'task-completed' | 'source-query' | 'document-retrieved' | 'extraction-completed' | 'extraction-failed' | 'assessment-published' | 'assessment-revised' | 'retry' | 'retrieval-failed' | 'output-recorded';

export const EXEC_LABEL: Record<ExecType, string> = {
  trigger: 'Trigger received',
  'task-started': 'Task started',
  'task-completed': 'Task completed',
  'source-query': 'Source queried',
  'document-retrieved': 'Document retrieved',
  'extraction-completed': 'Extraction completed',
  'extraction-failed': 'Extraction failed',
  'assessment-published': 'Assessment published',
  'assessment-revised': 'Assessment revised',
  retry: 'Retry',
  'retrieval-failed': 'Retrieval failed',
  'output-recorded': 'Output recorded',
};

/** An execution record: what ran, when, with what result. Never reasoning. */
export interface ExecRecord {
  id: string; // EXE-nnnn
  runId: string;
  at: Minutes;
  execType: ExecType;
  label: string;
  status: 'ok' | 'failed';
  source?: string;
  durationMs?: number;
  configVersion: string;
  outputs: string[]; // feed entries this produced
  /** Precise simulated start, in ms. Records sort on this, never on formatted times. */
  startMs: number;
  taskId: string;
  operation: string;
  attempt?: number;
  errorCode?: string;
  errorMessage?: string;
  /** Sanitised metadata only. No credentials, payloads or reasoning. */
  input?: string;
  output?: string;
}

// --- Administration -------------------------------------------------------------------------

/** Prototype-only role, used to show role-sensitive controls. Not responsibility for the incident. */
export type PlatformRole = 'Incident user' | 'Knowledge steward' | 'Administrator' | 'Observer';

export interface AdminUser {
  id: string;
  name: string;
  jobTitle: string;
  platformRole: PlatformRole;
  scope: string;
}

export interface AgentConfig {
  version: string;
  status: 'active' | 'draft' | 'retired';
  notes: string;
  activatedAt?: string;
}

export interface AuditEntry {
  at: Minutes;
  actor: string;
  action: string;
  target: string;
}

// --- Monitoring -----------------------------------------------------------------------------

/**
 * Three independent dimensions, never merged:
 * severity (how serious the alert is), evidence (Trust: how the claim is supported) and source health (SourceState).
 * Display severity is an illustrative prototype mapping. `sourceSeverity` keeps the value the source sent.
 */
export type DisplaySeverity = 'urgent' | 'warning' | 'advisory';

export const SEVERITY_LABEL: Record<DisplaySeverity, string> = { urgent: 'Urgent', warning: 'Warning', advisory: 'Advisory' };

/** Illustrative only. A customer's definitions replace this; it is not an approved policy. */
export const SEVERITY_MAPPING: { source: string; display: DisplaySeverity }[] = [
  { source: 'PRI-1', display: 'urgent' },
  { source: 'PRI-2', display: 'warning' },
  { source: 'PRI-3', display: 'advisory' },
];

export interface Alert {
  id: string; // ALT-x
  monitorId: string;
  message: string;
  sourceSeverity: string; // as sent by the source
  display: DisplaySeverity;
  raisedAt: Minutes;
  receivedAt: Minutes;
  /** Repeat notifications for this continuing condition, grouped here. */
  notifications: Minutes[];
}

export interface MonitorSample {
  observedAt: Minutes;
  receivedAt: Minutes;
  value: string;
}

export interface Monitor {
  id: string; // MON-x
  kind: 'monitor';
  name: string;
  sourceId: string;
  assetId: string;
  unit?: string;
  samples: MonitorSample[]; // oldest first
  /** What this reading alone does not establish, where it could mislead. */
  limits?: string;
  alert?: Alert;
}

// --- Agent tasks ----------------------------------------------------------------------------

export type TaskStatus = 'running' | 'completed' | 'waiting' | 'blocked' | 'not-started';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  running: 'In progress',
  completed: 'Completed',
  waiting: 'Waiting for a source',
  blocked: 'Blocked',
  'not-started': 'Not started',
};

export interface AgentTask {
  id: string; // T-x
  title: string;
  purpose: string;
  status: TaskStatus;
  startedAt?: Minutes;
  updatedAt?: Minutes;
  outcome?: string;
  blocker?: string;
  /** What the user loses because of a failure. */
  consequence?: string;
  sources: string[];
}

// --- Source viewer --------------------------------------------------------------------------

export type SourceLocation =
  | { type: 'text'; page: number; quote: string; occurrence?: number } // searched in the page's real text
  | { type: 'region'; page: number; regions: { tag: string; box: [number, number, number, number] }[] } // normalised x, y, w, h
  | { type: 'page'; page: number; reason: string }; // only the page is known
