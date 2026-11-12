import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DASHBOARD, EMERGENCY_META, EQUIPMENT, STEPS, STEP_COUNT, USER, WATCHERS } from './data/scenario';
import type { ConditionState, DecisionStatus, EvidenceRef, ExecutionStatus, Region, Severity } from './data/types';
import { idb, StorageError, storageSim } from './lib/idb';
import { CAPABILITIES, DEFAULT_AGENT_CONFIG, configLabel, currentRun, describeConfig, isOpen } from './lib/agent';
import { urgentWording } from './investigate/urgency';
import { analyse, objectUrlFor, type DeclaredStatus, type UploadedDoc } from './lib/ingest';
import { retrieval, type ContentType, type Passage } from './lib/retrieval';
import { SEED_INCIDENTS } from './record/seeds';
import { generateSitrep } from './record/timeline';
import { clock, clockSkew, now, setClockSkew } from './lib/time';
import { OBSERVATION_SOURCE } from './record/types';
import type { AgentConfig, AgentEvent, AgentRun, IncidentRecord, Intake, ProposalFeedback, Investigation, InvestigationResponse, ObservationSource, RecordEvent, ReportVersion, SimSnapshot, SitrepSectionKey, SitrepSections } from './record/types';

/** What the Overview's Quick detail panel shows: a status card, an attention item, a milestone, the executive brief or the open-items list. */
export type QuickRef = { kind: 'card'; id: string } | { kind: 'item'; id: string } | { kind: 'ms'; id: string } | { kind: 'exec' } | { kind: 'queue' } | { kind: 'severity' } | { kind: 'record' };
export type Nav = 'overview' | 'situation' | 'sitrep' | 'agentlog' | 'knowledge';
export type WindowId = 'equipment' | 'log' | 'response' | 'document';
export type ResponseTab = 'response' | 'observations' | 'sources';
export type Role = 'user' | 'admin';

/** Situation Room. An issue groups updates that share one response; closing and reopening keep their history. */
export interface IssueEntry { kind: 'closed' | 'reopened'; t: number; by: string; note: string; title: string }
export interface IssueUserState { lastSeen?: number; closed?: { t: number; by: string; note: string } | null; history: IssueEntry[] }
/** A person's placement of an update: into an issue, or as information only. Overrides ECC's placement. */
export interface Placement { to: string; by: string; at: number; label: string; toTitle: string }
/** An issue a person opened from an update. */
export interface UserIssue { id: string; title: string; t: number; by: string; from: string; equipmentId?: string }
export interface Room { issue: string | null; update: string | null; focus: string | null; /** Worklist view: Open issues or Incident Updates. */ view: 'issues' | 'updates'; /** Equipment watch showing every reading. */ watch?: boolean; /** Incident Updates narrowed to one issue's updates. */ feedIssue?: string | null; /** Incident Updates narrowed to one piece of equipment (from its bell or count). */ feedEquipment?: string | null; /** Worklist layout: tabs (default) or split, Open issues beside Incident Updates. */ layout?: 'tabs' | 'split'; /** Split view: the Open issues share of the width. */ splitFrac?: number; /** Split view: the issue selected in the list (highlighted, not opened). */ pick?: string | null; /** Split view: the updates pane shows this issue only, or all updates. */ feedMode?: 'issue' | 'all'; /** Equipment watch height as a share of the workspace, set by its divider; empty for the compact strip. */ watchFrac?: number | null; list: 'open' | 'closed'; dock: 'side' | 'wide'; feed: 'all' | 'issue'; origin: 'all' | 'monitoring' | 'people' | 'agent'; sub: 'main' | 'evidence' | 'place' }
export const ROOM_DEFAULT: Room = { issue: null, update: null, focus: null, view: 'issues', watch: false, list: 'open', dock: 'side', feed: 'all', origin: 'all', sub: 'main' };

export interface Decision {
  status: Exclude<DecisionStatus, 'none'>;
  rationale: string;
  by: string;
  at: number;
  evidenceUsed: { docId: string; revision: string; page: number; label: string }[];
  recommendationSummary: string;
  /** For a different response: what will be done instead of the suggestion. */
  response?: string;
}
export interface FieldReport { id: string; at: number; by: string; text: string; status: ExecutionStatus }
/** Who the Incident Manager told about a decision, how, and when they expect to hear back. ECC records it; it sends nothing. */
export interface Contact { id: string; at: number; by: string; to: string; via: 'Radio' | 'Phone' | 'In person' | 'Message' | 'Other'; note?: string; /** Expect a field update by this time. */ expectBy?: number; /** A follow-up on an earlier contact. */ followUpOf?: string; /** The decision this contact passed on, if any. */ decision?: string }
export interface AlertUserState { readAt?: number; ackAt?: number; decision?: Decision; /** Earlier decisions on the same suggestion (a deferral later decided, for example). */ past?: Decision[]; reports: FieldReport[]; contacts?: Contact[] }
export interface WatcherOverride { onCard?: boolean; limit?: string | null; windowMin?: 15 | 60 }
export interface LogFilters { severity: 'all' | Severity; equipment: string[]; status: ConditionState[]; query: string }
export const EMPTY_FILTERS: LogFilters = { severity: 'all', equipment: [], status: [], query: '' };
export const ASSISTANT_MIN = 320, ASSISTANT_MAX = 640, ASSISTANT_DEFAULT = 400;
export interface AgentFilters { query: string; categories: string[]; outcomes: ('completed' | 'ongoing' | 'failed' | 'retried')[]; equipment: string[]; levels: string[] }
export const EMPTY_AGENT_FILTERS: AgentFilters = { query: '', categories: [], outcomes: [], equipment: [], levels: [] };

export interface ViewerTarget {
  docId: string; revision: string; page: number; label: string;
  quote?: string; region?: Region; locate: EvidenceRef['locate'];
  origin: string;
  /** Show in the docked Situation window (default) or only in the overlay. */
  dock?: boolean;
}

export interface Layout { monitoringSide: 'left' | 'right'; splitX: number; splitY: number; splitDoc: number; maximized: WindowId | null; focus: 'monitoring' | 'response' | null }

export interface AssistantMessage { id: string; role: 'user' | 'assistant'; t: number; text: string; result?: { ok: true; passages: Passage[]; indexed: number } | { ok: false; error: string }; scope?: string }

export type AssistantMode = 'ask' | 'report';
export interface AssistantContext { equipmentId?: string; alertId?: string }
export interface ObservationInput { text: string; equipmentId?: string; location?: string; observedAt?: number; sourceType: ObservationSource; sourceDetail?: string; question?: string; alertId?: string }
export interface StartInput { mode: 'real' | 'training'; site: string; title: string; notification: string; via: string; occurredAt?: number; equipment: string[]; location?: string; incidentType?: string; basedOn?: { id: string; title: string }; intake?: Intake }
export interface IncomingNotification { id: string; t: number; site: string; title: string; text: string; via: string; equipment: string[]; location?: string }
export type Dialog = { type: 'start'; mode: 'real' | 'training'; prefill?: Partial<StartInput> } | { type: 'resolve' } | { type: 'return-active' } | { type: 'close' } | { type: 'closed'; id: string } | { type: 'stop-agent' } | { type: 'reopen'; id: string } | { type: 'resume'; id: string };
export type Result = { ok: true } | { ok: false; error: string };
export interface SaveState { state: 'idle' | 'saving' | 'saved' | 'failed'; at?: number; error?: string }
export interface DefaultsChange { t: number; by: string; version: number; text: string }

export interface State {
  // scenario / incident
  /** Empty string: no incident is open in the workspace. */
  incidentId: string;
  /** Training runs the agreed scenario; a real incident has no scripted developments. */
  incidentMode: 'real' | 'training' | null;
  agentDefaults: AgentConfig;
  defaultsLog: DefaultsChange[];
  /** Session only. */
  dialog: Dialog | null;
  settingsOpen: boolean;
  settingsTab: 'application' | 'defaults' | 'incident';
  save: SaveState;
  simulateSaveFailure: boolean;
  pendingNotification: IncomingNotification | null;
  /** Unsent form text, kept when a dialog is dismissed. */
  drafts: Record<string, string>;
  /** Hidden panels by key; layout preference, separate from incident facts. */
  hiddenPanels: Record<string, boolean>;
  dismissedNotice: string | null;
  /** Persisted scenario-clock skew: Next adds to it when the demo is ahead of a step's nominal time. */
  skewMs: number;
  startedAt: number;
  revealedAt: number[];
  autoplay: boolean;
  dashboard: string[];
  watcherOverrides: Record<string, WatcherOverride>;
  alertUser: Record<string, AlertUserState>;
  issueUser: Record<string, IssueUserState>;
  placements: Record<string, Placement>;
  userIssues: UserIssue[];
  room: Room;
  selectedAlertId: string | null;
  /** A selected observation or question. Alert selection and this are mutually exclusive. */
  selectedInvestigationId: string | null;
  /** The observation or question a recommendation was opened from, so the user can go back. */
  concernOrigin: string | null;
  responseTab: ResponseTab;
  logFilters: LogFilters;
  /** Persisted divider sizes (px of the side pane) per layout id. */
  splits: Record<string, number>;
  /** Maximized pane per layout id (same behaviour as Situation's maximize/restore). */
  maximizedPanes: Record<string, 'a' | 'b'>;
  assistantWidth: number;
  /** Large trend view (session only). */
  trendView: { equipmentId: string; watcherId: string; windowMin: 15 | 60 | 0 } | null;
  viewer: ViewerTarget | null;
  viewerExpanded: boolean;
  layout: Layout;
  prevLayout: Layout | null;
  theme: 'light' | 'dark';
  nav: Nav;
  role: Role;
  persona: Persona;
  /** Session: where the overview was left, so returning restores it. */
  overview: { scroll: number; expanded: string[]; allAttention: boolean; fromOverview: boolean; chartSel: string | null; view: 'chart' | 'list' | null; watcher: string | null; layout?: 'brief' | 'story'; quick?: QuickRef | null };
  timelineFocus: string | null;
  /** Timeline workspace: the story of the response or the full record, optionally scoped to one issue; the story item to bring into view. */
  timelineMode: 'story' | 'full';
  timelineScope: string | null;
  storyFocus: string | null;
  flashEquipment: string | null;
  activityTask: string | null;
  agentView: 'business' | 'detailed';
  agentFilters: AgentFilters;
  agentGroup: 'chrono' | 'category';
  agentSub: 'task' | 'log';
  knowledgeView: 'search' | 'documents' | 'incidents';
  knowledgeDoc: string | null;
  knowledgeIncident: string | null;
  simulateRetrievalFailure: boolean;
  assistantOpen: boolean;
  assistantSites: string[];
  assistantTypes: ContentType[];
  assistantMessages: AssistantMessage[];
  assistantMode: AssistantMode;
  assistantContext: AssistantContext;
  /** The first upgrade to site-scoped questions sets the open incident's site once. */
  assistantScopeDefaulted: boolean;
  /** Session only: the investigation to bring into view, and the current step's label. */
  focusInvestigation: string | null;
  investigationProgress: { id: string; label: string } | null;
  // browser-local records (IndexedDB), not persisted by zustand
  records: Record<string, IncidentRecord>;
  uploads: UploadedDoc[];
  storageReady: boolean;
  storageError: string | null;
  toast: string | null;
  indexReady: boolean;
  setIndexReady: (v: boolean) => void;

