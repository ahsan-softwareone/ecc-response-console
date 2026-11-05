import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DASHBOARD, EMERGENCY_META, STEPS, STEP_COUNT, USER, WATCHERS } from './data/scenario';
import type { ConditionState, DecisionStatus, EvidenceRef, ExecutionStatus, Region, Severity } from './data/types';
import { idb, StorageError, storageSim } from './lib/idb';
import { CAPABILITIES, DEFAULT_AGENT_CONFIG, configLabel, currentRun, describeConfig, isOpen } from './lib/agent';
import { analyse, objectUrlFor, type DeclaredStatus, type UploadedDoc } from './lib/ingest';
import { retrieval, type ContentType, type Passage } from './lib/retrieval';
import { SEED_INCIDENTS } from './record/seeds';
import { generateSitrep } from './record/timeline';
import { clock, clockSkew, now, setClockSkew } from './lib/time';
import type { AgentConfig, AgentRun, IncidentRecord, RecordEvent, ReportVersion, SimSnapshot, SitrepSectionKey, SitrepSections } from './record/types';

export type Nav = 'situation' | 'sitrep' | 'agentlog' | 'knowledge';
export type WindowId = 'equipment' | 'log' | 'response' | 'document';
export type ResponseTab = 'response' | 'observations' | 'sources';
export type Role = 'user' | 'admin';

export interface Decision {
  status: Exclude<DecisionStatus, 'none'>;
  rationale: string;
  by: string;
  at: number;
  evidenceUsed: { docId: string; revision: string; page: number; label: string }[];
  recommendationSummary: string;
}
export interface FieldReport { id: string; at: number; by: string; text: string; status: ExecutionStatus }
export interface AlertUserState { readAt?: number; ackAt?: number; decision?: Decision; reports: FieldReport[] }
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

export interface StartInput { mode: 'real' | 'training'; site: string; title: string; notification: string; via: string; occurredAt?: number; equipment: string[]; location?: string; incidentType?: string; basedOn?: { id: string; title: string } }
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
  selectedAlertId: string | null;
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
  removeEquipment: (id: string) => void;
  setWatcher: (id: string, o: WatcherOverride) => void;
  selectAlert: (id: string | null) => void;
  acknowledge: (id: string) => void;
  recordDecision: (id: string, d: Decision) => void;
  addReport: (id: string, r: FieldReport) => void;
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
  closeIncident: (rationale: string, outstanding: string[], opts?: { snapshot?: boolean }) => Promise<Result>;
  createSitrepVersion: (asOf: number) => Promise<void>;
  editSitrepSection: (versionId: string, key: SitrepSectionKey, text: string) => Promise<void>;
  refreshSitrepDraft: (versionId: string, asOf: number) => Promise<void>;
  resolveSitrepPending: (versionId: string, key: SitrepSectionKey, take: 'mine' | 'new') => Promise<void>;
  submitSitrepReview: (versionId: string) => Promise<void>;
  approveSitrep: (versionId: string) => Promise<void>;
  ingest: (file: File, meta: { title: string; site: string; equipment: string[]; type: UploadedDoc['type']; number: string; revision: string; declaredStatus: DeclaredStatus; revisionOf?: string }) => Promise<UploadedDoc | null>;
  uploadUrl: (id: string) => Promise<string | null>;
  uploadPages: (id: string) => Promise<string[]>;
  referenceRevision: (docId: string, revision: string, note: string) => Promise<void>;
}

const DEFAULT_LAYOUT: Layout = { monitoringSide: 'left', splitX: 0.56, splitY: 0.55, splitDoc: 0.45, maximized: null, focus: null };
export const USER_LABEL = `${USER.name} · ${USER.role}`;

