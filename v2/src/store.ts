import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DASHBOARD, STEPS, STEP_COUNT, WATCHERS } from './data/scenario';
import type { DecisionStatus, EvidenceRef, ExecutionStatus, Region } from './data/types';

export type Nav = 'situation' | 'activity' | 'knowledge' | 'sitrep' | 'records';
export type WindowId = 'equipment' | 'log' | 'response' | 'document';
export type ResponseTab = 'response' | 'observations' | 'sources';

export interface Decision {
  status: Exclude<DecisionStatus, 'none'>;
  rationale: string;
  by: string;
  at: number;
  /** Evidence (with revision) the recommendation carried when the decision was recorded. */
  evidenceUsed: { docId: string; revision: string; page: number; label: string }[];
  recommendationSummary: string;
}
export interface FieldReport { id: string; at: number; by: string; text: string; status: ExecutionStatus }
export interface AlertUserState { readAt?: number; ackAt?: number; decision?: Decision; reports: FieldReport[] }

export interface WatcherOverride { onCard?: boolean; limit?: string | null; windowMin?: 15 | 60 }

export interface ViewerTarget {
  docId: string; revision: string; page: number; label: string;
  quote?: string; region?: Region; locate: EvidenceRef['locate'];
  origin: string; // e.g. "Fire at D-0029 · recommendation"
}

export interface Layout {
  monitoringSide: 'left' | 'right';
  splitX: number;      // monitoring share of width
  splitY: number;      // equipment share of monitoring height
  splitDoc: number;    // response share of response-column height when document docked
  maximized: WindowId | null;
  focus: 'monitoring' | 'response' | null; // which side is shown when the viewport cannot fit both
}

export interface SitrepVersion {
  id: string; number: number; createdAt: number; status: 'draft' | 'review' | 'approved';
  author: string; basedOnStep: number;
  fields: { situation: string; actions: string; decisions: string; resources: string; next: string };
  approvedBy?: string; approvedAt?: number;
}

export interface State {
  startedAt: number;
  revealedAt: number[];
  autoplay: boolean;
  dashboard: string[];
  watcherOverrides: Record<string, WatcherOverride>;
  alertUser: Record<string, AlertUserState>;
  selectedAlertId: string | null;
  responseTab: ResponseTab;
  logFilter: string | null;      // equipment id
  viewer: ViewerTarget | null;
  viewerExpanded: boolean;
  layout: Layout;
  prevLayout: Layout | null;
  theme: 'light' | 'dark';
  nav: Nav;
  sitrepVersions: SitrepVersion[];
  activityTask: string | null;
  knowledgeDoc: string | null;
  recordsView: 'current' | 'history';
  historyId: string | null;

  advance: () => void;
  stepBack: () => void;
  reset: () => void;
  setAutoplay: (v: boolean) => void;
  addEquipment: (id: string) => void;
  removeEquipment: (id: string) => void;
  setWatcher: (id: string, o: WatcherOverride) => void;
  selectAlert: (id: string | null) => void;
  markRead: (id: string) => void;
  acknowledge: (id: string) => void;
  recordDecision: (id: string, d: Decision) => void;
  addReport: (id: string, r: FieldReport) => void;
  setReportStatus: (alertId: string, reportId: string, status: ExecutionStatus) => void;
  setResponseTab: (t: ResponseTab) => void;
  setLogFilter: (id: string | null) => void;
  openViewer: (t: ViewerTarget) => void;
  closeViewer: () => void;
  setViewerExpanded: (v: boolean) => void;
  setLayout: (patch: Partial<Layout>) => void;
  maximize: (w: WindowId | null) => void;
  swapSides: () => void;
  setTheme: (t: 'light' | 'dark') => void;
  setNav: (n: Nav) => void;
  setActivityTask: (id: string | null) => void;
  setKnowledgeDoc: (id: string | null) => void;
  setRecordsView: (v: 'current' | 'history', id?: string | null) => void;
  sitrepStartReview: (basedOn: SitrepVersion['fields'], step: number, by: string, id: string) => void;
  sitrepEdit: (id: string, fields: Partial<SitrepVersion['fields']>) => void;
  sitrepApprove: (id: string, by: string) => void;
}

function au(s: Pick<State, 'alertUser'>, id: string): AlertUserState { return s.alertUser[id] ?? { reports: [] }; }

const DEFAULT_LAYOUT: Layout = { monitoringSide: 'left', splitX: 0.56, splitY: 0.6, splitDoc: 0.45, maximized: null, focus: null };

function freshEmergency() {
  return { startedAt: Date.now(), revealedAt: [0], autoplay: false, dashboard: [...DEFAULT_DASHBOARD], watcherOverrides: {}, alertUser: {}, selectedAlertId: null, logFilter: null, viewer: null, viewerExpanded: false, sitrepVersions: [], activityTask: null, knowledgeDoc: null, recordsView: 'current' as const, historyId: null };
}