  advance: () => void;
  stepBack: () => void;
  clearAllLocalData: () => Promise<void>;
  setAutoplay: (v: boolean) => void;
  addEquipment: (id: string) => void;
  /** Confirm or dismiss equipment ECC suggested at intake. Confirmed equipment joins Equipment watch; both are recorded. */
  resolveSuggestedEquipment: (id: string, add: boolean) => Promise<Result>;
  removeEquipment: (id: string) => void;
  setWatcher: (id: string, o: WatcherOverride) => void;
  selectAlert: (id: string | null) => void;
  setRoom: (patch: Partial<Room>) => void;
  /** Open an issue in the Situation Room's response panel, optionally bringing one of its updates into focus. */
  openIssue: (id: string, o?: { focus?: string | null; from?: 'overview' }) => void;
  openUpdate: (updateId: string, o?: { from?: 'overview' }) => void;
  closeRoomPanel: () => void;
  /** An equipment bell or count: show that equipment's updates in Incident Updates. Opens nothing and selects nothing. */
  showEquipmentUpdates: (equipmentId: string) => void;
  markIssueSeen: (id: string, t: number) => void;
  /** Place an update in an issue, as information only, or in a new issue. Returns the issue id ('info' for information only). */
  placeUpdate: (updateId: string, to: string | { title: string; equipmentId?: string }, label: string, toTitle?: string) => string;
  closeIssue: (id: string, title: string, note: string) => void;
  reopenIssue: (id: string, title: string, note: string) => void;
  selectConcern: (invId: string | null, tab?: ResponseTab) => void;
  openRecommendation: (alertId: string, originInv?: string | null) => void;
  retryInvestigation: (invId: string) => Promise<void>;
  failInvestigation: (incidentId: string, invId: string, error: string) => Promise<void>;
  acknowledge: (id: string) => void;
  recordDecision: (id: string, d: Decision) => void;
  addReport: (id: string, r: FieldReport) => void;
  addContact: (id: string, c: Contact) => void;
  /** Save feedback on a recommendation, with the proposal it refers to. Kept for review; nothing changes automatically. */
  saveFeedback: (f: Omit<ProposalFeedback, 'id' | 't' | 'by'>) => Promise<Result>;
  setReportStatus: (alertId: string, reportId: string, status: ExecutionStatus) => void;
  setResponseTab: (t: ResponseTab) => void;
  setLogFilters: (patch: Partial<LogFilters>) => void;
  clearLogFilters: () => void;
  toggleEquipmentFilter: (id: string) => void;
  setSplit: (id: string, px: number) => void;
  setMaximizedPane: (id: string, pane: 'a' | 'b' | null) => void;
  setAssistantWidth: (px: number) => void;
  setTrendView: (v: State['trendView']) => void;
  openViewer: (t: ViewerTarget) => void;
  closeViewer: () => void;
  setViewerExpanded: (v: boolean) => void;
  setLayout: (patch: Partial<Layout>) => void;
  maximize: (w: WindowId | null) => void;
  swapSides: () => void;
  setTheme: (t: 'light' | 'dark') => void;
  setNav: (n: Nav) => void;
  setRole: (r: Role) => void;
  signInAs: (p: Persona) => void;
  setOverview: (patch: Partial<State['overview']>) => void;
  /** Open an alert from the overview. Its read, acknowledgement and decision state stay as recorded. */
  focusAlert: (alertId: string, tab: ResponseTab) => void;
  setTimelineFocus: (id: string | null) => void;
  setTimeline: (patch: Partial<Pick<State, 'timelineMode' | 'timelineScope' | 'storyFocus'>>) => void;
  /** View issue history: the Timeline's story, scoped to that issue. */
  openIssueHistory: (issueId: string) => void;
  setFlashEquipment: (id: string | null) => void;
  assessSeverity: (level: string, rationale: string) => Promise<Result>;
  setActivityTask: (id: string | null) => void;
  setAgentView: (v: 'business' | 'detailed') => void;
  setAgentFilters: (p: Partial<AgentFilters>) => void;
  clearAgentFilters: () => void;
  setAgentGroup: (g: 'chrono' | 'category') => void;
  setAgentSub: (s: 'task' | 'log') => void;
  setKnowledgeView: (v: State['knowledgeView'], id?: string | null) => void;
  setSimulateRetrievalFailure: (v: boolean) => void;
  setAssistantOpen: (v: boolean) => void;
  setAssistantScope: (sites: string[], types: ContentType[]) => void;
  pushAssistantMessage: (m: AssistantMessage) => void;
  clearAssistant: () => void;
  setAssistantMode: (m: AssistantMode) => void;
  setAssistantContext: (c: AssistantContext) => void;
  openAssistantFor: (o: { mode?: AssistantMode; context?: AssistantContext; focus?: string | null }) => void;
  setFocusInvestigation: (id: string | null) => void;
  setInvestigationProgress: (p: State['investigationProgress']) => void;
  submitQuestion: (text: string, scope: { sites: string[]; types: ContentType[] }) => Promise<Result>;
  submitObservation: (o: ObservationInput, scope: { sites: string[]; types: ContentType[] }) => Promise<Result>;
  amendObservation: (eventId: string, text: string) => Promise<Result>;
  answerClarification: (incidentId: string, invId: string, a: { equipmentId?: string; location?: string; text?: string }) => Promise<Result>;
  askClarification: (incidentId: string, invId: string, question: string, options: { label: string; equipmentId: string }[], needsBasis?: boolean) => Promise<void>;
  setInvestigationStatus: (incidentId: string, invId: string, status: Investigation['status']) => Promise<void>;
  completeInvestigation: (incidentId: string, invId: string, response: InvestigationResponse, task: AgentEvent, event: RecordEvent) => Promise<void>;
  setToast: (t: string | null) => void;
  setDialog: (d: Dialog | null) => void;
  setSettings: (open: boolean, tab?: State['settingsTab']) => void;
  setDraft: (k: string, v: string) => void;
  clearDrafts: (prefix: string) => void;
  hidePanel: (key: string) => void;
  showPanel: (key: string) => void;
  resetPanels: (keys: string[], splitIds: string[], situation: boolean) => void;
  setDismissedNotice: (id: string | null) => void;
  setSimulateSaveFailure: (v: boolean) => void;
  simulateNotification: () => void;
  dismissNotification: () => void;
  addNotificationToCurrent: () => Promise<Result>;
  // lifecycle
  startIncident: (input: StartInput, opts?: { setAside?: boolean }) => Promise<Result>;
  resolveIncident: (x: { t: number; summary: string; rationale: string; evidence: string[]; outstanding: string[]; followUp: string[] }) => Promise<Result>;
  returnToActive: (reason: string) => Promise<Result>;
  returnToWorkspace: () => void;
  reopenIncident: (id: string, reason: string, opts?: { setAside?: boolean }) => Promise<Result>;
  resumeIncident: (id: string, opts?: { setAside?: boolean }) => Promise<Result>;
  linkHistorical: (id: string) => Promise<Result>;
  addAddendum: (id: string, text: string) => Promise<void>;
  addObservation: (text: string) => Promise<void>;
  retrySave: () => Promise<void>;
  importRecords: (records: IncidentRecord[], docs: { doc: UploadedDoc; file: Blob; pages: string[] }[]) => Promise<Result>;
  // agent
  agentStart: (o?: { reason?: string; auto?: boolean }) => Promise<void>;
  agentPause: (reason?: string) => Promise<void>;
  agentResume: (received: string[]) => Promise<void>;
  agentStop: (reason: string, cancelled: string[]) => Promise<void>;
  agentFail: () => Promise<void>;
  setAgentDefaults: (patch: Partial<AgentConfig>) => void;
  setIncidentConfig: (patch: Partial<AgentConfig>) => Promise<void>;
  // records
  loadLocalData: () => Promise<void>;
  appendEvents: (incidentId: string, events: RecordEvent[]) => Promise<void>;
  ensureCurrentRecord: () => IncidentRecord | undefined;
  addCorrection: (incidentId: string, originalId: string, text: string) => Promise<void>;
  addLesson: (incidentId: string, text: string) => Promise<void>;
  closeIncident: (rationale: string, outstanding: string[], opts?: { snapshot?: boolean; generated?: SitrepSections }) => Promise<Result>;
  /** A draft from the record as of a time; the Timeline workspace passes the sections it built from the same facts. */
  createSitrepVersion: (asOf: number, generated?: SitrepSections) => Promise<void>;
  editSitrepSection: (versionId: string, key: SitrepSectionKey, text: string) => Promise<void>;
  refreshSitrepDraft: (versionId: string, asOf: number, generated?: SitrepSections) => Promise<void>;
  resolveSitrepPending: (versionId: string, key: SitrepSectionKey, take: 'mine' | 'new') => Promise<void>;
  submitSitrepReview: (versionId: string) => Promise<void>;
  approveSitrep: (versionId: string) => Promise<void>;
  ingest: (file: File, meta: { title: string; site: string; equipment: string[]; type: UploadedDoc['type']; number: string; revision: string; declaredStatus: DeclaredStatus; revisionOf?: string }) => Promise<UploadedDoc | null>;
  uploadUrl: (id: string) => Promise<string | null>;
  uploadPages: (id: string) => Promise<string[]>;
  referenceRevision: (docId: string, revision: string, note: string) => Promise<void>;
}