const SIM_DEFAULTS = { autoplay: false, watcherOverrides: {}, alertUser: {}, selectedAlertId: null, logFilters: EMPTY_FILTERS, viewer: null, viewerExpanded: false, activityTask: null, trendView: null, dismissedNotice: null };
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
  const simOf = (): SimSnapshot => { const s = get(); return { startedAt: s.startedAt, revealedAt: s.revealedAt, dashboard: s.dashboard, watcherOverrides: s.watcherOverrides as Record<string, unknown>, alertUser: s.alertUser as Record<string, unknown> }; };
  const simState = (r: IncidentRecord): Partial<State> => ({ ...SIM_DEFAULTS, incidentId: r.id, incidentMode: r.sim ? r.mode : 'real', startedAt: r.sim?.startedAt ?? r.startedAt, revealedAt: r.sim?.revealedAt ?? [0], dashboard: r.sim?.dashboard ?? r.equipment, watcherOverrides: (r.sim?.watcherOverrides ?? {}) as Record<string, WatcherOverride>, alertUser: (r.sim?.alertUser ?? {}) as Record<string, AlertUserState>, skewMs: clockSkew() });
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
    const by = USER_LABEL;
    let r = endRun(cur, 'stopped', 'Incident set aside', by);
    if (r !== cur) r = { ...r, events: [...r.events, sysEvent('agent-control', `Agent stopped · run ${currentRun(cur)?.number}`, { detail: 'Incident set aside; prior work retained.' })] };
    return commit({ ...r, status: 'left-open', sim: simOf(), events: [...r.events, sysEvent('lifecycle', 'Incident set aside; record kept and can be resumed', {})] });
  };
  const mutate = async (incidentId: string, fn: (r: IncidentRecord) => IncidentRecord) => {
    const r = get().records[incidentId] ?? (incidentId && incidentId === get().incidentId ? get().ensureCurrentRecord() : null);
    if (!r) return;
    await persistRecord({ ...fn(r), updatedAt: now() });
  };
  const sysEvent = (kind: RecordEvent['kind'], title: string, extra: Partial<RecordEvent> = {}): RecordEvent => ({ id: `${kind}-${now()}-${Math.random().toString(36).slice(2, 6)}`, t: now(), recordedAt: now(), kind, title, source: 'user', by: USER_LABEL, ...extra } as RecordEvent);

  return {
    ...noIncident(),
    agentDefaults: DEFAULT_AGENT_CONFIG, defaultsLog: [], dialog: null, settingsOpen: false, settingsTab: 'application', save: { state: 'idle' }, simulateSaveFailure: false, pendingNotification: null, drafts: {}, hiddenPanels: {},
    responseTab: 'response', layout: DEFAULT_LAYOUT, prevLayout: null, theme: 'light', nav: 'situation', role: 'user', splits: {}, maximizedPanes: {}, assistantWidth: ASSISTANT_DEFAULT,
    agentView: 'detailed', agentFilters: EMPTY_AGENT_FILTERS, agentGroup: 'chrono', agentSub: 'task', trendView: null,
    knowledgeView: 'search', knowledgeDoc: null, knowledgeIncident: null, simulateRetrievalFailure: false,
    assistantOpen: false, assistantSites: [], assistantTypes: [], assistantMessages: [],
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
    removeEquipment: (id) => set((s) => ({ dashboard: s.dashboard.filter((x) => x !== id) })),
    setWatcher: (id, o) => set((s) => ({ watcherOverrides: { ...s.watcherOverrides, [id]: { ...s.watcherOverrides[id], ...o } } })),
    selectAlert: (id) => set((s) => ({ selectedAlertId: id, alertUser: id ? { ...s.alertUser, [id]: { ...au(s, id), readAt: s.alertUser[id]?.readAt ?? now() } } : s.alertUser })),
    acknowledge: (id) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), ackAt: now() } } })),
    recordDecision: (id, d) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), decision: d } } })),
    addReport: (id, r) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), reports: [...au(s, id).reports, r] } } })),
    setReportStatus: (alertId, reportId, status) => set((s) => ({ alertUser: { ...s.alertUser, [alertId]: { ...au(s, alertId), reports: au(s, alertId).reports.map((r) => (r.id === reportId ? { ...r, status } : r)) } } })),
    setResponseTab: (t) => set({ responseTab: t }),
    setLogFilters: (p) => set((s) => ({ logFilters: { ...s.logFilters, ...p } })),
    clearLogFilters: () => set({ logFilters: EMPTY_FILTERS }),
    toggleEquipmentFilter: (id) => set((s) => ({ logFilters: { ...s.logFilters, equipment: s.logFilters.equipment.includes(id) ? s.logFilters.equipment.filter((x) => x !== id) : [...s.logFilters.equipment, id] } })),
    setSplit: (id, px) => set((s) => ({ splits: { ...s.splits, [id]: Math.round(px) } })),
    setTrendView: (v) => set({ trendView: v }),
    setMaximizedPane: (id, pane) => set((s) => { const m = { ...s.maximizedPanes }; if (pane) m[id] = pane; else delete m[id]; return { maximizedPanes: m }; }),
    setAssistantWidth: (px) => set({ assistantWidth: Math.round(Math.min(ASSISTANT_MAX, Math.max(ASSISTANT_MIN, px))) }),
    openViewer: (t) => set((s) => { const h = { ...s.hiddenPanels }; delete h['situation.document']; return { viewer: { dock: true, ...t }, viewerExpanded: t.dock === false ? true : s.viewerExpanded, hiddenPanels: h }; }),
    closeViewer: () => set((s) => { const h = { ...s.hiddenPanels }; delete h['situation.document']; return { viewer: null, viewerExpanded: false, hiddenPanels: h }; }),
    setViewerExpanded: (v) => set((s) => ({ viewerExpanded: v, viewer: !v && s.viewer && s.viewer.dock === false ? null : s.viewer })),
    setLayout: (patch) => set((s) => ({ layout: { ...s.layout, ...patch } })),
    maximize: (w) => set((s) => {
      if (w) return { prevLayout: s.layout.maximized ? s.prevLayout : s.layout, layout: { ...s.layout, maximized: w } };
      return { layout: { ...(s.prevLayout ?? s.layout), maximized: null }, prevLayout: null };
    }),
    swapSides: () => set((s) => ({ layout: { ...s.layout, monitoringSide: s.layout.monitoringSide === 'left' ? 'right' : 'left' } })),
    setTheme: (t) => set({ theme: t }),
    setNav: (n) => set({ nav: n }),
    setRole: (r) => set({ role: r }),
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
      const events: RecordEvent[] = [
        { id: 'notification', t: occurredAt, recordedAt: t, kind: 'notification', title: `Initial notification: ${input.title}`, detail: `${input.site} · reported via ${input.via}${input.notification ? ` · ${input.notification}` : ''}`, source: 'field' },
        { id: 'record-created', t, recordedAt: t, kind: 'lifecycle', title: 'Incident record created', detail: `Occurred ${clk(occurredAt)} · recorded ${clk(t)}${input.location ? ` · location ${input.location}` : ''}`, source: 'user', by: USER_LABEL },
      ];
      if (input.basedOn) events.push({ id: 'based-on', t, recordedAt: t, kind: 'reference', title: `Started with reference to ${input.basedOn.id}: ${input.basedOn.title}`, detail: 'Historical precedent only. No decisions, measurements or actions were copied into this incident.', source: 'user', by: USER_LABEL });
      const record: IncidentRecord = { schema: 'ecc-incident/1', id, title: input.title, site: input.site, mode: input.mode, provenance: 'live', startedAt: occurredAt, occurredAt, createdAt: t, notification: { text: input.notification, via: input.via }, location: input.location, incidentType: input.incidentType, status: 'active', reportedBy: input.via, equipment: dashboard, events, reportVersions: [], lessons: [], references: [], agentRuns: [], agentConfig: config, basedOn: input.basedOn, updatedAt: t };
      const res = await commit(record, { ...SIM_DEFAULTS, incidentId: id, incidentMode: input.mode, startedAt: occurredAt, skewMs: clockSkew(), revealedAt: [0], dashboard, assistantMessages: [], nav: 'situation', knowledgeIncident: null, dialog: null, pendingNotification: get().pendingNotification?.title === input.title ? null : get().pendingNotification });
      if (!res.ok) return res;
      if (config.autoStart) await get().agentStart({ auto: true });
      return { ok: true };
    },
    resolveIncident: async (x) => {
      const r = get().records[get().incidentId];
      if (!r) return { ok: false, error: 'No active incident' };
      const recordedAt = now(); const by = USER_LABEL;
      return commit({ ...r, status: 'resolved', resolution: { ...x, recordedAt, by }, events: [...r.events, sysEvent('resolution', `Incident resolved: ${x.summary}`, { t: x.t, detail: [x.rationale, x.evidence.length ? `Evidence: ${x.evidence.join('; ')}` : '', x.outstanding.length ? `Outstanding: ${x.outstanding.join('; ')}` : '', x.followUp.length ? `Follow-up: ${x.followUp.join('; ')}` : ''].filter(Boolean).join(' · ') })] });
    },
    returnToActive: async (reason) => {
      const r = get().records[get().incidentId];
      if (!r || !reason.trim()) return { ok: false, error: 'A reason is required' };
      return commit({ ...r, status: 'active', resolution: undefined, resolutionHistory: [...(r.resolutionHistory ?? []), ...(r.resolution ? [r.resolution] : [])], events: [...r.events, sysEvent('lifecycle', 'Incident returned to Active', { detail: reason })] });
    },
    returnToWorkspace: () => set({ ...noIncident(), dialog: null, nav: 'situation', assistantMessages: [] }),
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
      await mutate(curId, (r) => (r.linkedIncidents?.some((l) => l.id === id) ? r : { ...r, linkedIncidents: [...(r.linkedIncidents ?? []), { id, title: other.title, t: now(), by: USER_LABEL }], events: [...r.events, sysEvent('reference', `Historical incident linked as precedent: ${id}`, { detail: `${other.title}. Precedent only; its decisions and actions are not protocol for this incident.`, meta: { linkedIncident: id } })] }));
      return { ok: true };
    },
    addAddendum: async (id, text) => {
      await mutate(id, (r) => ({ ...r, events: [...r.events, sysEvent('correction', text, { detail: 'Addendum added after closure', meta: { addendum: true } })] }));
    },
    addObservation: async (text) => {
      await mutate(get().incidentId, (r) => ({ ...r, events: [...r.events, sysEvent('observation', text, { detail: `${USER_LABEL} · reported` })] }));
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
      const run: AgentRun = { id: `run-${number}`, number, startedAt: now(), by: o?.auto ? 'Auto-start setting' : USER_LABEL, reason: o?.reason, config, status: 'running', pauses: [] };
      await mutate(id, (x) => ({ ...x, agentConfig: config, agentRuns: [...(x.agentRuns ?? []), run], events: [...x.events, sysEvent('agent-control', `Agent started · run ${number}${number > 1 ? ' (start again)' : ''}`, { by: run.by, detail: `${configLabel(config)} · ${describeConfig(config)}${o?.reason ? ` · ${o.reason}` : ''}. Earlier runs and outputs are retained.`, meta: { agentRun: number, agentConfig: config.version } })] }));
      // User-created incidents get one real keyword search over Knowledge within the configured scope; nothing is synthesized from it.
      if (get().incidentMode === 'real' && config.capabilities.includes('procedures')) {
        const q = `${r.title} ${r.notification?.text ?? ''}`;
        window.setTimeout(() => { void retrieval.search(q, { sites: config.retrievalScope === 'incident-site' ? [r.site] : [], contentTypes: [] }).then((res) => {
          if (!res.ok || get().incidentId !== id) return;
          const top = res.passages.filter((p) => p.source.kind !== 'incident').slice(0, 3);
          void mutate(id, (x) => ({ ...x, events: [...x.events, sysEvent('finding', top.length ? `Knowledge search: ${top.map((p) => `${p.source.title} p.${p.source.page ?? 1}`).join('; ')}` : 'Knowledge search found no matching passages', { source: 'agent', by: undefined, detail: `Local keyword search · scope ${config.retrievalScope === 'incident-site' ? r.site : 'all sites'} · run ${number}. Not a recommendation.`, meta: { agentRun: number } })] }));
        }); }, 400);
      }
    },
    agentPause: async (reason) => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.status !== 'running') return r; const t = now(); return { ...r, agentRuns: [...r.agentRuns!.slice(0, -1), { ...run, status: 'paused', pauses: [...run.pauses, { from: t, by: USER_LABEL, reason }] }], events: [...r.events, sysEvent('agent-control', `Agent paused · run ${run.number}`, { detail: `${reason ? `${reason}. ` : ''}New analysis suspended; context and records preserved. Readings and field reports continue.`, meta: { agentRun: run.number } })] }; });
    },
    agentResume: async (received) => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.status !== 'paused') return r; const t = now(); return { ...r, agentRuns: [...r.agentRuns!.slice(0, -1), { ...run, status: 'running', pauses: run.pauses.map((p) => (p.to == null ? { ...p, to: t, received } : p)) }], events: [...r.events, sysEvent('agent-control', `Agent resumed · run ${run.number}`, { detail: received.length ? `Received during the pause: ${received.join('; ')}` : 'Nothing new was received during the pause.', meta: { agentRun: run.number } })] }; });
    },
    agentStop: async (reason, cancelled) => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.endedAt != null) return r; const x = endRun(r, 'stopped', reason, USER_LABEL); const x2 = cancelled.length ? { ...x, agentRuns: x.agentRuns!.map((q) => (q.id === run.id ? { ...q, cancelled } : q)) } : x; return { ...x2, events: [...x2.events, sysEvent('agent-control', `Agent stopped · run ${run.number}`, { detail: `${reason}. ${cancelled.length ? `Cancelled in progress: ${cancelled.join(', ')}. ` : ''}Prior work retained. The incident stays open.`, meta: { agentRun: run.number } })] }; });
    },
    agentFail: async () => {
      await mutate(get().incidentId, (r) => { const run = currentRun(r); if (!run || run.endedAt != null) return r; const x = endRun(r, 'error', 'Simulated agent failure', 'System'); return { ...x, events: [...x.events, sysEvent('agent-control', `Agent error · run ${run.number}`, { by: 'System (simulated)', source: 'system', detail: 'The run ended with an error. Prior work retained; new analysis is not happening. Start again to create a new run.', meta: { agentRun: run.number } })] }; });
    },
    setAgentDefaults: (patch) => set((s) => {
      const next: AgentConfig = { ...s.agentDefaults, ...patch, version: s.agentDefaults.version + 1 };
      const parts = [patch.autoStart != null ? `auto-start ${patch.autoStart ? 'on' : 'off'}` : '', patch.capabilities ? `capabilities: ${CAPABILITIES.filter((c) => patch.capabilities!.includes(c.id)).map((c) => c.label).join(', ') || 'none'}` : '', patch.retrievalScope ? `search scope: ${patch.retrievalScope === 'incident-site' ? 'incident site' : 'all sites'}` : ''].filter(Boolean).join(' · ');
      return { agentDefaults: next, defaultsLog: [{ t: now(), by: USER_LABEL, version: next.version, text: parts }, ...s.defaultsLog].slice(0, 20) };
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
      await mutate(incidentId, (r) => ({ ...r, lessons: [...r.lessons, { id: `l-${now()}`, t: now(), by: USER_LABEL, text }], events: [...r.events, sysEvent('lesson', text)] }));
    },
    closeIncident: async (rationale, outstanding, opts) => {
      const r0 = get().records[get().incidentId];
      if (!rationale.trim()) return { ok: false, error: 'A closure rationale is required.' };
      if (!r0) return { ok: false, error: 'No active incident' };
      if (r0.status !== 'resolved') return { ok: false, error: 'Resolve the incident before closing it.' };
      const by = USER_LABEL; const t = now();
      let r = r0;
      if (opts?.snapshot) {
        const gen = generateSitrep(r, t);
        const v: ReportVersion = { id: `sr-${t}`, number: r.reportVersions.length + 1, createdAt: t, asOf: t, status: 'draft', author: `ECC agent (final snapshot, draft) · ${by}`, generated: gen, sections: { ...gen } };
        r = { ...r, reportVersions: [...r.reportVersions, v], events: [...r.events, sysEvent('report-version', `SITREP ${v.number} final snapshot created · draft, not approved`, { versionId: v.id, number: v.number, status: 'draft', asOf: t } as Partial<RecordEvent>)] };
      }
      const last = r.reportVersions[r.reportVersions.length - 1];
      const sitrep = last ? `SITREP ${last.number} · ${last.status === 'approved' ? 'approved' : last.status === 'review' ? 'in review, not approved' : 'draft, not approved'}` : 'No SITREP';
      const run = currentRun(r);
      if (run && run.endedAt == null) { r = endRun(r, 'completed', 'Incident closed', by); r = { ...r, events: [...r.events, sysEvent('agent-control', `Agent work ended at closure · run ${run.number}`, { detail: 'Final run status preserved. Site-wide systems are not affected by closing this record.', meta: { agentRun: run.number } })] }; }
      const rec: IncidentRecord = { ...r, status: 'closed', sim: simOf(), closure: { t, by, rationale, outstanding, sitrep }, events: [...r.events, sysEvent('closure', 'Incident closed', { detail: rationale, rationale, outstanding } as Partial<RecordEvent>)] };
      return commit(rec, { dialog: { type: 'closed', id: rec.id } });
    },
    createSitrepVersion: async (asOf) => {
      await mutate(get().incidentId, (r) => {
        const gen = generateSitrep(r, asOf);
        const v: ReportVersion = { id: `sr-${now()}`, number: r.reportVersions.length + 1, createdAt: now(), asOf, status: 'draft', author: 'ECC agent (draft) · ' + USER_LABEL, generated: gen, sections: { ...gen } };
        return { ...r, reportVersions: [...r.reportVersions, v], events: [...r.events, sysEvent('report-version', `SITREP ${v.number} draft created · as of ${clock(asOf)}`, { versionId: v.id, number: v.number, status: 'draft', asOf } as Partial<RecordEvent>)] };
      });
    },
    editSitrepSection: async (versionId, key, text) => {
      await mutate(get().incidentId, (r) => ({ ...r, reportVersions: r.reportVersions.map((v) => (v.id === versionId && v.status !== 'approved' ? { ...v, sections: { ...v.sections, [key]: text } } : v)) }));
    },
    refreshSitrepDraft: async (versionId, asOf) => {
      await mutate(get().incidentId, (r) => {
        const gen = generateSitrep(r, asOf);
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
      await mutate(get().incidentId, (r) => ({ ...r, reportVersions: r.reportVersions.map((v) => (v.id === versionId && v.status === 'draft' ? { ...v, status: 'review', author: USER_LABEL } : v)), events: [...r.events, sysEvent('report-version', `SITREP ${r.reportVersions.find((v) => v.id === versionId)?.number} submitted for review`, { versionId, status: 'review' } as Partial<RecordEvent>)] }));
    },
    approveSitrep: async (versionId) => {
      await mutate(get().incidentId, (r) => ({ ...r, reportVersions: r.reportVersions.map((v) => (v.id === versionId ? { ...v, status: 'approved', approvedBy: USER_LABEL, approvedAt: now(), pending: undefined } : v)), events: [...r.events, sysEvent('report-version', `SITREP ${r.reportVersions.find((v) => v.id === versionId)?.number} approved`, { versionId, status: 'approved' } as Partial<RecordEvent>)] }));
    },

    ingest: async (file, meta) => {
      const id = `up-${now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const res = await analyse(file);
      const doc: UploadedDoc = { id, ...meta, fileName: file.name, mime: file.type || 'application/octet-stream', size: file.size, storedAt: now(), by: USER_LABEL, extraction: res.extraction, indexReady: res.extraction.state === 'extracted', previewable: res.previewable };
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
      const by = USER_LABEL;
      await mutate(get().incidentId, (r) => ({ ...r, references: [...r.references, { docId, revision, t: now(), by, note }], events: [...r.events, sysEvent('reference', `Document revision referenced: ${note}`, { detail: `Pinned for this incident · Rev ${revision}`, meta: { docId, revision } })] }));
    },
  };
}, {
  name: 'ecc-v3',
  version: 3,
  // Existing saved state keeps working: the old single equipment filter becomes the new filter set.
  migrate: (persisted, version) => {
    const p = persisted as Partial<State> & { logFilter?: string | null };
    if (version < 2) { p.logFilters = { ...EMPTY_FILTERS, equipment: p.logFilter ? [p.logFilter] : [] }; delete p.logFilter; p.splits = p.splits ?? {}; p.maximizedPanes = p.maximizedPanes ?? {}; p.assistantWidth = p.assistantWidth ?? ASSISTANT_DEFAULT; }
    // An incident already open in this browser stays open; it was the training scenario.
    if (version < 3) { (p as State).incidentMode = p.incidentId ? 'training' : null; p.hiddenPanels = {}; p.drafts = {}; }
    return p as State;
  },
  partialize: (s) => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (typeof v !== 'function' && !['records', 'uploads', 'storageReady', 'storageError', 'toast', 'indexReady', 'trendView', 'dialog', 'settingsOpen', 'save', 'simulateSaveFailure'].includes(k)) data[k] = v;
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
