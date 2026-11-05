import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEcc } from '../domain/store';
import type { DiagramView, ViewId } from '../domain/types';
import { ToastHost } from './components/Toast';
import { Dialog } from './components/Dialog';
import { Sidebar } from './shell/Sidebar';
import { IncidentHeader } from './shell/IncidentHeader';
import { ProfileDialog } from './shell/ProfileDialog';
import { Rail } from './rail/Rail';
import { Situation } from './views/Situation';
import { Assets } from './views/Assets';
import { Information } from './views/Information';
import { Actions } from './views/Actions';
import { Report } from './views/Report';
import { Activity } from './views/Activity';
import { Knowledge } from './views/Knowledge';
import { Admin } from './views/Admin';
import { SettingsView } from './views/Settings';
import { TrainingControls } from './training/TrainingControls';
import { FieldUpdateForm } from './forms/FieldUpdateForm';
import { ExpandedViewer } from './viewer/ExpandedViewer';
import { MonitoringPanel } from './monitoring/MonitoringPanel';
import { useSettings, type Settings } from './settings';

/** Workspace selections that are not part of the incident record. */
export interface Workspace {
  assets: { selected?: string; view: DiagramView; highlight: string[] };
  knowledge: { docId?: string; rev?: string; sectionId?: string; query: string };
  activity: { level: 'tasks' | 'records'; taskId?: string; stepId?: string; highlight: string[] };
  admin: { section: string };
  actions: { selected?: string };
  information: { tab: 'reports' | 'questions' | 'timeline' };
}

interface UiApi {
  openFieldUpdate: (actionId?: string) => void;
  openTraining: () => void;
  openProfile: () => void;
  /** Open an original in the focused full-area viewer. */
  openSource: (id: string, rev?: string) => void;
  openMonitoring: () => void;
  /** Open a sheet in Assets & Areas, highlighting the tags a citation refers to. */
  openSheet: (view: DiagramView, tags?: string[], selected?: string) => void;
  openAsset: (id: string) => void;
  openKnowledge: (docId?: string, rev?: string, sectionId?: string) => void;
  /** Open Agent activity on the execution records with the given records highlighted, or the task overview. */
  openActivity: (execIds?: string[]) => void;
  openAction: (id: string) => void;
  openInformation: (tab: Workspace['information']['tab']) => void;
  openAdmin: (section: string) => void;
  ws: Workspace;
  setWs: (patch: Partial<Workspace>) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}
const UiCtx = createContext<UiApi | null>(null);
export function useUi() {
  const c = useContext(UiCtx);
  if (!c) throw new Error('useUi outside App');
  return c;
}

const INITIAL_WS: Workspace = {
  assets: { view: 'pid', highlight: [] },
  knowledge: { query: '' },
  activity: { level: 'tasks', highlight: [] },
  admin: { section: 'overview' },
  actions: {},
  information: { tab: 'reports' },
};