const DEFAULT_LAYOUT: Layout = { monitoringSide: 'left', splitX: 0.56, splitY: 0.55, splitDoc: 0.45, maximized: null, focus: null };
/** Prototype sign-in. Selecting a persona never transfers command; that stays a manual, recorded step. */
export const PERSONAS = {
  'shift-manager': { name: USER.name, role: USER.role, note: USER.note },
  'incident-manager': { name: 'S. Al-Qahtani', role: 'Incident Manager', note: 'Prototype persona. Command transfer is not recorded by signing in.' },
} as const;
export type Persona = keyof typeof PERSONAS;
/** The person recording an action now. */
export const userLabel = (): string => { const p = PERSONAS[(useStore.getState() as { persona?: Persona }).persona ?? 'shift-manager']; return `${p.name} · ${p.role}`; };
export const USER_LABEL = `${USER.name} · ${USER.role}`;
/** Incident severity scale. No customer scale is configured, so an illustrative one is used and labelled as such. */
export const SEVERITY_SCALE = { name: 'Illustrative tier scale (no customer scale configured)', levels: [{ id: 'tier-1', label: 'Tier 1', note: 'Handled with site resources' }, { id: 'tier-2', label: 'Tier 2', note: 'Needs support beyond the site' }, { id: 'tier-3', label: 'Tier 3', note: 'Needs corporate or external response' }] } as const;

const SIM_DEFAULTS = { autoplay: false, watcherOverrides: {}, alertUser: {}, issueUser: {} as Record<string, IssueUserState>, placements: {} as Record<string, Placement>, userIssues: [] as UserIssue[], room: ROOM_DEFAULT, selectedAlertId: null, selectedInvestigationId: null, concernOrigin: null, responseTab: 'response' as ResponseTab, logFilters: EMPTY_FILTERS, viewer: null, viewerExpanded: false, activityTask: null, trendView: null, dismissedNotice: null };
function noIncident() { return { ...SIM_DEFAULTS, incidentId: '', incidentMode: null as State['incidentMode'], startedAt: now(), skewMs: clockSkew(), revealedAt: [0], dashboard: [] as string[] }; }
function newIncidentId(t: number) { const d = new Date(t); return `INC-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`; }
function au(s: Pick<State, 'alertUser'>, id: string): AlertUserState { return s.alertUser[id] ?? { reports: [] }; }
function emptyRecord(id: string, startedAt: number): IncidentRecord {
  return { schema: 'ecc-incident/1', id, title: EMERGENCY_META.title, site: EMERGENCY_META.facility, mode: EMERGENCY_META.mode, provenance: 'live', startedAt, occurredAt: startedAt, createdAt: startedAt, status: 'active', reportedBy: EMERGENCY_META.reportedBy, equipment: [...DEFAULT_DASHBOARD], events: [], reportVersions: [], lessons: [], references: [], updatedAt: startedAt };
}