export const useStore = create<State>()(persist((set, get) => ({
  ...freshEmergency(),
  responseTab: 'response',
  layout: DEFAULT_LAYOUT,
  prevLayout: null,
  theme: 'light',
  nav: 'situation',

  advance: () => {
    const { revealedAt, startedAt } = get();
    const k = revealedAt.length;
    if (k >= STEP_COUNT) { set({ autoplay: false }); return; }
    const now = Date.now();
    // The step begins now; its events become visible as the clock reaches each timestamp.
    // If the demo is ahead of the step's nominal time, the clock jumps forward (1 s margin
    // so the displayed minute never lags the step).
    const nominal = STEPS[k].nominalOffsetMin * 60_000;
    let elapsed = now - startedAt;
    let nextStart = startedAt;
    if (elapsed < nominal) { nextStart = now - nominal - 1000; elapsed = nominal + 1000; }
    const dash = get().dashboard;
    const add = (STEPS[k].addEquipment ?? []).filter((id) => !dash.includes(id));
    set({ startedAt: nextStart, revealedAt: [...revealedAt, elapsed], dashboard: add.length ? [...dash, ...add] : dash });
  },
  stepBack: () => {
    const { revealedAt, selectedAlertId } = get();
    if (revealedAt.length <= 1) return;
    const remaining = revealedAt.length - 1;
    const stillRevealed = selectedAlertId ? STEPS.slice(0, remaining).some((st) => st.alerts.some((a) => a.id === selectedAlertId)) : false;
    set({ revealedAt: revealedAt.slice(0, -1), autoplay: false, viewer: null, viewerExpanded: false, selectedAlertId: stillRevealed ? selectedAlertId : null });
  },
  reset: () => set({ ...freshEmergency() }),
  setAutoplay: (v) => set({ autoplay: v }),
  addEquipment: (id) => set((s) => (s.dashboard.includes(id) ? {} : { dashboard: [...s.dashboard, id] })),
  removeEquipment: (id) => set((s) => ({ dashboard: s.dashboard.filter((x) => x !== id), logFilter: s.logFilter === id ? null : s.logFilter })),
  setWatcher: (id, o) => set((s) => ({ watcherOverrides: { ...s.watcherOverrides, [id]: { ...s.watcherOverrides[id], ...o } } })),
  selectAlert: (id) => set((s) => ({ selectedAlertId: id, alertUser: id ? { ...s.alertUser, [id]: { ...au(s, id), readAt: s.alertUser[id]?.readAt ?? Date.now() } } : s.alertUser })),
  markRead: (id) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), readAt: s.alertUser[id]?.readAt ?? Date.now() } } })),
  acknowledge: (id) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), ackAt: Date.now() } } })),
  recordDecision: (id, d) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), decision: d } } })),
  addReport: (id, r) => set((s) => ({ alertUser: { ...s.alertUser, [id]: { ...au(s, id), reports: [...au(s, id).reports, r] } } })),
  setReportStatus: (alertId, reportId, status) => set((s) => ({ alertUser: { ...s.alertUser, [alertId]: { ...au(s, alertId), reports: au(s, alertId).reports.map((r) => (r.id === reportId ? { ...r, status } : r)) } } })),
  setResponseTab: (t) => set({ responseTab: t }),
  setLogFilter: (id) => set({ logFilter: id }),
  openViewer: (t) => set({ viewer: t }),
  closeViewer: () => set({ viewer: null, viewerExpanded: false }),
  setViewerExpanded: (v) => set({ viewerExpanded: v }),
  setLayout: (patch) => set((s) => ({ layout: { ...s.layout, ...patch } })),
  maximize: (w) => set((s) => {
    if (w) return { prevLayout: s.layout.maximized ? s.prevLayout : s.layout, layout: { ...s.layout, maximized: w } };
    return { layout: { ...(s.prevLayout ?? s.layout), maximized: null }, prevLayout: null };
  }),
  swapSides: () => set((s) => ({ layout: { ...s.layout, monitoringSide: s.layout.monitoringSide === 'left' ? 'right' : 'left' } })),
  setTheme: (t) => set({ theme: t }),
  setNav: (n) => set({ nav: n }),
  setActivityTask: (id) => set({ activityTask: id }),
  setKnowledgeDoc: (id) => set({ knowledgeDoc: id }),
  setRecordsView: (v, id = null) => set({ recordsView: v, historyId: id }),
  sitrepStartReview: (basedOn, step, by, id) => set((s) => ({ sitrepVersions: [...s.sitrepVersions, { id, number: s.sitrepVersions.length + 1, createdAt: Date.now(), status: 'review', author: by, basedOnStep: step, fields: { ...basedOn } }] })),
  sitrepEdit: (id, fields) => set((s) => ({ sitrepVersions: s.sitrepVersions.map((v) => (v.id === id && v.status !== 'approved' ? { ...v, fields: { ...v.fields, ...fields } } : v)) })),
  sitrepApprove: (id, by) => set((s) => ({ sitrepVersions: s.sitrepVersions.map((v) => (v.id === id ? { ...v, status: 'approved', approvedBy: by, approvedAt: Date.now() } : v)) })),
}), {
  name: 'ecc-v2',
  version: 1,
  partialize: (s) => {
    const { advance: _a, ...rest } = s;
    void _a;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (typeof v !== 'function') data[k] = v;
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