export function App() {
  const { state, dispatch } = useEcc();
  const { settings, update } = useSettings();
  const [training, setTraining] = useState(false);
  const [profile, setProfile] = useState(false);
  const [fieldUpdate, setFieldUpdate] = useState<{ open: boolean; actionId?: string }>({ open: false });
  const [source, setSource] = useState<{ id: string; rev?: string } | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [ws, setWsState] = useState<Workspace>(INITIAL_WS);
  const [navOpen, setNavOpen] = useState(false);

  const go = useCallback((view: ViewId) => dispatch({ type: 'NAVIGATE', view }), [dispatch]);
  const setWs = useCallback((patch: Partial<Workspace>) => setWsState((w) => ({ ...w, ...patch })), []);

  const api = useMemo<UiApi>(
    () => ({
      openFieldUpdate: (actionId) => setFieldUpdate({ open: true, actionId }),
      openTraining: () => setTraining(true),
      openProfile: () => setProfile(true),
      openSource: (id, rev) => setSource({ id, rev }),
      openMonitoring: () => setMonitoring(true),
      openSheet: (view, tags = [], selected) => {
        setWsState((w) => ({ ...w, assets: { view, highlight: tags, selected: selected ?? w.assets.selected } }));
        go('assets');
      },
      openAsset: (id) => {
        setWsState((w) => ({ ...w, assets: { ...w.assets, selected: id } }));
        go('assets');
      },
      openKnowledge: (docId, rev, sectionId) => {
        setWsState((w) => ({ ...w, knowledge: { ...w.knowledge, docId: docId ?? w.knowledge.docId, rev, sectionId } }));
        go('knowledge');
      },
      openActivity: (execIds = []) => {
        setWsState((w) => ({ ...w, activity: { ...w.activity, level: execIds.length ? 'records' : w.activity.level, highlight: execIds, stepId: execIds[0] ?? w.activity.stepId } }));
        go('activity');
      },
      openAction: (id) => {
        setWsState((w) => ({ ...w, actions: { selected: id } }));
        go('actions');
      },
      openInformation: (tab) => {
        setWsState((w) => ({ ...w, information: { tab } }));
        go('information');
      },
      openAdmin: (section) => {
        setWsState((w) => ({ ...w, admin: { section } }));
        go('admin');
      },
      ws,
      setWs,
      settings,
      updateSettings: update,
    }),
    [go, ws, setWs, settings, update],
  );
  const closeTraining = useCallback(() => setTraining(false), []);
  const closeProfile = useCallback(() => setProfile(false), []);
  const closeFieldUpdate = useCallback(() => setFieldUpdate({ open: false }), []);
  const closeSource = useCallback(() => setSource(null), []);
  const closeMonitoring = useCallback(() => setMonitoring(false), []);

  // Esc closes the panel when no dialog is open.
  const dialogOpen = training || fieldUpdate.open || profile || !!source || monitoring;
  useEffect(() => {
    if (!state.rail.open || dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'RAIL_CLOSE' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.rail.open, dialogOpen, dispatch]);

  // A new destination starts at the top and closes the narrow-width navigation.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setNavOpen(false);
  }, [state.view]);

  const sidebarClass = settings.sidebar === 'collapsed' ? 'nav-collapsed' : settings.sidebar === 'expanded' ? 'nav-expanded' : 'nav-auto';

  return (
    <UiCtx.Provider value={api}>
      <div className={`app view-${state.view} ${state.rail.open ? 'panel-open' : ''} ${sidebarClass} ${navOpen ? 'nav-drawer-open' : ''}`}>
        <Sidebar drawerOpen={navOpen} onCloseDrawer={() => setNavOpen(false)} />
        <div className="frame">
          <IncidentHeader onOpenNav={() => setNavOpen(true)} />
          <div className="workspace">
            <main id="main" className={`main view-${state.view}`} tabIndex={-1} ref={mainRef}>
              {state.view === 'situation' && <Situation />}
              {state.view === 'assets' && <Assets />}
              {state.view === 'information' && <Information />}
              {state.view === 'actions' && <Actions />}
              {state.view === 'reports' && <Report />}
              {state.view === 'activity' && <Activity />}
              {state.view === 'knowledge' && <Knowledge />}
              {state.view === 'admin' && <Admin />}
              {state.view === 'settings' && <SettingsView />}
            </main>
            <Rail />
          </div>
        </div>
        <ToastHost />
        {training && <TrainingControls onClose={closeTraining} />}
        {profile && <ProfileDialog onClose={closeProfile} />}
        {fieldUpdate.open && (
          <Dialog title="Record field update" onClose={closeFieldUpdate} className="dialog-form">
            <FieldUpdateForm initialActionId={fieldUpdate.actionId} onDone={closeFieldUpdate} />
          </Dialog>
        )}
        {monitoring && <MonitoringPanel onClose={closeMonitoring} />}
        {source && <ExpandedViewer key={`${source.id}:${source.rev ?? ''}`} id={source.id} rev={source.rev} onClose={closeSource} />}
      </div>
    </UiCtx.Provider>
  );
}