export const useStore = create<State>()(persist((set, get) => {
  const errText = (e: unknown) => (e instanceof StorageError ? e.message : String(e));
  // Ordinary incremental saves: the working record stays in memory whatever happens, so a failure loses nothing.
  const persistRecord = async (r: IncidentRecord) => {
    set((s) => ({ records: { ...s.records, [r.id]: r }, save: { ...s.save, state: 'saving' } }));
    try { await idb.put('incidents', r.id, r); set({ storageError: null, save: { state: 'saved', at: now() } }); }
    catch (e) { const msg = errText(e); set((s) => ({ storageError: msg, toast: s.save.state === 'failed' ? s.toast : `Not saved locally: ${msg}`, save: { state: 'failed', error: msg, at: s.save.at } })); }
  };
  // Lifecycle changes: nothing changes in the application until the write has succeeded.
  const commit = async (r: IncidentRecord, extra: Partial<State> = {}): Promise<Result> => {
    set((s) => ({ save: { ...s.save, state: 'saving' } }));
    const rec = { ...r, updatedAt: now() };
    try { await idb.put('incidents', rec.id, rec); }
    catch (e) { const msg = errText(e); set((s) => ({ storageError: msg, save: { state: 'failed', error: msg, at: s.save.at } })); return { ok: false, error: msg }; }
    set((s) => ({ records: { ...s.records, [rec.id]: rec }, storageError: null, save: { state: 'saved', at: now() }, ...extra }));
    return { ok: true };
  };
  // Saved before anyone is told it was recorded. Readings keep arriving during the write, so a change made meanwhile is merged rather than lost.
  const commitChange = async (id: string, fn: (r: IncidentRecord) => IncidentRecord): Promise<Result> => {
    const base = get().records[id];
    if (!base) return { ok: false, error: 'Incident record not found' };
    set((s) => ({ save: { ...s.save, state: 'saving' } }));
    const rec = { ...fn(base), updatedAt: now() };
    try { await idb.put('incidents', id, rec); }
    catch (e) { const msg = errText(e); set((s) => ({ storageError: msg, save: { state: 'failed', error: msg, at: s.save.at } })); return { ok: false, error: msg }; }
    const cur = get().records[id];
    const merged = cur === base ? rec : { ...fn(cur), updatedAt: now() };
    set((s) => ({ records: { ...s.records, [id]: merged }, storageError: null, save: { state: 'saved', at: now() } }));
    if (merged !== rec) void idb.put('incidents', id, merged).catch(() => undefined);
    return { ok: true };
  };
  const invNumber = (r: IncidentRecord) => (r.investigations?.length ?? 0) + 1;
  const contextOf = (r: IncidentRecord, c: AssistantContext, extra: Partial<Investigation['context']> = {}): Investigation['context'] => ({ incidentId: r.id, ...(c.equipmentId ? { equipmentId: c.equipmentId } : {}), ...(c.alertId ? { alertId: c.alertId, alertTitle: r.events.find((e) => e.id === `alert-${c.alertId}`)?.title } : {}), ...extra });
  const patchInv = (r: IncidentRecord, invId: string, fn: (i: Investigation) => Investigation): IncidentRecord => ({ ...r, investigations: (r.investigations ?? []).map((i) => (i.id === invId ? fn(i) : i)) });
  const simOf = (): SimSnapshot => { const s = get(); return { startedAt: s.startedAt, revealedAt: s.revealedAt, dashboard: s.dashboard, watcherOverrides: s.watcherOverrides as Record<string, unknown>, alertUser: s.alertUser as Record<string, unknown>, issueUser: s.issueUser as Record<string, unknown>, placements: s.placements as Record<string, unknown>, userIssues: s.userIssues }; };
  const simState = (r: IncidentRecord): Partial<State> => ({ ...SIM_DEFAULTS, assistantSites: [r.site], assistantContext: {}, incidentId: r.id, incidentMode: r.sim ? r.mode : 'real', startedAt: r.sim?.startedAt ?? r.startedAt, revealedAt: r.sim?.revealedAt ?? [0], dashboard: r.sim?.dashboard ?? r.equipment, watcherOverrides: (r.sim?.watcherOverrides ?? {}) as Record<string, WatcherOverride>, alertUser: (r.sim?.alertUser ?? {}) as Record<string, AlertUserState>, issueUser: (r.sim?.issueUser ?? {}) as Record<string, IssueUserState>, placements: (r.sim?.placements ?? {}) as Record<string, Placement>, userIssues: (r.sim?.userIssues ?? []) as UserIssue[], skewMs: clockSkew() });
  const endRun = (r: IncidentRecord, status: AgentRun['status'], reason: string, by: string): IncidentRecord => {
    const run = currentRun(r);
    if (!run || run.endedAt != null) return r;
    const t = now();
    const ended: AgentRun = { ...run, status, endedAt: t, endedBy: by, endReason: reason, pauses: run.pauses.map((p) => (p.to == null ? { ...p, to: t } : p)) };
    return { ...r, agentRuns: [...(r.agentRuns ?? []).slice(0, -1), ended] };
  };
  // An open incident that is not current keeps its record; its agent work stops and its simulation state is saved with it.
  const setAsideCurrent = async (): Promise<Result> => {
    const cur = get().records[get().incidentId];
    if (!cur || !isOpen(cur)) return { ok: true };
    const by = userLabel();
    let r = endRun(cur, 'stopped', 'Incident set aside', by);
    if (r !== cur) r = { ...r, events: [...r.events, sysEvent('agent-control', `Agent stopped · run ${currentRun(cur)?.number}`, { detail: 'Incident set aside; prior work retained.' })] };
    return commit({ ...r, status: 'left-open', sim: simOf(), events: [...r.events, sysEvent('lifecycle', 'Incident set aside; record kept and can be resumed', {})] });
  };
  const mutate = async (incidentId: string, fn: (r: IncidentRecord) => IncidentRecord) => {
    const r = get().records[incidentId] ?? (incidentId && incidentId === get().incidentId ? get().ensureCurrentRecord() : null);
    if (!r) return;
    await persistRecord({ ...fn(r), updatedAt: now() });
  };
  const sysEvent = (kind: RecordEvent['kind'], title: string, extra: Partial<RecordEvent> = {}): RecordEvent => ({ id: `${kind}-${now()}-${Math.random().toString(36).slice(2, 6)}`, t: now(), recordedAt: now(), kind, title, source: 'user', by: userLabel(), ...extra } as RecordEvent);

  return {
    ...noIncident(),
    agentDefaults: DEFAULT_AGENT_CONFIG, defaultsLog: [], dialog: null, settingsOpen: false, settingsTab: 'application', save: { state: 'idle' }, simulateSaveFailure: false, pendingNotification: null, drafts: {}, hiddenPanels: {},
    responseTab: 'response', layout: DEFAULT_LAYOUT, prevLayout: null, theme: 'light', nav: 'situation', role: 'user', persona: 'shift-manager', overview: { scroll: 0, expanded: [], allAttention: false, fromOverview: false, chartSel: null, view: null, watcher: null, layout: 'brief', quick: null }, timelineFocus: null, timelineMode: 'story', timelineScope: null, storyFocus: null, flashEquipment: null, splits: {}, maximizedPanes: {}, assistantWidth: ASSISTANT_DEFAULT,
    agentView: 'detailed', agentFilters: EMPTY_AGENT_FILTERS, agentGroup: 'chrono', agentSub: 'task', trendView: null,
    knowledgeView: 'search', knowledgeDoc: null, knowledgeIncident: null, simulateRetrievalFailure: false,
    assistantOpen: false, assistantSites: [], assistantTypes: [], assistantMessages: [], assistantMode: 'ask', assistantContext: {}, assistantScopeDefaulted: true, focusInvestigation: null, investigationProgress: null,
    records: {}, uploads: [], storageReady: false, storageError: null, toast: null, indexReady: false,
    setIndexReady: (v) => set({ indexReady: v }),

    advance: () => {
      const { revealedAt, startedAt, skewMs } = get();
      const k = revealedAt.length;
      if (k >= STEP_COUNT) { set({ autoplay: false }); return; }
      // If the demo is ahead of the step's nominal time, move the scenario clock forward
      // (1 s margin so the displayed minute never lags the step). Nothing is re-stamped:
      // every timestamp, scenario or human, comes from the same monotonic clock.
      const nominal = STEPS[k].nominalOffsetMin * 60_000;
      let skew = skewMs;
      let elapsed = now() - startedAt;
      if (elapsed < nominal) { skew += nominal - elapsed + 1000; setClockSkew(skew); elapsed = now() - startedAt; }
      const dash = get().dashboard;
      const add = (STEPS[k].addEquipment ?? []).filter((id) => !dash.includes(id));
      set({ skewMs: skew, revealedAt: [...revealedAt, elapsed], dashboard: add.length ? [...dash, ...add] : dash });
    },
    stepBack: () => {
      const { revealedAt, selectedAlertId } = get();
      if (revealedAt.length <= 1) return;
      const remaining = revealedAt.length - 1;
      const stillRevealed = selectedAlertId ? STEPS.slice(0, remaining).some((st) => st.alerts.some((a) => a.id === selectedAlertId)) : false;
      set({ revealedAt: revealedAt.slice(0, -1), autoplay: false, viewer: null, viewerExpanded: false, selectedAlertId: stillRevealed ? selectedAlertId : null });
    },
    clearAllLocalData: async () => {
      try { await idb.clearAll(); } catch { /* ignore */ }
      localStorage.removeItem('ecc-v3');
      window.location.reload();
    },
    setAutoplay: (v) => set({ autoplay: v }),
    addEquipment: (id) => set((s) => (s.dashboard.includes(id) ? {} : { dashboard: [...s.dashboard, id] })),
    resolveSuggestedEquipment: async (eqId, add) => {
      const id = get().incidentId; const r = get().records[id];
      if (!r?.intake?.suggested) return { ok: false, error: 'No suggestion' };
      const by = userLabel(); const at = now();
      const name = EQUIPMENT.find((x) => x.id === eqId)?.name ?? eqId;
      const res = await commitChange(id, (x) => ({ ...x, equipment: add ? [...new Set([...x.equipment, eqId])] : x.equipment, intake: { ...x.intake, suggested: x.intake!.suggested!.map((s) => (s.id === eqId ? { ...s, status: add ? 'added' : 'dismissed', by, at } : s)) }, events: [...x.events, sysEvent('equipment', add ? `${eqId} ${name} added to Equipment watch (suggested by ECC, confirmed)` : `${eqId} ${name} not added (suggested by ECC, judged not relevant)`, { equipmentId: eqId, by, source: 'user' })] }));
      if (res.ok && add) get().addEquipment(eqId);
      return res;
    },
    removeEquipment: (id) => set((s) => ({ dashboard: s.dashboard.filter((x) => x !== id) })),
    setWatcher: (id, o) => set((s) => ({ watcherOverrides: { ...s.watcherOverrides, [id]: { ...s.watcherOverrides[id], ...o } } })),
    selectConcern: (invId, tab) => set((s) => ({ room: invId ? { ...s.room, issue: null, update: `inv-${invId}`, focus: `inv-${invId}`, sub: 'main' } : s.room, selectedInvestigationId: invId, selectedAlertId: null, concernOrigin: null, responseTab: tab ?? s.responseTab })),
    openRecommendation: (alertId, originInv) => set((s) => ({ nav: 'situation', room: { ...s.room, issue: null, update: alertId, focus: alertId, sub: 'main' }, selectedAlertId: alertId, selectedInvestigationId: null, concernOrigin: originInv ?? null, responseTab: 'response', alertUser: { ...s.alertUser, [alertId]: { ...au(s, alertId), readAt: s.alertUser[alertId]?.readAt ?? now() } } })),
    selectAlert: (id) => set((s) => ({ room: id ? { ...s.room, issue: null, update: id, focus: id, sub: 'main' } : s.room, selectedAlertId: id, selectedInvestigationId: null, concernOrigin: null, alertUser: id ? { ...s.alertUser, [id]: { ...au(s, id), readAt: s.alertUser[id]?.readAt ?? now() } } : s.alertUser })),
    acknowledge: (id) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), ackAt: now() } } })),
    recordDecision: (id, d) => set((s) => { const cur = au(s, id); return { alertUser: { ...s.alertUser, [id]: { ...cur, past: cur.decision ? [...(cur.past ?? []), cur.decision] : cur.past, decision: d } } }; }),
    addReport: (id, r) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), reports: [...au(s, id).reports, r] } } })),
    saveFeedback: async (f) => {
      const id = get().incidentId; const t = now(); const by = userLabel();
      const fb: ProposalFeedback = { ...f, id: `fb-${t}`, t, by };
      return commitChange(id, (r) => ({ ...r, feedback: [...(r.feedback ?? []), fb], events: [...r.events, sysEvent('feedback', `Feedback on ECC's recommendation: “${f.comment}”`, { id: `feedback-${fb.id}`, t, detail: [`Recommendation (${f.proposal.version}): ${f.proposal.summary}`, f.reason ? `Reason: ${f.reason}` : '', f.evidence.length ? `Evidence cited: ${f.evidence.map((e) => `${e.label} Rev ${e.revision} p.${e.page}`).join('; ')}` : '', 'Kept for review by the ECC team; it does not change ECC automatically.'].filter(Boolean).join(' · '), by, source: 'user', alertId: f.proposal.alertId, meta: { issueId: f.issueId, reason: f.reason ?? null } })] }));
    },
    addContact: (id, c) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), contacts: [...(au(s, id).contacts ?? []), c] } } })),
    setReportStatus: (alertId, reportId, status) => set((s) => ({ alertUser: { ...s.alertUser, [alertId]: { ...au(s, alertId), reports: au(s, alertId).reports.map((r) => (r.id === reportId ? { ...r, status } : r)) } } })),
    // The Situation Room shows sources as the panel's Evidence view.
    setResponseTab: (t) => set((s) => ({ responseTab: t, room: { ...s.room, sub: t === 'sources' ? 'evidence' : 'main' } })),
    setLogFilters: (p) => set((s) => ({ logFilters: { ...s.logFilters, ...p } })),
    clearLogFilters: () => set({ logFilters: EMPTY_FILTERS }),
    toggleEquipmentFilter: (id) => set((s) => ({ logFilters: { ...s.logFilters, equipment: s.logFilters.equipment.includes(id) ? s.logFilters.equipment.filter((x) => x !== id) : [...s.logFilters.equipment, id] } })),
    setSplit: (id, px) => set((s) => ({ splits: { ...s.splits, [id]: Math.round(px) } })),
    setTrendView: (v) => set({ trendView: v }),
    setMaximizedPane: (id, pane) => set((s) => { const m = { ...s.maximizedPanes }; if (pane) m[id] = pane; else delete m[id]; return { maximizedPanes: m }; }),
    setAssistantWidth: (px) => set({ assistantWidth: Math.round(Math.min(ASSISTANT_MAX, Math.max(ASSISTANT_MIN, px))) }),
    // In the Situation Room a document always opens in the viewer dialog, over the issue it came from; elsewhere it docks unless asked not to.
    openViewer: (t) => set((s) => { const h = { ...s.hiddenPanels }; delete h['situation.document']; const dialog = s.nav === 'situation' || t.dock === false; return { viewer: { ...t, dock: !dialog }, viewerExpanded: dialog ? true : s.viewerExpanded, hiddenPanels: h }; }),
    closeViewer: () => set((s) => { const h = { ...s.hiddenPanels }; delete h['situation.document']; return { viewer: null, viewerExpanded: false, hiddenPanels: h }; }),
    setViewerExpanded: (v) => set((s) => ({ viewerExpanded: v, viewer: !v && s.viewer && s.viewer.dock === false ? null : s.viewer })),
    setLayout: (patch) => set((s) => ({ layout: { ...s.layout, ...patch } })),
    maximize: (w) => set((s) => {
      if (w) return { prevLayout: s.layout.maximized ? s.prevLayout : s.layout, layout: { ...s.layout, maximized: w } };
      return { layout: { ...(s.prevLayout ?? s.layout), maximized: null }, prevLayout: null };
    }),
    swapSides: () => set((s) => ({ layout: { ...s.layout, monitoringSide: s.layout.monitoringSide === 'left' ? 'right' : 'left' } })),
    setTheme: (t) => set({ theme: t }),
    // Arriving in the Situation Room from another tab opens it with the response drawer closed; an explicit issue link opens the drawer itself.
    setNav: (n) => set((s) => (n === 'situation' && s.nav !== 'situation' ? { nav: n, room: { ...s.room, issue: null, update: null, focus: null, sub: 'main' } } : { nav: n })),
    setRole: (r) => set({ role: r }),
    signInAs: (p) => set((s) => ({ persona: p, nav: p === 'incident-manager' ? 'overview' : s.nav, overview: { ...s.overview, fromOverview: false, ...(p === 'incident-manager' ? { quick: null } : {}) } })),
    setOverview: (patch) => set((s) => ({ overview: { ...s.overview, ...patch } })),
    setRoom: (patch) => set((s) => ({ room: { ...s.room, ...patch } })),
    openIssue: (id, o = {}) => set((s) => ({ nav: 'situation', room: { ...s.room, issue: id, update: null, focus: o.focus ?? null, sub: 'main', view: s.room.view, list: s.issueUser[id]?.closed ? 'closed' : s.room.list }, overview: o.from === 'overview' ? { ...s.overview, fromOverview: true } : s.overview })),
    openUpdate: (updateId, o = {}) => set((s) => ({ nav: 'situation', room: { ...s.room, issue: null, update: updateId, focus: updateId, sub: 'main' }, overview: o.from === 'overview' ? { ...s.overview, fromOverview: true } : s.overview })),
    closeRoomPanel: () => set((s) => ({ room: { ...s.room, issue: null, update: null, focus: null, sub: 'main' } })),
    showEquipmentUpdates: (equipmentId) => set((s) => ({ nav: 'situation', selectedAlertId: null, room: { ...s.room, issue: null, update: null, focus: null, sub: 'main', view: 'updates', feedEquipment: equipmentId, feedIssue: null, origin: 'all' } })),
    markIssueSeen: (id, t) => set((s) => (s.issueUser[id]?.lastSeen != null && s.issueUser[id]!.lastSeen! >= t ? {} : { issueUser: { ...s.issueUser, [id]: { ...(s.issueUser[id] ?? { history: [] }), lastSeen: t } } })),
    placeUpdate: (updateId, to, label, toTitle) => {
      const by = userLabel(); const at = now();
      let id: string; let title = toTitle ?? '';
      if (typeof to === 'string') id = to;
      else { id = `u-${get().userIssues.length + 1}`; title = to.title; set((s) => ({ userIssues: [...s.userIssues, { id, title: to.title, t: at, by, from: updateId, equipmentId: to.equipmentId }] })); }
      set((s) => ({ placements: { ...s.placements, [updateId]: { to: id, by, at, label, toTitle: id === 'info' ? 'Information only' : title } } }));
      return id;
    },
    closeIssue: (id, title, note) => set((s) => { const t = now(); const by = userLabel(); const u = s.issueUser[id] ?? { history: [] }; return { issueUser: { ...s.issueUser, [id]: { ...u, lastSeen: t, closed: { t, by, note }, history: [...u.history, { kind: 'closed', t, by, note, title }] } } }; }),
    reopenIssue: (id, title, note) => set((s) => { const t = now(); const by = userLabel(); const u = s.issueUser[id] ?? { history: [] }; return { issueUser: { ...s.issueUser, [id]: { ...u, lastSeen: t, closed: null, history: [...u.history, { kind: 'reopened', t, by, note, title }] } }, room: { ...s.room, list: 'open' } }; }),
    focusAlert: (alertId, tab) => set((s) => { const h = { ...s.hiddenPanels }; delete h['situation.response']; return { nav: 'situation', room: { ...s.room, issue: null, update: alertId, focus: alertId, sub: 'main' }, selectedAlertId: alertId, selectedInvestigationId: null, concernOrigin: null, responseTab: tab, hiddenPanels: h, layout: s.layout.maximized && s.layout.maximized !== 'response' ? { ...(s.prevLayout ?? s.layout), maximized: null } : s.layout }; }),
    // A request to show a particular record entry opens the full record at it.
    // Links into the Timeline land on the moment that holds the entry, with its history open.
    setTimelineFocus: (id) => set(id === null ? { timelineFocus: null } : { timelineFocus: id, storyFocus: id, timelineScope: null }),
    setTimeline: (patch) => set((s) => ({ ...s, ...patch })),
    openIssueHistory: (issueId) => set({ nav: 'sitrep', timelineMode: 'story', timelineScope: issueId, storyFocus: null }),
    setFlashEquipment: (id) => set({ flashEquipment: id }),
    assessSeverity: async (level, rationale) => {
      const id = get().incidentId; const lv = SEVERITY_SCALE.levels.find((x) => x.id === level);
      if (!lv || !rationale.trim()) return { ok: false, error: 'Choose a level and give a reason.' };
      const sev = { level, label: lv.label, scale: SEVERITY_SCALE.name, by: userLabel(), t: now(), rationale: rationale.trim() };
      return commitChange(id, (r) => ({ ...r, severity: sev, severityHistory: [...(r.severityHistory ?? []), ...(r.severity ? [r.severity] : [])], events: [...r.events, sysEvent('severity', `Incident severity assessed: ${lv.label}`, { detail: `${rationale.trim()} · ${SEVERITY_SCALE.name}${r.severity ? ` · previously ${r.severity.label} (${r.severity.by})` : ''}` })] }));
    },
    setActivityTask: (id) => set({ activityTask: id }),
    setAgentView: (v) => set({ agentView: v }),
    setAgentFilters: (p) => set((s) => ({ agentFilters: { ...s.agentFilters, ...p } })),
    clearAgentFilters: () => set({ agentFilters: EMPTY_AGENT_FILTERS }),
    setAgentGroup: (g) => set({ agentGroup: g }),
    setAgentSub: (v) => set({ agentSub: v }),
    setKnowledgeView: (v, id) => set((s) => ({ knowledgeView: v, knowledgeIncident: v === 'incidents' ? (id === undefined ? s.knowledgeIncident : id) : s.knowledgeIncident, knowledgeDoc: v === 'documents' ? (id === undefined ? s.knowledgeDoc : id) : s.knowledgeDoc })),
    setSimulateRetrievalFailure: (v) => { retrieval.simulateFailure = v; set({ simulateRetrievalFailure: v }); },
    setAssistantOpen: (v) => set({ assistantOpen: v }),
    setAssistantScope: (sites, types) => set({ assistantSites: sites, assistantTypes: types }),
    pushAssistantMessage: (m) => set((s) => ({ assistantMessages: [...s.assistantMessages, m].slice(-60) })),
    clearAssistant: () => set({ assistantMessages: [] }),
    setAssistantMode: (m) => set({ assistantMode: m }),
    setAssistantContext: (c) => set({ assistantContext: c }),
    openAssistantFor: (o) => set((s) => ({ assistantOpen: true, assistantMode: o.mode ?? s.assistantMode, assistantContext: o.context ?? s.assistantContext, focusInvestigation: o.focus ?? null })),
    setFocusInvestigation: (id) => set({ focusInvestigation: id }),
    setInvestigationProgress: (p) => set({ investigationProgress: p }),
    submitQuestion: async (text, scope) => {
      const id = get().incidentId; const r = get().records[id];
      if (!r || !isOpen(r)) return { ok: false, error: 'No open incident' };
      const t = now();
      const inv: Investigation = { id: `inv-${t}`, number: invNumber(r), kind: 'question', t, by: userLabel(), text, context: contextOf(r, get().assistantContext), scope, status: 'queued', responses: [] };
      const ev = sysEvent('investigation', `Question: "${text}"`, { id: `inv-q-${inv.id}`, equipmentId: inv.context.equipmentId, detail: `Asked within ${scope.sites.length ? scope.sites.join(', ') : 'all sites'}${inv.context.alertTitle ? ` · about alert: ${inv.context.alertTitle}` : ''}. A question is not a decision.`, meta: { investigationId: inv.id } });
      return commitChange(id, (x) => ({ ...x, investigations: [...(x.investigations ?? []), { ...inv, number: invNumber(x) }], events: [...x.events, ev] }));
    },
    submitObservation: async (o, scope) => {
      const id = get().incidentId; const r = get().records[id];
      if (!r || !isOpen(r)) return { ok: false, error: 'No open incident' };
      const t = now(); const label = OBSERVATION_SOURCE[o.sourceType];
      const observedAt = Math.min(o.observedAt ?? t, t);
      const invId = `inv-${t}`; const evId = `obs-user-${t}`;
      const detail = ['Reported', `${label}${o.sourceDetail ? `: ${o.sourceDetail}` : ''}`, `Observed ${clock(observedAt)}`, `Received ${clock(t)}`, o.location ? `Location ${o.location}` : ''].filter(Boolean).join(' · ');
      const ev = sysEvent('observation', o.text, { id: evId, t, recordedAt: t, equipmentId: o.equipmentId, detail, source: o.sourceType === 'personal' ? 'user' : 'field', meta: { userSubmitted: true, evidence: 'reported', sourceType: o.sourceType, sourceLabel: label, sourceDetail: o.sourceDetail ?? null, observedAt, receivedAt: t, location: o.location ?? null, question: o.question ?? null, investigationId: invId } });
      const inv: Investigation = { id: invId, number: invNumber(r), kind: 'observation', t, by: userLabel(), urgentWording: urgentWording(o.text) || undefined, text: o.text, observationEventId: evId, context: contextOf(r, { equipmentId: o.equipmentId, alertId: o.alertId }, o.location ? { location: o.location } : {}), scope, status: 'queued', responses: [] };
      return commitChange(id, (x) => ({ ...x, investigations: [...(x.investigations ?? []), { ...inv, number: invNumber(x) }], events: [...x.events, ev] }));
    },
    amendObservation: async (eventId, text) => {
      const id = get().incidentId;
      const orig = get().records[id]?.events.find((e) => e.id === eventId);
      if (!orig) return { ok: false, error: 'Observation not found' };
      const ev = sysEvent('correction', text, { corrects: eventId, equipmentId: orig.equipmentId, detail: `Amendment of: "${orig.title}". The original wording is retained.` });
      return commitChange(id, (x) => ({ ...x, events: [...x.events, ev] }));
    },
    answerClarification: async (incidentId, invId, a) => {
      const t = now();
      const summary = [a.equipmentId, a.location, a.text].filter(Boolean).join(' · ');
      const ev = sysEvent('investigation', `Clarification answered: ${summary}`, { id: `inv-c-${invId}-${t}`, equipmentId: a.equipmentId, detail: 'Added to the same report. The original wording is unchanged.', meta: { investigationId: invId } });
      return commitChange(incidentId, (r) => ({ ...patchInv(r, invId, (i) => ({ ...i, status: 'queued', failure: undefined, context: { ...i.context, ...(a.equipmentId ? { equipmentId: a.equipmentId } : {}), ...(a.location ? { location: a.location } : {}) }, clarification: i.clarification ? { ...i.clarification, answer: a.equipmentId, answerLocation: a.location, answerText: a.text, answeredAt: t, answeredBy: userLabel() } : undefined })), events: [...r.events, ev] }));
    },
    askClarification: async (incidentId, invId, question, options, needsBasis) => {
      const t = now();
      await mutate(incidentId, (r) => ({ ...patchInv(r, invId, (i) => ({ ...i, status: 'needs-clarification', clarification: { question, options, needsBasis, askedAt: t } })), events: [...r.events, sysEvent('investigation', `Clarification requested: ${question}`, { id: `inv-cq-${invId}-${t}`, source: 'agent', by: undefined, detail: 'Simulated investigation. Analysis continues once this is answered.', meta: { investigationId: invId } })] }));
    },
    retryInvestigation: async (invId) => {
      await mutate(get().incidentId, (r) => patchInv(r, invId, (i) => ({ ...i, status: 'queued', failure: undefined })));
    },
    failInvestigation: async (incidentId, invId, error) => {
      if (get().records[incidentId]?.status === 'closed') return;
      await mutate(incidentId, (r) => ({ ...patchInv(r, invId, (i) => ({ ...i, status: 'failed', failure: error })), events: [...r.events, sysEvent('investigation', `Analysis failed: ${error}`, { id: `inv-f-${invId}-${now()}`, source: 'system', by: undefined, detail: 'The entry is kept and analysis can be retried.', meta: { investigationId: invId } })] }));
    },
    setInvestigationStatus: async (incidentId, invId, status) => {
      await mutate(incidentId, (r) => patchInv(r, invId, (i) => ({ ...i, status })));
    },
    completeInvestigation: async (incidentId, invId, response, task, event) => {
      if (get().records[incidentId]?.status === 'closed') return; // A closed record stays read-only; the entry stays unanalysed.
      await mutate(incidentId, (r) => ({ ...patchInv(r, invId, (i) => ({ ...i, status: response.state === 'error' ? 'failed' : 'complete', failure: response.state === 'error' ? response.retrievalError : undefined, responses: [...i.responses, response] })), events: [...r.events, task, event] }));
    },
    setToast: (t) => set({ toast: t }),
    setDialog: (d) => set({ dialog: d }),
    setSettings: (open, tab) => set((s) => ({ settingsOpen: open, settingsTab: tab ?? s.settingsTab })),
    setDraft: (k, v) => set((s) => ({ drafts: { ...s.drafts, [k]: v } })),
    clearDrafts: (prefix) => set((s) => ({ drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => !k.startsWith(prefix))) })),
    hidePanel: (key) => set((s) => {
      // A hidden panel cannot stay maximized.
      const [lid, pane] = key.split('.');
      const m = { ...s.maximizedPanes }; if (m[lid] === pane) delete m[lid];
      const restore = lid === 'situation' && s.layout.maximized === pane;
      return { hiddenPanels: { ...s.hiddenPanels, [key]: true }, maximizedPanes: m, ...(restore ? { layout: { ...(s.prevLayout ?? s.layout), maximized: null }, prevLayout: null } : {}) };
    }),
    showPanel: (key) => set((s) => { const h = { ...s.hiddenPanels }; delete h[key]; return { hiddenPanels: h }; }),
    resetPanels: (keys, splitIds, situation) => set((s) => {
      const h = { ...s.hiddenPanels }; for (const k of keys) delete h[k];
      const sp = { ...s.splits }; const m = { ...s.maximizedPanes }; for (const id of splitIds) { delete sp[id]; delete m[id]; }
      return { hiddenPanels: h, splits: sp, maximizedPanes: m, ...(situation ? { layout: DEFAULT_LAYOUT, prevLayout: null } : {}) };
    }),
    setDismissedNotice: (id) => set({ dismissedNotice: id }),
    setSimulateSaveFailure: (v) => { storageSim.failWrites = v; set({ simulateSaveFailure: v }); },
    simulateNotification: () => set({ pendingNotification: { id: `ntf-${now()}`, t: now(), site: 'WR NGL Plant', title: 'Smoke reported at centrifugal pump area', text: 'Area operator reports smoke near pump P-2100. Fire team notified. Cause not yet known.', via: 'Plant radio relay (simulated)', equipment: [], location: 'Pump area P-2100' } }),
    dismissNotification: () => set({ pendingNotification: null }),
    addNotificationToCurrent: async () => {
      const n = get().pendingNotification; const id = get().incidentId;
      if (!n || !id) return { ok: false, error: 'No active incident' };
      await mutate(id, (r) => ({ ...r, events: [...r.events, sysEvent('notification', `Further notification: ${n.title}`, { detail: `${n.site} · ${n.via} · ${n.text}`, source: 'field' })] }));
      set({ pendingNotification: null });
      return { ok: true };
    },

    startIncident: async (input, opts) => {
      const cur = get().records[get().incidentId];
      if (cur && isOpen(cur)) {
        if (!opts?.setAside) return { ok: false, error: 'Another incident is open. Choose how to proceed.' };
        const aside = await setAsideCurrent();
        if (!aside.ok) return aside;
      }
      const t = now();
      let id = newIncidentId(t); let n = 2;
      while (get().records[id]) id = `${newIncidentId(t)}-${n++}`;
      const occurredAt = Math.min(input.occurredAt ?? t, t);
      const config: AgentConfig = { ...get().agentDefaults };
      const training = input.mode === 'training';
      const dashboard = training ? [...DEFAULT_DASHBOARD] : input.equipment;
      const clk = (x: number) => clock(x);
      // Intake: keep what was said and how sure it was. ECC suggests other equipment in the same area; a person confirms it.
      const it = input.intake;
      const areas = [...new Set([it?.area, ...input.equipment.map((e) => EQUIPMENT.find((x) => x.id === e)?.area)].filter(Boolean) as string[])];
      const suggested = training || !it ? undefined : EQUIPMENT.filter((e) => areas.includes(e.area) && !input.equipment.includes(e.id)).slice(0, 3).map((e) => ({ id: e.id, reason: `In the ${e.area} area${input.equipment.length ? `, with ${input.equipment.join(', ')}` : ''}`, status: 'pending' as const }));
      const intake: Intake | undefined = it ? { ...it, suggested } : undefined;
      const events: RecordEvent[] = [
        { id: 'notification', t: occurredAt, recordedAt: t, kind: 'notification', title: `Initial notification: ${input.title}`, detail: `${input.site} · reported via ${input.via}${input.notification ? ` · ${input.notification}` : ''}${it?.occurredApprox ? ' · time approximate' : ''}`, source: 'field' },
        { id: 'record-created', t, recordedAt: t, kind: 'lifecycle', title: 'Incident record created', detail: `Occurred ${clk(occurredAt)} · recorded ${clk(t)}${input.location ? ` · location ${input.location}` : ''}`, source: 'user', by: userLabel() },
      ];
      if (it) events.push({ id: 'intake-equipment', t, recordedAt: t, kind: 'equipment', title: input.equipment.length ? `Equipment that may be involved: ${input.equipment.map((e) => `${e} ${EQUIPMENT.find((x) => x.id === e)?.name ?? ''}`.trim()).join(', ')} (named at intake, not verified)` : 'Equipment not yet identified', detail: [it.place ? `Location: ${it.place}${it.placeApprox ? ' (approximate)' : ''}` : '', it.area ? `Area: ${it.area}` : 'Area not stated', suggested?.length ? `ECC suggests also checking: ${suggested.map((x) => x.id).join(', ')} (awaiting confirmation)` : ''].filter(Boolean).join(' · '), source: 'user', by: userLabel() });
      if (input.basedOn) events.push({ id: 'based-on', t, recordedAt: t, kind: 'reference', title: `Started with reference to ${input.basedOn.id}: ${input.basedOn.title}`, detail: 'Historical precedent only. No decisions, measurements or actions were copied into this incident.', source: 'user', by: userLabel() });
      const record: IncidentRecord = { schema: 'ecc-incident/1', id, title: input.title, site: input.site, mode: input.mode, provenance: 'live', startedAt: occurredAt, occurredAt, createdAt: t, notification: { text: input.notification, via: input.via }, location: input.location, incidentType: input.incidentType, intake, status: 'active', reportedBy: it?.reportedBy || input.via, equipment: dashboard, events, reportVersions: [], lessons: [], references: [], agentRuns: [], agentConfig: config, basedOn: input.basedOn, updatedAt: t };
      const res = await commit(record, { ...SIM_DEFAULTS, incidentId: id, incidentMode: input.mode, startedAt: occurredAt, skewMs: clockSkew(), revealedAt: [0], dashboard, assistantMessages: [], assistantSites: [input.site], assistantContext: {}, nav: training ? 'situation' : 'overview', overview: { ...get().overview, scroll: 0, fromOverview: false, quick: null }, knowledgeIncident: null, dialog: null, pendingNotification: get().pendingNotification?.title === input.title ? null : get().pendingNotification });
      if (!res.ok) return res;
      if (config.autoStart) await get().agentStart({ auto: true });
      return { ok: true };
    },
    resolveIncident: async (x) => {
      const r = get().records[get().incidentId];
      if (!r) return { ok: false, error: 'No active incident' };
      const recordedAt = now(); const by = userLabel();
      return commit({ ...r, status: 'resolved', resolution: { ...x, recordedAt, by }, events: [...r.events, sysEvent('resolution', `Incident resolved: ${x.summary}`, { t: x.t, detail: [x.rationale, x.evidence.length ? `Evidence: ${x.evidence.join('; ')}` : '', x.outstanding.length ? `Outstanding: ${x.outstanding.join('; ')}` : '', x.followUp.length ? `Follow-up: ${x.followUp.join('; ')}` : ''].filter(Boolean).join(' · ') })] });
    },
    returnToActive: async (reason) => {
      const r = get().records[get().incidentId];
      if (!r || !reason.trim()) return { ok: false, error: 'A reason is required' };
      return commit({ ...r, status: 'active', resolution: undefined, resolutionHistory: [...(r.resolutionHistory ?? []), ...(r.resolution ? [r.resolution] : [])], events: [...r.events, sysEvent('lifecycle', 'Incident returned to Active', { detail: reason })] });
    },
    returnToWorkspace: () => set({ ...noIncident(), dialog: null, nav: 'situation', assistantMessages: [], assistantContext: {}, assistantSites: [] }),
    reopenIncident: async (id, reason, opts) => {
      const r = get().records[id];
      if (!r || !reason.trim()) return { ok: false, error: 'A reason is required' };
      const cur = get().records[get().incidentId];
      if (cur && cur.id !== id && isOpen(cur)) {
        if (!opts?.setAside) return { ok: false, error: 'Another incident is open. Choose how to proceed.' };
        const aside = await setAsideCurrent(); if (!aside.ok) return aside;
      }
      const rec: IncidentRecord = { ...r, status: 'active', closure: undefined, closureHistory: [...(r.closureHistory ?? []), ...(r.closure ? [r.closure] : [])], events: [...r.events, sysEvent('lifecycle', 'Incident reopened', { detail: `${reason}${r.closure ? ` · Earlier closure ${clock(r.closure.t)} by ${r.closure.by} retained` : ''}` })] };
      return commit(rec, { ...simState(rec), nav: 'situation', dialog: null });
    },
    resumeIncident: async (id, opts) => {
      const r = get().records[id];
      if (!r) return { ok: false, error: 'Record not found' };
      const cur = get().records[get().incidentId];
      if (cur && cur.id !== id && isOpen(cur)) {
        if (!opts?.setAside) return { ok: false, error: 'Another incident is open. Choose how to proceed.' };
        const aside = await setAsideCurrent(); if (!aside.ok) return aside;
      }
      const rec: IncidentRecord = { ...r, status: 'active', events: [...r.events, sysEvent('lifecycle', 'Incident resumed', {})] };
      return commit(rec, { ...simState(rec), nav: 'situation', dialog: null });
    },
    linkHistorical: async (id) => {
      const other = get().records[id]; const curId = get().incidentId;
      if (!other || !curId) return { ok: false, error: 'No active incident to link to' };
      await mutate(curId, (r) => (r.linkedIncidents?.some((l) => l.id === id) ? r : { ...r, linkedIncidents: [...(r.linkedIncidents ?? []), { id, title: other.title, t: now(), by: userLabel() }], events: [...r.events, sysEvent('reference', `Historical incident linked as precedent: ${id}`, { detail: `${other.title}. Precedent only; its decisions and actions are not protocol for this incident.`, meta: { linkedIncident: id } })] }));
      return { ok: true };
    },
    addAddendum: async (id, text) => {
      await mutate(id, (r) => ({ ...r, events: [...r.events, sysEvent('correction', text, { detail: 'Addendum added after closure', meta: { addendum: true } })] }));
    },
    addObservation: async (text) => {
      await mutate(get().incidentId, (r) => ({ ...r, events: [...r.events, sysEvent('observation', text, { detail: `${userLabel()} · reported` })] }));
    },
    retrySave: async () => {
      const r = get().records[get().incidentId];
      if (r) await persistRecord(r); else set({ save: { state: 'idle' } });
    },
    importRecords: async (records, docs) => {
      try {
        for (const x of docs) { await idb.put('files', x.doc.id, x.file); await idb.put('pages', x.doc.id, x.pages); await idb.put('documents', x.doc.id, x.doc); }
        for (const r of records) await idb.put('incidents', r.id, r);
      } catch (e) { return { ok: false, error: errText(e) }; }
      set((s) => ({ records: { ...s.records, ...Object.fromEntries(records.map((r) => [r.id, r])) }, uploads: [...s.uploads.filter((u) => !docs.some((x) => x.doc.id === u.id)), ...docs.map((x) => x.doc)] }));
      return { ok: true };
    },

    agentStart: async (o) => {
      const id = get().incidentId; const r = get().records[id];
      if (!r || !isOpen(r)) return;
      const last = currentRun(r);
      if (last && (last.status === 'running' || last.status === 'paused')) return;
      const number = (r.agentRuns?.length ?? 0) + 1; const config = r.agentConfig ?? get().agentDefaults;
      const run: AgentRun = { id: `run-${number}`, number, startedAt: now(), by: o?.auto ? 'Auto-start setting' : userLabel(), reason: o?.reason, config, status: 'running', pauses: [] };
      await mutate(id, (x) => ({ ...x, agentConfig: config, agentRuns: [...(x.agentRuns ?? []), run], events: [...x.events, sysEvent('agent-control', `Agent started · run ${number}${number > 1 ? ' (start again)' : ''}`, { by: run.by, detail: `${configLabel(config)} · ${describeConfig(config)}${o?.reason ? ` · ${o.reason}` : ''}. Earlier runs and outputs are retained.`, meta: { agentRun: number, agentConfig: config.version } })] }));
      // User-created incidents get one real keyword search over Knowledge within the configured scope; nothing is synthesized from it.
      if (get().incidentMode === 'real' && config.capabilities.includes('procedures')) {
        const q = `${r.title} ${r.notification?.text ?? ''}`;
        window.setTimeout(() => { void retrieval.search(q, { sites: config.retrievalScope === 'incident-site' ? [r.site] : [], contentTypes: [] }).then((res) => {
          if (!res.ok || get().incidentId !== id || get().records[id]?.status === 'closed') return;
          const top = res.passages.filter((p) => p.source.kind !== 'incident').slice(0, 3);
          void mutate(id, (x) => ({ ...x, events: [...x.events, sysEvent('finding', top.length ? `Knowledge search: ${top.map((p) => `${p.source.title} p.${p.source.page ?? 1}`).join('; ')}` : 'Knowledge search found no matching passages', { source: 'agent', by: undefined, detail: `Local keyword search · scope ${config.retrievalScope === 'incident-site' ? r.site : 'all sites'} · run ${number}. Not a recommendation.`, meta: { agentRun: number } })] }));
        }); }, 400);
      }
    },
    agentPause: async (reason) => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.status !== 'running') return r; const t = now(); return { ...r, agentRuns: [...r.agentRuns!.slice(0, -1), { ...run, status: 'paused', pauses: [...run.pauses, { from: t, by: userLabel(), reason }] }], events: [...r.events, sysEvent('agent-control', `Agent paused · run ${run.number}`, { detail: `${reason ? `${reason}. ` : ''}New analysis suspended; context and records preserved. Readings and field reports continue.`, meta: { agentRun: run.number } })] }; });
    },
    agentResume: async (received) => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.status !== 'paused') return r; const t = now(); return { ...r, agentRuns: [...r.agentRuns!.slice(0, -1), { ...run, status: 'running', pauses: run.pauses.map((p) => (p.to == null ? { ...p, to: t, received } : p)) }], events: [...r.events, sysEvent('agent-control', `Agent resumed · run ${run.number}`, { detail: received.length ? `Received during the pause: ${received.join('; ')}` : 'Nothing new was received during the pause.', meta: { agentRun: run.number } })] }; });
    },
    agentStop: async (reason, cancelled) => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.endedAt != null) return r; const x = endRun(r, 'stopped', reason, userLabel()); const x2 = cancelled.length ? { ...x, agentRuns: x.agentRuns!.map((q) => (q.id === run.id ? { ...q, cancelled } : q)) } : x; return { ...x2, events: [...x2.events, sysEvent('agent-control', `Agent stopped · run ${run.number}`, { detail: `${reason}. ${cancelled.length ? `Cancelled in progress: ${cancelled.join(', ')}. ` : ''}Prior work retained. The incident stays open.`, meta: { agentRun: run.number } })] }; });
    },
    agentFail: async () => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.endedAt != null) return r; const x = endRun(r, 'error', 'Simulated agent failure', 'System'); return { ...x, events: [...x.events, sysEvent('agent-control', `Agent error · run ${run.number}`, { by: 'System (simulated)', source: 'system', detail: 'The run ended with an error. Prior work retained; new analysis is not happening. Start again to create a new run.', meta: { agentRun: run.number } })] }; });
    },
    setAgentDefaults: (patch) => set((s) => {
      const next: AgentConfig = { ...s.agentDefaults, ...patch, version: s.agentDefaults.version + 1 };
      const parts = [patch.autoStart != null ? `auto-start ${patch.autoStart ? 'on' : 'off'}` : '', patch.capabilities ? `capabilities: ${CAPABILITIES.filter((c) => patch.capabilities!.includes(c.id)).map((c) => c.label).join(', ') || 'none'}` : '', patch.retrievalScope ? `search scope: ${patch.retrievalScope === 'incident-site' ? 'incident site' : 'all sites'}` : ''].filter(Boolean).join(' · ');
      return { agentDefaults: next, defaultsLog: [{ t: now(), by: userLabel(), version: next.version, text: parts }, ...s.defaultsLog].slice(0, 20) };
    }),
    setIncidentConfig: async (patch) => {
      await mutate(get().incidentId, (r) => {
        const cur = r.agentConfig ?? get().agentDefaults;
        const next: AgentConfig = { ...cur, ...patch, version: cur.version + 1 };
        return { ...r, agentConfig: next, events: [...r.events, sysEvent('config', `Agent configuration changed · ${configLabel(next)}`, { detail: `${describeConfig(next)}. Applies from the next run; runs keep the version they used.` })] };
      });
    },

    loadLocalData: async () => {
      try {
        const stored = await idb.getAll<IncidentRecord>('incidents');
        const map: Record<string, IncidentRecord> = {};
        for (const r of stored) map[r.id] = r;
        let seeded = false;
        for (const seed of SEED_INCIDENTS) if (!map[seed.id]) { const s = { ...seed, provenance: 'seed' as const }; map[seed.id] = s; await idb.put('incidents', seed.id, s); seeded = true; }
        void seeded;
        const uploads = await idb.getAll<UploadedDoc>('documents');
        set({ records: map, uploads: uploads.sort((a, b) => a.storedAt - b.storedAt), storageReady: true, storageError: null });
      } catch (e) {
        const msg = e instanceof StorageError ? e.message : String(e);
        const map: Record<string, IncidentRecord> = {};
        for (const seed of SEED_INCIDENTS) map[seed.id] = { ...seed, provenance: 'seed' };
        set({ records: map, storageReady: true, storageError: msg });
      }
      get().ensureCurrentRecord();
      // An incident started before agent runs existed: the agent has been running since it began.
      { const cur = get().records[get().incidentId];
        if (cur && !cur.agentRuns && isOpen(cur)) {
          const config = { ...get().agentDefaults };
          void persistRecord({ ...cur, agentConfig: config, agentRuns: [{ id: 'run-1', number: 1, startedAt: cur.startedAt, by: 'Started with the incident', config, status: 'running', pauses: [] }] });
        } }
      retrieval.simulateFailure = get().simulateRetrievalFailure;
      { const cur = get().records[get().incidentId]; if (!get().assistantScopeDefaulted) set({ assistantScopeDefaulted: true, ...(cur && !get().assistantSites.length ? { assistantSites: [cur.site] } : {}) }); }
      setClockSkew(get().skewMs ?? 0);
    },
    ensureCurrentRecord: () => {
      const { incidentId, startedAt, records } = get();
      if (!incidentId) return undefined;
      let r = records[incidentId];
      if (!r) { r = emptyRecord(incidentId, startedAt); void persistRecord(r); }
      return r;
    },
    appendEvents: async (incidentId, events) => {
      if (!events.length) return;
      // One scenario clock: time order is knowledge order, so new entries merge by time (stable on arrival).
      await mutate(incidentId, (r) => { const have = new Set(r.events.map((e) => e.id)); const add = events.filter((e) => !have.has(e.id)); return add.length ? { ...r, events: [...r.events, ...add].sort((a, b) => a.t - b.t || a.recordedAt - b.recordedAt), equipment: [...new Set([...r.equipment, ...get().dashboard])] } : r; });
    },
    addCorrection: async (incidentId, originalId, text) => {
      await mutate(incidentId, (r) => ({ ...r, events: [...r.events, sysEvent('correction', text, { corrects: originalId, detail: `Correction of: ${r.events.find((e) => e.id === originalId)?.title ?? originalId}` })] }));
    },
    addLesson: async (incidentId, text) => {
      await mutate(incidentId, (r) => ({ ...r, lessons: [...r.lessons, { id: `l-${now()}`, t: now(), by: userLabel(), text }], events: [...r.events, sysEvent('lesson', text)] }));
    },
    closeIncident: async (rationale, outstanding, opts) => {
      const r0 = get().records[get().incidentId];
      if (!rationale.trim()) return { ok: false, error: 'A closure rationale is required.' };
      if (!r0) return { ok: false, error: 'No active incident' };
      if (r0.status !== 'resolved') return { ok: false, error: 'Resolve the incident before closing it.' };
      const by = userLabel(); const t = now();
      let r = r0;
      if (opts?.snapshot) {
        const gen = opts.generated ?? generateSitrep(r, t);
        const v: ReportVersion = { id: `sr-${t}`, number: r.reportVersions.length + 1, createdAt: t, asOf: t, status: 'draft', author: `Generated by ECC at closure · ${by}`, generated: gen, sections: { ...gen } };
        r = { ...r, reportVersions: [...r.reportVersions, v], events: [...r.events, sysEvent('report-version', `Final Sit. Rep generated at closure · as of ${clock(t)}`, { versionId: v.id, number: v.number, status: 'draft', asOf: t } as Partial<RecordEvent>)] };
      }
      const last = r.reportVersions[r.reportVersions.length - 1];
      const sitrep = last ? `Latest Sit. Rep as of ${clock(last.asOf)}${last.status === 'approved' ? ' (approved under the earlier workflow)' : ''}` : 'No Sit. Rep';
      const run = currentRun(r);
      if (run && run.endedAt == null) { r = endRun(r, 'completed', 'Incident closed', by); r = { ...r, events: [...r.events, sysEvent('agent-control', `Agent work ended at closure · run ${run.number}`, { detail: 'Final run status preserved. Site-wide systems are not affected by closing this record.', meta: { agentRun: run.number } })] }; }
      const rec: IncidentRecord = { ...r, status: 'closed', sim: simOf(), closure: { t, by, rationale, outstanding, sitrep }, events: [...r.events, sysEvent('closure', 'Incident closed', { detail: rationale, rationale, outstanding } as Partial<RecordEvent>)] };
      return commit(rec, { dialog: { type: 'closed', id: rec.id } });
    },
    createSitrepVersion: async (asOf, generated) => {
      await mutate(get().incidentId, (r) => {
        const gen = generated ?? generateSitrep(r, asOf);
        const v: ReportVersion = { id: `sr-${now()}`, number: r.reportVersions.length + 1, createdAt: now(), asOf, status: 'draft', author: 'Generated by ECC · ' + userLabel(), generated: gen, sections: { ...gen } };
        return { ...r, reportVersions: [...r.reportVersions, v], events: [...r.events, sysEvent('report-version', `Sit. Rep generated · as of ${clock(asOf)}`, { versionId: v.id, number: v.number, status: 'draft', asOf } as Partial<RecordEvent>)] };
      });
    },
    editSitrepSection: async (versionId, key, text) => {
      await mutate(get().incidentId, (r) => ({ ...r, reportVersions: r.reportVersions.map((v) => (v.id === versionId && v.status !== 'approved' ? { ...v, sections: { ...v.sections, [key]: text } } : v)) }));
    },
    refreshSitrepDraft: async (versionId, asOf, generated) => {
      await mutate(get().incidentId, (r) => {
        const gen = generated ?? generateSitrep(r, asOf);
        return { ...r, reportVersions: r.reportVersions.map((v) => {
          if (v.id !== versionId || v.status === 'approved') return v;
          const sections: SitrepSections = { ...v.sections }; const pending: Partial<SitrepSections> = { ...v.pending };
          (Object.keys(gen) as SitrepSectionKey[]).forEach((k) => {
            const edited = v.sections[k] !== v.generated[k];
            if (!edited) { sections[k] = gen[k]; delete pending[k]; } else if (gen[k] !== v.generated[k] && gen[k] !== v.sections[k]) pending[k] = gen[k];
          });
          return { ...v, asOf, generated: gen, sections, pending: Object.keys(pending).length ? pending : undefined };
        }) };
      });
    },
    resolveSitrepPending: async (versionId, key, take) => {
      await mutate(get().incidentId, (r) => ({ ...r, reportVersions: r.reportVersions.map((v) => {
        if (v.id !== versionId || !v.pending || v.pending[key] == null) return v;
        const pending = { ...v.pending }; const newText = pending[key]!; delete pending[key];
        return { ...v, sections: take === 'new' ? { ...v.sections, [key]: newText } : v.sections, generated: take === 'new' ? { ...v.generated, [key]: newText } : v.generated, pending: Object.keys(pending).length ? pending : undefined };
      }) }));
    },
    submitSitrepReview: async (versionId) => {
      await mutate(get().incidentId, (r) => ({ ...r, reportVersions: r.reportVersions.map((v) => (v.id === versionId && v.status === 'draft' ? { ...v, status: 'review', author: userLabel() } : v)), events: [...r.events, sysEvent('report-version', `SITREP ${r.reportVersions.find((v) => v.id === versionId)?.number} submitted for review`, { versionId, status: 'review' } as Partial<RecordEvent>)] }));
    },
    approveSitrep: async (versionId) => {
      await mutate(get().incidentId, (r) => ({ ...r, reportVersions: r.reportVersions.map((v) => (v.id === versionId ? { ...v, status: 'approved', approvedBy: userLabel(), approvedAt: now(), pending: undefined } : v)), events: [...r.events, sysEvent('report-version', `SITREP ${r.reportVersions.find((v) => v.id === versionId)?.number} approved`, { versionId, status: 'approved' } as Partial<RecordEvent>)] }));
    },

    ingest: async (file, meta) => {
      const id = `up-${now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const res = await analyse(file);
      const doc: UploadedDoc = { id, ...meta, fileName: file.name, mime: file.type || 'application/octet-stream', size: file.size, storedAt: now(), by: userLabel(), extraction: res.extraction, indexReady: res.extraction.state === 'extracted', previewable: res.previewable };
      try {
        await idb.put('files', id, file);
        await idb.put('pages', id, res.pages);
        await idb.put('documents', id, doc);
      } catch (e) {
        const msg = e instanceof StorageError ? e.message : String(e);
        set({ storageError: msg, toast: `Document not stored: ${msg}` });
        return null;
      }
      set((s) => ({ uploads: [...s.uploads, doc], storageError: null }));
      return doc;
    },
    uploadUrl: async (id) => {
      const blob = await idb.get<Blob>('files', id).catch(() => undefined);
      return blob ? objectUrlFor(id, blob) : null;
    },
    uploadPages: async (id) => (await idb.get<string[]>('pages', id).catch(() => undefined)) ?? [],
    referenceRevision: async (docId, revision, note) => {
      const by = userLabel();
      await mutate(get().incidentId, (r) => ({ ...r, references: [...r.references, { docId, revision, t: now(), by, note }], events: [...r.events, sysEvent('reference', `Document revision referenced: ${note}`, { detail: `Pinned for this incident · Rev ${revision}`, meta: { docId, revision } })] }));
    },
  };
}, {
  name: 'ecc-v3',
  version: 5,
  // Existing saved state keeps working: the old single equipment filter becomes the new filter set.
  migrate: (persisted, version) => {
    const p = persisted as Partial<State> & { logFilter?: string | null };
    if (version < 2) { p.logFilters = { ...EMPTY_FILTERS, equipment: p.logFilter ? [p.logFilter] : [] }; delete p.logFilter; p.splits = p.splits ?? {}; p.maximizedPanes = p.maximizedPanes ?? {}; p.assistantWidth = p.assistantWidth ?? ASSISTANT_DEFAULT; }
    // An incident already open in this browser stays open; it was the training scenario.
    if (version < 3) { (p as State).incidentMode = p.incidentId ? 'training' : null; p.hiddenPanels = {}; p.drafts = {}; }
    if (version < 5) { (p as State).persona = 'shift-manager'; }
    if (version < 4) { (p as State).assistantMode = 'ask'; (p as State).assistantContext = {}; (p as State).assistantScopeDefaulted = false; }
    return p as State;
  },
  partialize: (s) => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (typeof v !== 'function' && !['records', 'uploads', 'storageReady', 'storageError', 'toast', 'indexReady', 'trendView', 'dialog', 'settingsOpen', 'save', 'simulateSaveFailure', 'focusInvestigation', 'investigationProgress', 'overview', 'timelineFocus', 'flashEquipment'].includes(k)) data[k] = v;
    return data as unknown as State;
  },
}));

/** Effective watcher list for an equipment item (definitions + user overrides). */
export function watchersFor(equipmentId: string, overrides: Record<string, WatcherOverride>) {
  return WATCHERS.filter((w) => w.equipmentId === equipmentId).map((w) => {
    const o = overrides[w.id] ?? {};
    return { def: w, onCard: o.onCard ?? w.defaultOnCard, limitLabel: o.limit === undefined ? w.defaultLimit ?? null : o.limit, windowMin: o.windowMin ?? 15 };
  });
}

// Apply the persisted scenario-clock skew as soon as the store exists.
setClockSkew(useStore.getState().skewMs ?? 0);
